from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import STAFF, STAFF_TRAINER, hash_password, require
from ..db import get_db
from ..models import Attendance, Member, Membership, Payment, Plan, User, WorkoutPlan
from ..schemas import (
    AttendanceOut, DeskPaymentIn, MemberCreate, MemberOut, MembershipOut, MemberUpdate,
    PaymentOut, WorkoutIn, WorkoutOut,
)
from ..device import sync_member
from ..pricing import apply_quote, manual_quote, quote
from ..serializers import attendance_out, member_out, membership_out, payment_out
from ..services import get_gym, mark_verified, next_member_code, now_local, require_found, today

router = APIRouter(prefix="/api/members", tags=["members"])

MEMBER_LOAD = (
    selectinload(Member.user),
    selectinload(Member.trainer),
    selectinload(Member.memberships).selectinload(Membership.plan),
)


def _get_member(db: Session, member_id: int, user: User) -> Member:
    m = require_found(db.get(Member, member_id), "Member")
    if user.role == "trainer" and m.trainer_id != user.id:
        raise HTTPException(403, "This member is not assigned to you")
    return m


def _validate_trainer(db: Session, trainer_id: int | None):
    if trainer_id is None:
        return
    t = db.get(User, trainer_id)
    if not t or t.role != "trainer":
        raise HTTPException(400, "Selected trainer not found")


def record_desk_payment(db: Session, member: Member, body: DeskPaymentIn, staff: User) -> Payment:
    plan = require_found(db.get(Plan, body.plan_id), "Plan")
    if body.method == "upi" and body.utr and db.scalar(select(Payment).where(Payment.utr == body.utr)):
        raise HTTPException(409, "This UTR was already used for another payment")
    if body.amount is not None and body.amount != plan.price:
        if staff.role != "owner":
            raise HTTPException(403, "Only the owner can give a custom discount. Use an offer instead.")
        q = manual_quote(plan, body.amount, body.discount_reason)
    else:
        q = quote(db, plan, member, today(), body.code)
    amount = q.price
    ms = Membership(member_id=member.id, plan_id=plan.id, status="pending")
    apply_quote(ms, q)
    ms.plan = plan
    db.add(ms)
    db.flush()
    p = Payment(member_id=member.id, membership_id=ms.id, amount=amount, method=body.method,
                utr=body.utr or None, note=body.note, status="pending")
    p.membership = ms
    db.add(p)
    db.flush()
    mark_verified(db, p, staff.id)
    db.flush()
    db.refresh(member)
    sync_member(db, member)
    return p


@router.get("", response_model=list[MemberOut])
def list_members(
    q: str | None = None,
    status: str | None = None,  # active | expiring | expired | new | inactive
    user: User = Depends(require(*STAFF_TRAINER)),
    db: Session = Depends(get_db),
):
    stmt = select(Member).join(Member.user).options(*MEMBER_LOAD).order_by(User.name)
    if user.role == "trainer":
        stmt = stmt.where(Member.trainer_id == user.id)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.name.ilike(like), User.phone.ilike(like), Member.code.ilike(like)))
    alert = get_gym(db).expiry_alert_days
    out = [member_out(m, alert) for m in db.scalars(stmt).unique()]
    if status == "inactive":
        return [m for m in out if not m.is_active]
    if status:
        out = [m for m in out if m.status == status and m.is_active]
    return out


@router.post("", response_model=MemberOut, status_code=201)
def create_member(body: MemberCreate, staff: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.phone == body.phone)):
        raise HTTPException(409, "This phone number is already registered")
    _validate_trainer(db, body.trainer_id)
    # If staff didn't set a password, the phone number is the first password;
    # the member app nudges them to change it.
    password = body.password or body.phone
    u = User(name=body.name, phone=body.phone, email=body.email,
             password_hash=hash_password(password), role="member")
    db.add(u)
    db.flush()
    m = Member(user_id=u.id, code=next_member_code(db), gender=body.gender, dob=body.dob,
               address=body.address, emergency_contact=body.emergency_contact,
               joined_on=body.joined_on or today(), trainer_id=body.trainer_id, notes=body.notes)
    m.user = u
    db.add(m)
    db.flush()
    if body.plan_id:
        record_desk_payment(
            db, m, DeskPaymentIn(plan_id=body.plan_id, method=body.payment_method or "cash", utr=body.utr), staff
        )
    db.commit()
    db.refresh(m)
    return member_out(m, get_gym(db).expiry_alert_days)


