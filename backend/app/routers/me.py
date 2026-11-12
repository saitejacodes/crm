"""Endpoints for a logged-in member (the member portal / future mobile app)."""
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import require
from ..db import get_db
from ..models import Attendance, Member, Membership, Payment, Plan, User
from ..schemas import AttendanceOut, CheckinIn, MemberOut, MembershipOut, PaymentOut, UpiSubmitIn, WorkoutOut
from ..serializers import attendance_out, member_out, membership_out, payment_out
from ..pricing import apply_quote, quote as price_quote
from ..services import checkin_token_valid, get_gym, require_found, today
from .attendance import do_checkin
from .members import workout_out

router = APIRouter(prefix="/api/me", tags=["member portal"])


def _member(user: User) -> Member:
    if not user.member:
        raise HTTPException(404, "No member profile")
    return user.member


@router.get("", response_model=MemberOut)
def my_profile(user: User = Depends(require("member")), db: Session = Depends(get_db)):
    return member_out(_member(user), get_gym(db).expiry_alert_days)


@router.get("/memberships", response_model=list[MembershipOut])
def my_memberships(user: User = Depends(require("member")), db: Session = Depends(get_db)):
    m = _member(user)
    rows = db.scalars(select(Membership).where(Membership.member_id == m.id).order_by(Membership.id.desc()))
    return [membership_out(x) for x in rows]


@router.get("/payments", response_model=list[PaymentOut])
def my_payments(user: User = Depends(require("member")), db: Session = Depends(get_db)):
    m = _member(user)
    return [payment_out(p) for p in db.scalars(select(Payment).where(Payment.member_id == m.id).order_by(Payment.id.desc()))]


@router.get("/upi/{plan_id}")
def upi_link(plan_id: int, code: str | None = None, user: User = Depends(require("member")),
             db: Session = Depends(get_db)):
    """UPI deep link with the exact amount pre-filled; the app renders it as a QR / Pay button."""
    gym = get_gym(db)
    if not gym.upi_id:
        raise HTTPException(400, "Online payment isn't set up yet. Please pay at the front desk.")
    plan = require_found(db.get(Plan, plan_id), "Plan")
    if not plan.is_active:
        raise HTTPException(400, "This plan is no longer available")
    m = _member(user)
    q = price_quote(db, plan, m, today(), code)
    note = f"{m.code} {plan.name}"[:50]
    link = (f"upi://pay?pa={quote(gym.upi_id)}&pn={quote(gym.upi_payee_name or gym.gym_name)}"
            f"&am={q.price}.00&cu=INR&tn={quote(note)}")
    return {"link": link, "amount": q.price, "list_price": q.list_price, "discount": q.discount,
            "offer_name": q.offer_name, "upi_id": gym.upi_id, "payee": gym.upi_payee_name or gym.gym_name, "note": note}


@router.post("/payments", response_model=PaymentOut, status_code=201)
def submit_upi_payment(body: UpiSubmitIn, user: User = Depends(require("member")), db: Session = Depends(get_db)):
    m = _member(user)
    plan = require_found(db.get(Plan, body.plan_id), "Plan")
    if not plan.is_active:
        raise HTTPException(400, "This plan is no longer available")
    if db.scalar(select(Payment).where(Payment.utr == body.utr)):
        raise HTTPException(409, "This UTR / reference number was already submitted")
    if db.scalar(select(Payment).where(Payment.member_id == m.id, Payment.status == "pending")):
        raise HTTPException(409, "You already have a payment waiting for verification")
    q = price_quote(db, plan, m, today(), body.code)
    ms = Membership(member_id=m.id, plan_id=plan.id, status="pending")
    apply_quote(ms, q)
    ms.plan = plan
    db.add(ms)
    db.flush()
    p = Payment(member_id=m.id, membership_id=ms.id, amount=q.price, method="upi", utr=body.utr, status="pending")
    p.member, p.membership = m, ms
    db.add(p)
    db.commit()
    return payment_out(p)


@router.get("/attendance", response_model=list[AttendanceOut])
def my_attendance(user: User = Depends(require("member")), db: Session = Depends(get_db)):
    m = _member(user)
    rows = db.scalars(select(Attendance).where(Attendance.member_id == m.id).order_by(Attendance.day.desc()).limit(120))
    return [attendance_out(a) for a in rows]


@router.post("/checkin")
def checkin(body: CheckinIn, user: User = Depends(require("member")), db: Session = Depends(get_db)):
    gym = get_gym(db)
    if not checkin_token_valid(gym.checkin_secret, body.token):
        raise HTTPException(400, "This QR code has expired. Please scan the screen again.")
    a, created = do_checkin(db, _member(user), "qr")
    return {"created": created, "attendance": attendance_out(a)}


@router.get("/workout", response_model=WorkoutOut)
def my_workout(user: User = Depends(require("member")), db: Session = Depends(get_db)):
    return workout_out(db, _member(user).id)
