import csv
import io
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth import STAFF, require
from ..db import get_db
from ..models import Member, Membership, Payment, User
from ..schemas import PaymentOut, RejectIn
from ..device import sync_member
from ..serializers import payment_out
from ..services import mark_verified, now_local, require_found

router = APIRouter(prefix="/api/payments", tags=["payments"])

LOAD = (
    selectinload(Payment.member).selectinload(Member.user),
    selectinload(Payment.membership).selectinload(Membership.plan),
)


def _query(status: str | None, start: date | None, end: date | None):
    q = select(Payment).options(*LOAD).order_by(Payment.id.desc())
    if status:
        q = q.where(Payment.status == status)
    if start:
        q = q.where(Payment.created_at >= datetime.combine(start, time.min))
    if end:
        q = q.where(Payment.created_at < datetime.combine(end + timedelta(days=1), time.min))
    return q


@router.get("", response_model=list[PaymentOut])
def list_payments(status: str | None = None, start: date | None = None, end: date | None = None,
                  limit: int = 300, _: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    return [payment_out(p) for p in db.scalars(_query(status, start, end).limit(min(limit, 2000)))]


@router.post("/{payment_id}/verify", response_model=PaymentOut)
def verify(payment_id: int, staff: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    p = require_found(db.get(Payment, payment_id), "Payment")
    if p.status != "pending":
        raise HTTPException(400, f"Payment is already {p.status}")
    mark_verified(db, p, staff.id)
    db.flush()
    db.refresh(p.member)
    sync_member(db, p.member)
    db.commit()
    return payment_out(p)


@router.post("/{payment_id}/reject", response_model=PaymentOut)
def reject(payment_id: int, body: RejectIn, staff: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    p = require_found(db.get(Payment, payment_id), "Payment")
    if p.status != "pending":
        raise HTTPException(400, f"Payment is already {p.status}")
    p.status = "rejected"
    p.note = body.note or "Payment not received"
    p.verified_by = staff.id
    p.verified_at = now_local()
    if p.membership and p.membership.status == "pending":
        p.membership.status = "cancelled"
    db.commit()
    return payment_out(p)


@router.get("/export.csv")
def export_csv(status: str | None = "verified", start: date | None = None, end: date | None = None,
               _: User = Depends(require("owner")), db: Session = Depends(get_db)):
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Receipt", "Date", "Member code", "Member", "Plan", "Plan price", "Discount", "Offer", "Amount paid", "Method", "UTR", "Status"])
    for p in db.scalars(_query(status, start, end)):
        o = payment_out(p)
        w.writerow([o.receipt_no or "", (o.verified_at or o.created_at or "").__str__()[:16], o.member_code,
                    o.member_name, o.plan_name or "", o.list_price if o.list_price is not None else o.amount,
                    o.discount, o.discount_note or "", o.amount, o.method, o.utr or "", o.status])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="payments.csv"'},
    )
