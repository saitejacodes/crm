"""Business rules shared by routers."""
import hashlib
import hmac
import secrets
import time
from datetime import date, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .config import settings
from .models import GymSettings, Member, Membership, Payment


def now_local() -> datetime:
    return datetime.now(settings.tz).replace(tzinfo=None)


def today() -> date:
    return now_local().date()


def get_gym(db: Session) -> GymSettings:
    gym = db.scalar(select(GymSettings).limit(1))
    if gym is None:
        gym = GymSettings(checkin_secret=secrets.token_hex(32), gym_name=settings.gym_name,
                          phone=settings.gym_phone, address=settings.gym_address, timings=settings.gym_timings,
                          upi_payee_name=settings.gym_name)
        db.add(gym)
        db.commit()
    return gym


def current_membership(member: Member, on: date | None = None) -> Membership | None:
    """The active membership covering `on`, else the latest active one."""
    on = on or today()
    active = [m for m in member.memberships if m.status == "active" and m.end_date]
    covering = [m for m in active if m.start_date <= on <= m.end_date]
    if covering:
        return max(covering, key=lambda m: m.end_date)
    return max(active, key=lambda m: m.end_date, default=None)


def member_status(member: Member, alert_days: int = 7) -> dict:
    """Returns status: active | expiring | expired | new (never paid)."""
    t = today()
    m = current_membership(member, t)
    if m is None:
        return {"status": "new", "end_date": None, "days_left": None, "plan": None}
    # follow back-to-back renewals to get the real "paid till" date
    end = m.end_date
    by_start = {x.start_date: x for x in member.memberships if x.status == "active" and x.start_date}
    while (nxt := by_start.get(end + timedelta(days=1))) is not None:
        end = nxt.end_date
    days_left = (end - t).days
    if m.start_date > t:
        st = "active"  # renewed in advance, starts later
    elif days_left < 0:
        st = "expired"
    elif days_left <= alert_days:
        st = "expiring"
    else:
        st = "active"
    return {"status": st, "end_date": end, "days_left": days_left, "plan": m.plan.name}


def activate_membership(db: Session, ms: Membership) -> None:
    """Start right after the member's latest active period ends, or today if lapsed."""
    if ms.status == "active":
        return
    latest_end = db.scalar(
        select(func.max(Membership.end_date)).where(
            Membership.member_id == ms.member_id, Membership.status == "active"
        )
    )
    start = today()
    if latest_end and latest_end >= start:
        start = latest_end + timedelta(days=1)
    ms.start_date = start
    ms.end_date = start + timedelta(days=ms.plan.duration_days - 1)
    ms.status = "active"


def next_receipt_no(db: Session) -> str:
    n = db.scalar(select(func.count()).select_from(Payment).where(Payment.receipt_no.is_not(None))) or 0
    return f"R{today():%y%m}-{n + 1:05d}"


def next_member_code(db: Session) -> str:
    n = db.scalar(select(func.max(Member.id))) or 0
    return f"M{n + 1:04d}"


def mark_verified(db: Session, payment: Payment, by_user_id: int) -> None:
    payment.status = "verified"
    payment.verified_by = by_user_id
    payment.verified_at = now_local()
    payment.receipt_no = next_receipt_no(db)
    if payment.membership is not None:
        activate_membership(db, payment.membership)


# ---- rotating check-in token shown on the gym's kiosk screen ----

def checkin_token(secret: str, at: float | None = None) -> str:
    window = int((at if at is not None else time.time()) // settings.checkin_window_seconds)
    return hmac.new(secret.encode(), str(window).encode(), hashlib.sha256).hexdigest()[:16]


def checkin_token_valid(secret: str, token: str) -> bool:
    t = time.time()
    w = settings.checkin_window_seconds
    # accept current and previous window so a QR scanned at the edge still works
    return any(hmac.compare_digest(token, checkin_token(secret, t - k * w)) for k in (0, 1))


def require_found(obj, what: str = "Item"):
    if obj is None:
        raise HTTPException(404, f"{what} not found")
    return obj
