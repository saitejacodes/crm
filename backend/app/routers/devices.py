from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .. import device as dev
from ..auth import STAFF, require
from ..db import get_db
from ..models import Device, Member, Membership, Punch, User
from ..schemas import DeviceIn, DeviceOut
from ..services import require_found

# ---------- what the fingerprint machine talks to (no login; identified by serial) ----------
iclock = APIRouter(prefix="/iclock", tags=["fingerprint machine"])


def _text(s: str) -> PlainTextResponse:
    return PlainTextResponse(s)


@iclock.get("/cdata")
def handshake(SN: str, db: Session = Depends(get_db)):
    d = dev.get_device(db, SN)
    db.commit()
    return _text(dev.handshake_text(d))


@iclock.post("/cdata")
async def upload(request: Request, SN: str, table: str = "", Stamp: str | None = None,
                 OpStamp: str | None = None, db: Session = Depends(get_db)):
    body = (await request.body()).decode("utf-8", errors="replace")
    d = dev.get_device(db, SN)
    if not d.is_active:  # not approved by the owner yet: accept and drop
        db.commit()
        return _text("OK")
    n = 0
    if table == "ATTLOG":
        n = dev.handle_attlog(db, d, body)
        if Stamp:
            d.attlog_stamp = Stamp
    elif table == "OPERLOG":
        n = dev.handle_operlog(db, d, body)
        if OpStamp or Stamp:
            d.operlog_stamp = OpStamp or Stamp
    db.commit()
    return _text(f"OK: {n}")


@iclock.get("/getrequest")
def getrequest(SN: str, db: Session = Depends(get_db)):
    d = dev.get_device(db, SN)
    out = dev.next_commands(db, d) if d.is_active else "OK"
    db.commit()
    return _text(out)


@iclock.post("/devicecmd")
async def devicecmd(request: Request, SN: str, db: Session = Depends(get_db)):
    body = (await request.body()).decode("utf-8", errors="replace")
    d = dev.get_device(db, SN)
    dev.handle_cmd_results(db, d, body)
    db.commit()
    return _text("OK")


# ---------- owner screens ----------
router = APIRouter(prefix="/api/devices", tags=["fingerprint machine"])


@router.get("", response_model=list[DeviceOut])
def list_devices(_: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    return [dev.device_summary(db, d) for d in db.scalars(select(Device).order_by(Device.id))]


@router.post("", response_model=DeviceOut, status_code=201)
def add_device(body: DeviceIn, _: User = Depends(require("owner")), db: Session = Depends(get_db)):
    d = db.scalar(select(Device).where(Device.serial == body.serial.strip()))
    if d and d.is_active:
        raise HTTPException(409, "This machine is already added")
    if d is None:
        d = Device(serial=body.serial.strip())
        db.add(d)
    d.name, d.is_active = body.name, True
    db.flush()
    dev.push_all_members(db, d)
    db.commit()
    return dev.device_summary(db, d)


@router.delete("/{device_id}")
def remove_device(device_id: int, _: User = Depends(require("owner")), db: Session = Depends(get_db)):
    d = require_found(db.get(Device, device_id), "Machine")
    d.is_active = False
    db.commit()
    return {"ok": True}


@router.post("/sync")
def sync_now(_: User = Depends(require("owner")), db: Session = Depends(get_db)):
    """Check every member's plan now and queue add/remove commands."""
    r = dev.sweep(db)
    db.commit()
    return r


@router.get("/punches")
def recent_punches(limit: int = 50, _: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    rows = db.scalars(select(Punch).order_by(Punch.punched_at.desc()).limit(min(limit, 500)))
    out = []
    for p in rows:
        m = db.get(Member, p.member_id) if p.member_id else None
        out.append({"id": p.id, "pin": p.pin, "member_id": p.member_id, "member_name": m.user.name if m else None,
                    "member_code": m.code if m else None, "punched_at": p.punched_at, "result": p.result})
    return out


@router.get("/attention")
def needs_attention(_: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    """Members whose plan ended but who can't be removed yet (no fingerprint backup),
    and paid members who have never given a fingerprint."""
    members = db.scalars(select(Member).options(
        selectinload(Member.user), selectinload(Member.templates),
        selectinload(Member.memberships).selectinload(Membership.plan))).all()
    stuck, not_enrolled = [], []
    for m in members:
        has_access = dev.should_have_access(m)
        if not has_access and m.device_enabled and not m.templates:
            stuck.append({"id": m.id, "code": m.code, "name": m.user.name, "pin": dev.pin_of(m)})
        if has_access and not m.templates:
            not_enrolled.append({"id": m.id, "code": m.code, "name": m.user.name, "pin": dev.pin_of(m)})
    return {"cannot_block": stuck, "not_enrolled": not_enrolled}
