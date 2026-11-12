from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user, require
from ..db import get_db
from ..models import Plan, User
from ..schemas import PlanIn, PlanOut
from ..services import require_found

router = APIRouter(prefix="/api/plans", tags=["plans"])


@router.get("", response_model=list[PlanOut])
def list_plans(include_inactive: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Plan).order_by(Plan.duration_days, Plan.price)
    if not include_inactive or user.role == "member":
        q = q.where(Plan.is_active.is_(True))
    return db.scalars(q).all()


@router.post("", response_model=PlanOut, status_code=201)
def create_plan(body: PlanIn, _: User = Depends(require("owner")), db: Session = Depends(get_db)):
    p = Plan(**body.model_dump())
    db.add(p)
    db.commit()
    return p


@router.put("/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: int, body: PlanIn, _: User = Depends(require("owner")), db: Session = Depends(get_db)):
    p = require_found(db.get(Plan, plan_id), "Plan")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.commit()
    return p
