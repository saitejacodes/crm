from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import STAFF, current_user, require
from ..db import get_db
from ..models import Member, Membership, Offer, Plan, User
from ..pricing import quote
from ..schemas import OfferIn, OfferOut, QuoteOut
from ..services import require_found, today

router = APIRouter(prefix="/api", tags=["offers & pricing"])


def offer_out(db: Session, o: Offer) -> OfferOut:
    t = today()
    state = "paused" if not o.is_active else "upcoming" if t < o.starts_on else "ended" if t > o.ends_on else "running"
    used = db.scalar(select(func.count()).select_from(Membership).where(
        Membership.offer_id == o.id, Membership.status == "active")) or 0
    return OfferOut(id=o.id, name=o.name, kind=o.kind, value=o.value, starts_on=o.starts_on, ends_on=o.ends_on,
                    plan_ids=[int(x) for x in o.plan_ids.split(",") if x.strip()], code=o.code,
                    new_members_only=o.new_members_only, is_active=o.is_active, state=state, times_used=used)


def _save(db: Session, o: Offer, body: OfferIn) -> None:
    if body.code:
        clash = db.scalar(select(Offer).where(Offer.code == body.code, Offer.id != (o.id or 0)))
        if clash:
            raise HTTPException(409, "Another offer already uses this code")
    for pid in body.plan_ids:
        require_found(db.get(Plan, pid), "Plan")
    data = body.model_dump()
    data["plan_ids"] = ",".join(str(i) for i in sorted(set(body.plan_ids)))
    for k, v in data.items():
        setattr(o, k, v)


@router.get("/offers", response_model=list[OfferOut])
def list_offers(_: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    return [offer_out(db, o) for o in db.scalars(select(Offer).order_by(Offer.starts_on.desc()))]


@router.post("/offers", response_model=OfferOut, status_code=201)
def create_offer(body: OfferIn, _: User = Depends(require("owner")), db: Session = Depends(get_db)):
    o = Offer()
    _save(db, o, body)
    db.add(o)
    db.commit()
    return offer_out(db, o)


@router.put("/offers/{offer_id}", response_model=OfferOut)
def update_offer(offer_id: int, body: OfferIn, _: User = Depends(require("owner")), db: Session = Depends(get_db)):
    o = require_found(db.get(Offer, offer_id), "Offer")
    _save(db, o, body)
    db.commit()
    return offer_out(db, o)


@router.get("/quotes", response_model=list[QuoteOut])
def plan_quotes(member_id: int | None = None, code: str | None = None,
                user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Price of every active plan today, after offers. Members get their own prices."""
    if user.role == "member":
        member = user.member
    elif member_id is not None:
        if user.role not in STAFF:
            raise HTTPException(403, "You don't have access to this")
        member = require_found(db.get(Member, member_id), "Member")
    else:
        member = None
    out = []
    for p in db.scalars(select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.duration_days)):
        try:
            q = quote(db, p, member, today(), code)
        except HTTPException:
            q = quote(db, p, member, today(), None)  # code not valid for this plan: show normal price
        out.append(QuoteOut(plan_id=p.id, plan_name=p.name, duration_days=p.duration_days, list_price=q.list_price,
                            discount=q.discount, price=q.price, offer_name=q.offer_name))
    return out
