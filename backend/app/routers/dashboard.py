from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..auth import STAFF, current_user, require
from ..db import get_db
from ..models import Attendance, Member, Membership, Offer, Payment, Punch, User
from ..schemas import GymSettingsIn, GymSettingsOut
from ..serializers import member_out
from ..services import get_gym, today

router = APIRouter(prefix="/api", tags=["dashboard & settings"])


def _month_start(d: date, back: int = 0) -> date:
    """First day of the month `back` months before d (negative = future)."""
    idx = d.year * 12 + (d.month - 1) - back
    return date(idx // 12, idx % 12 + 1, 1)


@router.get("/dashboard")
def dashboard(user: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    gym = get_gym(db)
    t = today()
    members = db.scalars(
        select(Member).join(Member.user).where(User.is_active.is_(True)).options(
            selectinload(Member.user), selectinload(Member.trainer),
            selectinload(Member.memberships).selectinload(Membership.plan))
    ).unique().all()
    outs = [member_out(m, gym.expiry_alert_days) for m in members]
    counts = {k: 0 for k in ("active", "expiring", "expired", "new")}
    for o in outs:
        counts[o.status] += 1

    expiring = sorted([o for o in outs if o.status == "expiring"], key=lambda o: o.days_left)
    recently_expired = sorted(
        [o for o in outs if o.status == "expired" and o.days_left is not None and o.days_left >= -30],
        key=lambda o: -o.days_left,
    )
    checkins_today = db.scalar(select(func.count()).select_from(Attendance).where(Attendance.day == t)) or 0
    pending_payments = db.scalar(select(func.count()).select_from(Payment).where(Payment.status == "pending")) or 0

    data = {
        "gym_name": gym.gym_name,
        "total_members": len(outs),
        "counts": counts,
        "checkins_today": checkins_today,
        "pending_payments": pending_payments,
        "expiring": [o.model_dump(mode="json") for o in expiring[:50]],
        "recently_expired": [o.model_dump(mode="json") for o in recently_expired[:50]],
        "new_this_month": sum(1 for m in members if m.joined_on >= _month_start(t)),
    }

    if user.role == "owner":  # money numbers for the owner only
        revenue = []
        for back in range(5, -1, -1):
            s = _month_start(t, back)
            e = _month_start(t, back - 1)
            total = db.scalar(
                select(func.coalesce(func.sum(Payment.amount), 0)).where(
                    Payment.status == "verified",
                    Payment.verified_at >= datetime.combine(s, time.min),
                    Payment.verified_at < datetime.combine(e, time.min),
                )
            )
            revenue.append({"month": s.strftime("%b %Y"), "amount": int(total or 0)})
        today_rev = db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.status == "verified",
                Payment.verified_at >= datetime.combine(t, time.min),
                Payment.verified_at < datetime.combine(t + timedelta(days=1), time.min),
            )
        )
        data["revenue_by_month"] = revenue
        data["revenue_this_month"] = revenue[-1]["amount"]
        data["revenue_today"] = int(today_rev or 0)

    # fingerprint punches today from people whose plan has ended
    blocked = db.scalars(
        select(Punch).where(Punch.result.in_(("expired", "disabled")),
                            Punch.punched_at >= datetime.combine(t, time.min)).order_by(Punch.punched_at.desc())
    ).all()
    seen, blocked_out = set(), []
    for p in blocked:
        if p.member_id in seen:
            continue
        seen.add(p.member_id)
        m = db.get(Member, p.member_id)
        blocked_out.append({"member_id": m.id, "name": m.user.name, "code": m.code, "phone": m.user.phone,
                            "at": p.punched_at.isoformat()})
    data["blocked_punches_today"] = blocked_out
    data["running_offers"] = [
        {"id": o.id, "name": o.name, "ends_on": o.ends_on.isoformat(), "code": o.code}
        for o in db.scalars(select(Offer).where(Offer.is_active.is_(True), Offer.starts_on <= t, Offer.ends_on >= t))
    ]

    # attendance last 14 days
    since = t - timedelta(days=13)
    rows = db.execute(
        select(Attendance.day, func.count()).where(Attendance.day >= since).group_by(Attendance.day)
    ).all()
    by_day = {d: c for d, c in rows}
    data["attendance_14d"] = [
        {"day": (since + timedelta(days=i)).isoformat(), "count": by_day.get(since + timedelta(days=i), 0)}
        for i in range(14)
    ]
    return data


@router.get("/settings", response_model=GymSettingsOut)
def read_settings(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return get_gym(db)


@router.put("/settings", response_model=GymSettingsOut)
def write_settings(body: GymSettingsIn, _: User = Depends(require("owner")), db: Session = Depends(get_db)):
    gym = get_gym(db)
    for k, v in body.model_dump().items():
        setattr(gym, k, v)
    db.commit()
    return gym


@router.get("/public/gym")
def public_gym(db: Session = Depends(get_db)):
    gym = get_gym(db)
    return {"gym_name": gym.gym_name, "phone": gym.phone, "address": gym.address, "timings": gym.timings}