@router.get("/{member_id}", response_model=MemberOut)
def get_member(member_id: int, user: User = Depends(require(*STAFF_TRAINER)), db: Session = Depends(get_db)):
    return member_out(_get_member(db, member_id, user), get_gym(db).expiry_alert_days)


@router.patch("/{member_id}", response_model=MemberOut)
def update_member(member_id: int, body: MemberUpdate, _: User = Depends(require(*STAFF)),
                  db: Session = Depends(get_db)):
    m = require_found(db.get(Member, member_id), "Member")
    data = body.model_dump(exclude_unset=True)
    if "trainer_id" in data:
        _validate_trainer(db, data["trainer_id"])
    if data.get("phone") and data["phone"] != m.user.phone:
        if db.scalar(select(User).where(User.phone == data["phone"])):
            raise HTTPException(409, "This phone number is already registered")
    for k in ("name", "phone", "email", "is_active"):
        if k in data:
            setattr(m.user, k, data.pop(k))
    if "password" in data:
        m.user.password_hash = hash_password(data.pop("password"))
    for k, v in data.items():
        setattr(m, k, v)
    db.flush()
    sync_member(db, m)
    db.commit()
    return member_out(m, get_gym(db).expiry_alert_days)


@router.get("/{member_id}/memberships", response_model=list[MembershipOut])
def member_memberships(member_id: int, user: User = Depends(require(*STAFF_TRAINER)), db: Session = Depends(get_db)):
    m = _get_member(db, member_id, user)
    rows = db.scalars(select(Membership).where(Membership.member_id == m.id).order_by(Membership.id.desc()))
    return [membership_out(x) for x in rows]


@router.get("/{member_id}/payments", response_model=list[PaymentOut])
def member_payments(member_id: int, _: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    rows = db.scalars(select(Payment).where(Payment.member_id == member_id).order_by(Payment.id.desc()))
    return [payment_out(p) for p in rows]


@router.post("/{member_id}/payments", response_model=PaymentOut, status_code=201)
def desk_payment(member_id: int, body: DeskPaymentIn, staff: User = Depends(require(*STAFF)),
                 db: Session = Depends(get_db)):
    """Renew / add a plan, paid at the front desk by cash or UPI. Verified immediately."""
    m = require_found(db.get(Member, member_id), "Member")
    p = record_desk_payment(db, m, body, staff)
    db.commit()
    return payment_out(p)


@router.get("/{member_id}/attendance", response_model=list[AttendanceOut])
def member_attendance(member_id: int, user: User = Depends(require(*STAFF_TRAINER)), db: Session = Depends(get_db)):
    m = _get_member(db, member_id, user)
    rows = db.scalars(select(Attendance).where(Attendance.member_id == m.id).order_by(Attendance.day.desc()).limit(120))
    return [attendance_out(a) for a in rows]


def workout_out(db: Session, member_id: int) -> WorkoutOut:
    w = db.scalar(select(WorkoutPlan).where(WorkoutPlan.member_id == member_id))
    if not w:
        return WorkoutOut(member_id=member_id, trainer_id=None, trainer_name=None, updated_at=None)
    t = db.get(User, w.trainer_id) if w.trainer_id else None
    return WorkoutOut(member_id=member_id, workout=w.workout, diet=w.diet, trainer_id=w.trainer_id,
                      trainer_name=t.name if t else None, updated_at=w.updated_at)


@router.get("/{member_id}/workout", response_model=WorkoutOut)
def get_workout(member_id: int, user: User = Depends(require(*STAFF_TRAINER)), db: Session = Depends(get_db)):
    _get_member(db, member_id, user)
    return workout_out(db, member_id)


@router.put("/{member_id}/workout", response_model=WorkoutOut)
def put_workout(member_id: int, body: WorkoutIn, user: User = Depends(require(*STAFF_TRAINER)),
                db: Session = Depends(get_db)):
    _get_member(db, member_id, user)
    w = db.scalar(select(WorkoutPlan).where(WorkoutPlan.member_id == member_id))
    if not w:
        w = WorkoutPlan(member_id=member_id)
        db.add(w)
    w.workout, w.diet = body.workout, body.diet
    w.trainer_id = user.id
    w.updated_at = now_local()
    db.commit()
    return workout_out(db, member_id)
