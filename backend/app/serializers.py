from .models import Attendance, Member, Membership, Payment, User
from .schemas import AttendanceOut, MemberOut, MembershipOut, PaymentOut, UserOut
from .services import member_status


def user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id, name=u.name, phone=u.phone, email=u.email, role=u.role,
        is_active=u.is_active, member_id=u.member.id if u.member else None,
    )


def member_out(m: Member, alert_days: int = 7) -> MemberOut:
    st = member_status(m, alert_days)
    return MemberOut(
        id=m.id, user_id=m.user_id, code=m.code, name=m.user.name, phone=m.user.phone,
        email=m.user.email, gender=m.gender, dob=m.dob, address=m.address,
        emergency_contact=m.emergency_contact, joined_on=m.joined_on, trainer_id=m.trainer_id,
        trainer_name=m.trainer.name if m.trainer else None, notes=m.notes,
        is_active=m.user.is_active, device_enabled=m.device_enabled,
        has_fingerprint=bool(m.templates), **st,
    )


def membership_out(ms: Membership) -> MembershipOut:
    return MembershipOut(
        id=ms.id, plan_id=ms.plan_id, plan_name=ms.plan.name, start_date=ms.start_date,
        end_date=ms.end_date, amount=ms.amount, list_price=ms.list_price, discount=ms.discount or 0,
        discount_note=ms.discount_note, status=ms.status, created_at=ms.created_at,
    )


def payment_out(p: Payment) -> PaymentOut:
    return PaymentOut(
        id=p.id, member_id=p.member_id, member_name=p.member.user.name, member_code=p.member.code,
        amount=p.amount, method=p.method, utr=p.utr, status=p.status, note=p.note,
        receipt_no=p.receipt_no, plan_name=p.membership.plan.name if p.membership else None,
        list_price=p.membership.list_price if p.membership else None,
        discount=(p.membership.discount or 0) if p.membership else 0,
        discount_note=p.membership.discount_note if p.membership else None,
        created_at=p.created_at, verified_at=p.verified_at,
    )


def attendance_out(a: Attendance) -> AttendanceOut:
    return AttendanceOut(
        id=a.id, member_id=a.member_id, member_name=a.member.user.name, member_code=a.member.code,
        day=a.day, check_in_at=a.check_in_at, method=a.method,
    )
