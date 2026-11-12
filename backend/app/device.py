"""Fingerprint machine sync over the eSSL / ZKTeco ADMS ("push" / iclock) protocol.

The machine calls us (no static IP or PC needed at the gym):
  GET  /iclock/cdata?SN=..            handshake, we reply with options
  POST /iclock/cdata?SN=..&table=ATTLOG    punches  -> attendance
  POST /iclock/cdata?SN=..&table=OPERLOG   user + fingerprint enrolments -> template backup
  GET  /iclock/getrequest?SN=..       it polls for commands (add / remove members)
  POST /iclock/devicecmd?SN=..        it reports command results

Member PIN on the machine = member id (M0007 -> 7).
Access rule: paid up -> user + fingerprints pushed to machine; expired / disabled -> user deleted
from machine. Fingerprints are kept in our DB and pushed back on renewal, so members never
re-enrol. We only remove someone once we hold a backup of their fingerprint.
"""
from datetime import datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Attendance, Device, DeviceCommand, FingerTemplate, Member, Punch
from .services import member_status, now_local

SWEEP_EVERY = timedelta(hours=1)
ONLINE_WITHIN = timedelta(minutes=5)


def pin_of(member: Member) -> str:
    return str(member.id)


def _clean(v: str) -> str:
    return v.replace("\t", " ").replace("\n", " ").replace("\r", " ")


def active_devices(db: Session) -> list[Device]:
    return list(db.scalars(select(Device).where(Device.is_active.is_(True))))


def queue(db: Session, member: Member | None, command: str, devices: list[Device] | None = None) -> None:
    for d in devices if devices is not None else active_devices(db):
        db.add(DeviceCommand(device_id=d.id, member_id=member.id if member else None, command=command))


def enable_commands(member: Member) -> list[str]:
    pin = pin_of(member)
    cmds = [f"DATA UPDATE USERINFO PIN={pin}\tName={_clean(member.user.name)[:24]}\tPri=0\tPasswd=\tCard=\tGrp=1\tTZ=0000000000000000\tVerify=0"]
    for t in member.templates:
        table = "FINGERTMP" if t.kind == "FP" else "BIODATA"
        cmds.append(f"DATA UPDATE {table} {t.raw}")
    return cmds


def should_have_access(member: Member) -> bool:
    return member.user.is_active and member_status(member)["status"] in ("active", "expiring")


def sync_member(db: Session, member: Member, devices: list[Device] | None = None) -> str:
    """Bring the machine in line with the member's plan. Returns what happened:
    enabled | disabled | unchanged | needs_fingerprint_backup | no_device"""
    devices = devices if devices is not None else active_devices(db)
    if not devices:
        return "no_device"
    want = should_have_access(member)
    if want and member.device_enabled is not True:
        for c in enable_commands(member):
            queue(db, member, c, devices)
        member.device_enabled = True
        return "enabled"
    if not want and member.device_enabled is True:
        if not member.templates:
            # Deleting now would wipe a fingerprint we can't restore; keep them and flag it.
            return "needs_fingerprint_backup"
        queue(db, member, f"DATA DELETE USERINFO PIN={pin_of(member)}", devices)
        member.device_enabled = False
        return "disabled"
    return "unchanged"


def sweep(db: Session) -> dict:
    """Daily expiry pass (run lazily from device polls, or on demand)."""
    devices = active_devices(db)
    counts: dict[str, int] = {}
    for m in db.scalars(select(Member)):
        r = sync_member(db, m, devices)
        counts[r] = counts.get(r, 0) + 1
    return counts


def push_all_members(db: Session, device: Device) -> int:
    """New machine: load every paid-up member onto it."""
    n = 0
    for m in db.scalars(select(Member)):
        if should_have_access(m):
            for c in enable_commands(m):
                queue(db, m, c, [device])
            m.device_enabled = True
            n += 1
    return n


# ---------------- protocol handlers ----------------

def get_device(db: Session, serial: str) -> Device:
    """Unknown machines are recorded as inactive until the owner approves them."""
    d = db.scalar(select(Device).where(Device.serial == serial))
    if d is None:
        d = Device(serial=serial, name="New machine", is_active=False)
        db.add(d)
    d.last_seen = now_local()
    db.flush()
    return d


