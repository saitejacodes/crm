from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..auth import STAFF, STAFF_TRAINER, require
from ..config import settings
from ..db import get_db
from ..models import Attendance, Member, Membership, User
from ..schemas import AttendanceOut
from ..serializers import attendance_out
from ..services import checkin_token, get_gym, member_status, now_local, require_found, today

router = APIRouter(prefix="/api/attendance", tags=["attendance"])


def do_checkin(db: Session, member: Member, method: str) -> tuple[Attendance, bool]:
    """Returns (attendance, created). Blocks expired / never-paid / disabled members."""
    if not member.user.is_active:
        raise HTTPException(403, "Account disabled. Please contact the front desk.")
    st = member_status(member)
    if st["status"] in ("expired", "new"):
        raise HTTPException(402, "Membership expired. Please renew to check in.")
    t = today()
    existing = db.scalar(select(Attendance).where(Attendance.member_id == member.id, Attendance.day == t))
    if existing:
        return existing, False
    a = Attendance(member_id=member.id, day=t, check_in_at=now_local(), method=method)
    a.member = member
    db.add(a)
    try:
        db.commit()
    except IntegrityError:  # double tap race
        db.rollback()
        return db.scalar(select(Attendance).where(Attendance.member_id == member.id, Attendance.day == t)), False
    return a, True


@router.get("", response_model=list[AttendanceOut])
def list_attendance(day: date | None = None, _: User = Depends(require(*STAFF_TRAINER)),
                    db: Session = Depends(get_db)):
    d = day or today()
    q = (select(Attendance).options(selectinload(Attendance.member).selectinload(Member.user))
         .where(Attendance.day == d).order_by(Attendance.check_in_at.desc()))
    return [attendance_out(a) for a in db.scalars(q)]


@router.post("/manual/{member_id}", response_model=AttendanceOut)
def manual_checkin(member_id: int, _: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    m = require_found(db.get(Member, member_id), "Member")
    a, _created = do_checkin(db, m, "manual")
    return attendance_out(a)


@router.get("/kiosk-token")
def kiosk_token(_: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    """Shown as a QR on a screen at the gym entrance. Rotates every minute."""
    gym = get_gym(db)
    return {"token": checkin_token(gym.checkin_secret), "rotates_in_seconds": settings.checkin_window_seconds,
            "gym_name": gym.gym_name}
