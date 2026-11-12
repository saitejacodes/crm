"""Plan price after offers. The server always computes the amount; clients never send it."""
from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Member, Membership, Offer, Plan


@dataclass
class Quote:
    plan_id: int
    list_price: int
    discount: int
    price: int
    offer_id: int | None = None
    offer_name: str | None = None
    note: str | None = None


def offer_applies(offer: Offer, plan: Plan, member: Member | None, on: date) -> bool:
    if not offer.is_active or not (offer.starts_on <= on <= offer.ends_on):
        return False
    if offer.plan_ids:
        ids = {int(x) for x in offer.plan_ids.split(",") if x.strip()}
        if plan.id not in ids:
            return False
    if offer.new_members_only and member is not None:
        if any(m.status == "active" for m in member.memberships):
            return False
    return True


def offer_discount(offer: Offer, price: int) -> int:
    d = price * offer.value // 100 if offer.kind == "percent" else offer.value
    return max(0, min(price, d))


def quote(db: Session, plan: Plan, member: Member | None, on: date, code: str | None = None) -> Quote:
    """Best of: offers running automatically today, plus the coupon code if one was given."""
    q = Quote(plan_id=plan.id, list_price=plan.price, discount=0, price=plan.price)
    candidates = list(db.scalars(select(Offer).where(Offer.code.is_(None))))
    if code:
        coded = db.scalar(select(Offer).where(Offer.code == code.strip().upper()))
        if coded is None or not offer_applies(coded, plan, member, on):
            raise HTTPException(400, "This offer code isn't valid for this plan today")
        candidates.append(coded)
    best = None
    for o in candidates:
        if offer_applies(o, plan, member, on):
            d = offer_discount(o, plan.price)
            if best is None or d > best[0]:
                best = (d, o)
    if best and best[0] > 0:
        d, o = best
        q.discount, q.price, q.offer_id, q.offer_name = d, plan.price - d, o.id, o.name
        q.note = o.name
    return q


def manual_quote(plan: Plan, amount: int, reason: str | None) -> Quote:
    if amount > plan.price:
        raise HTTPException(400, "Amount can't be more than the plan price")
    d = plan.price - amount
    return Quote(plan_id=plan.id, list_price=plan.price, discount=d, price=amount,
                 note=(reason or "Owner discount") if d else None)


def apply_quote(ms: Membership, q: Quote) -> None:
    ms.amount, ms.list_price, ms.discount = q.price, q.list_price, q.discount
    ms.offer_id, ms.discount_note = q.offer_id, q.note
