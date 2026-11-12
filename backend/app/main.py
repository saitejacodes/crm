from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .auth import hash_password
from .config import settings
from .db import Base, SessionLocal, engine
from .models import Plan, User
from .routers import attendance, auth, dashboard, devices, me, members, offers, payments, plans
from .services import get_gym

DEFAULT_PLANS = [
    ("Monthly", 30, 1000), ("Quarterly", 90, 2700), ("Half-yearly", 180, 5000), ("Yearly", 365, 9000),
]


def init_db() -> None:
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        get_gym(db)
        if not db.scalar(select(User).where(User.role == "owner")):
            db.add(User(name=settings.owner_name, phone=settings.owner_phone,
                        password_hash=hash_password(settings.owner_password), role="owner"))
        if not db.scalar(select(Plan).limit(1)):
            db.add_all(Plan(name=n, duration_days=d, price=p) for n, d, p in DEFAULT_PLANS)
        db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Gym Management API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)
for r in (auth, plans, members, payments, attendance, dashboard, me, offers, devices):
    app.include_router(r.router)
app.include_router(devices.iclock)


@app.get("/api/health")
def health():
    return {"ok": True}