def handshake_text(d: Device) -> str:
    return "\n".join([
        f"GET OPTION FROM: {d.serial}",
        f"ATTLOGStamp={d.attlog_stamp}",
        f"OPERLOGStamp={d.operlog_stamp}",
        "ATTPHOTOStamp=None",
        "ErrorDelay=30",
        "Delay=10",
        "TransTimes=00:00;14:05",
        "TransInterval=1",
        "TransFlag=TransData AttLog\tOpLog\tEnrollUser\tChgUser\tEnrollFP\tChgFP",
        "Realtime=1",
        "Encrypt=None",
    ]) + "\n"


def _kv(body: str) -> dict[str, str]:
    out = {}
    for part in body.split("\t"):
        if "=" in part:
            k, v = part.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def handle_attlog(db: Session, d: Device, text: str) -> int:
    n = 0
    seen: set[tuple[int, object]] = set()
    for line in text.splitlines():
        parts = line.strip().split("\t")
        if len(parts) < 2 or not parts[0]:
            continue
        pin, ts = parts[0].strip(), parts[1].strip()
        try:
            at = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        n += 1
        member = db.get(Member, int(pin)) if pin.isdigit() else None
        if member is None:
            db.add(Punch(device_id=d.id, pin=pin, punched_at=at, result="unknown"))
            continue
        if member.device_enabled is None:
            member.device_enabled = True  # enrolled on the machine before this app: it is on there
        if not member.user.is_active:
            result = "disabled"
        elif member_status(member)["status"] in ("expired", "new"):
            result = "expired"
        else:
            result = "ok"
        db.add(Punch(device_id=d.id, pin=pin, member_id=member.id, punched_at=at, result=result))
        key = (member.id, at.date())
        if result == "ok" and key not in seen:
            seen.add(key)
            exists = db.scalar(select(Attendance).where(Attendance.member_id == member.id, Attendance.day == at.date()))
            if not exists:
                db.add(Attendance(member_id=member.id, day=at.date(), check_in_at=at, method="finger"))
    return n


def handle_operlog(db: Session, d: Device, text: str) -> int:
    n = 0
    for line in text.splitlines():
        line = line.strip()
        head, _, body = line.partition(" ")
        kv = _kv(body)
        pin = kv.get("PIN") or kv.get("Pin")
        if not pin or not pin.isdigit():
            continue
        member = db.get(Member, int(pin))
        if member is None:
            continue
        if head == "USER":
            # enrolled directly on the machine: it is on the device now
            member.device_enabled = True
            n += 1
        elif head in ("FP", "BIODATA"):
            fid = int(kv.get("FID") or kv.get("No") or 0)
            kind = "FP" if head == "FP" else "BIODATA"
            t = db.scalar(select(FingerTemplate).where(FingerTemplate.member_id == member.id, FingerTemplate.fid == fid))
            if t is None:
                t = FingerTemplate(member_id=member.id, fid=fid, kind=kind, raw=body)
                db.add(t)
            else:
                t.kind, t.raw = kind, body
            if member.device_enabled is None:
                member.device_enabled = True
            n += 1
    return n


def next_commands(db: Session, d: Device, limit: int = 20) -> str:
    if d.last_sweep is None or now_local() - d.last_sweep > SWEEP_EVERY:
        d.last_sweep = now_local()
        sweep(db)
        db.flush()
    cmds = list(db.scalars(
        select(DeviceCommand).where(DeviceCommand.device_id == d.id, DeviceCommand.status == "pending")
        .order_by(DeviceCommand.id).limit(limit)
    ))
    if not cmds:
        return "OK"
    for c in cmds:
        c.status, c.sent_at = "sent", now_local()
    return "".join(f"C:{c.id}:{c.command}\n" for c in cmds)


def handle_cmd_results(db: Session, d: Device, text: str) -> int:
    n = 0
    for line in text.splitlines():
        fields = dict(p.split("=", 1) for p in line.strip().split("&") if "=" in p)
        if not fields.get("ID", "").isdigit():
            continue
        c = db.get(DeviceCommand, int(fields["ID"]))
        if c is None or c.device_id != d.id:
            continue
        code = fields.get("Return", "")
        c.return_code = code
        c.status = "done" if code.lstrip("-").isdigit() and int(code) >= 0 else "failed"
        n += 1
    return n


def device_summary(db: Session, d: Device) -> dict:
    pending = db.scalar(select(func.count()).select_from(DeviceCommand).where(
        DeviceCommand.device_id == d.id, DeviceCommand.status.in_(("pending", "sent")))) or 0
    online = d.last_seen is not None and now_local() - d.last_seen < ONLINE_WITHIN
    return {"id": d.id, "serial": d.serial, "name": d.name, "is_active": d.is_active,
            "last_seen": d.last_seen, "online": online, "pending_commands": pending}
