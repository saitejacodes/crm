from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_token, current_user, hash_password, require, verify_password, STAFF
from ..db import get_db
from ..models import User
from ..schemas import LoginIn, PasswordChange, TokenOut, UserCreate, UserOut, UserUpdate
from ..serializers import user_out
from ..services import require_found

router = APIRouter(prefix="/api", tags=["auth & users"])


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.phone == body.phone))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong phone number or password")
    if not user.is_active:
        raise HTTPException(403, "Your account is disabled. Please contact the gym.")
    return TokenOut(token=create_token(user), user=user_out(user))


@router.get("/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.post("/auth/password")
def change_password(body: PasswordChange, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "Current password is wrong")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"ok": True}


@router.get("/users", response_model=list[UserOut])
def list_team(role: str | None = None, _: User = Depends(require(*STAFF)), db: Session = Depends(get_db)):
    q = select(User).where(User.role.in_(("owner", "staff", "trainer"))).order_by(User.role, User.name)
    if role:
        q = q.where(User.role == role)
    return [user_out(u) for u in db.scalars(q)]


@router.post("/users", response_model=UserOut, status_code=201)
def create_team_member(body: UserCreate, _: User = Depends(require("owner")), db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.phone == body.phone)):
        raise HTTPException(409, "This phone number is already registered")
    u = User(name=body.name, phone=body.phone, email=body.email,
             password_hash=hash_password(body.password), role=body.role)
    db.add(u)
    db.commit()
    return user_out(u)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_team_member(user_id: int, body: UserUpdate, owner: User = Depends(require("owner")),
                       db: Session = Depends(get_db)):
    u = require_found(db.get(User, user_id), "User")
    if u.role == "member":
        raise HTTPException(400, "Edit members from the Members page")
    if u.id == owner.id and body.is_active is False:
        raise HTTPException(400, "You can't disable your own account")
    data = body.model_dump(exclude_unset=True)
    if "password" in data:
        u.password_hash = hash_password(data.pop("password"))
    for k, v in data.items():
        setattr(u, k, v)
    db.commit()
    return user_out(u)
