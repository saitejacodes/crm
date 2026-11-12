from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

ROLES = ("owner", "staff", "trainer", "member")


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(200))
    role: Mapped[str] = mapped_column(String(20), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    member: Mapped["Member | None"] = relationship(
        back_populates="user", foreign_keys="Member.user_id", uselist=False
    )


class Member(Base):
    __tablename__ = "members"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    gender: Mapped[str | None] = mapped_column(String(10), nullable=True)
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    address: Mapped[str | None] = mapped_column(String(300), nullable=True)
    emergency_contact: Mapped[str | None] = mapped_column(String(100), nullable=True)
    joined_on: Mapped[date] = mapped_column(Date)
    trainer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # is the member currently allowed on the fingerprint machine(s)? None = never pushed
    device_enabled: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    user: Mapped[User] = relationship(back_populates="member", foreign_keys=[user_id])
    trainer: Mapped[User | None] = relationship(foreign_keys=[trainer_id])
    memberships: Mapped[list["Membership"]] = relationship(
        back_populates="member", order_by="Membership.end_date.desc()"
    )
    templates: Mapped[list["FingerTemplate"]] = relationship(order_by="FingerTemplate.fid")


class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    duration_days: Mapped[int] = mapped_column(Integer)
    price: Mapped[int] = mapped_column(Integer)  # rupees
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Membership(Base):
    """One paid period. status: pending (awaiting payment verification), active, cancelled."""
    __tablename__ = "memberships"
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id"))
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[int] = mapped_column(Integer)
    list_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    discount: Mapped[int] = mapped_column(Integer, default=0)
    offer_id: Mapped[int | None] = mapped_column(ForeignKey("offers.id"), nullable=True)
    discount_note: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    member: Mapped[Member] = relationship(back_populates="memberships")
    plan: Mapped[Plan] = relationship()


class Payment(Base):
    """status: pending (member submitted UTR), verified, rejected. method: upi | cash."""
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    membership_id: Mapped[int | None] = mapped_column(ForeignKey("memberships.id"), nullable=True)
    amount: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(10))
    utr: Mapped[str | None] = mapped_column(String(40), nullable=True, unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    note: Mapped[str | None] = mapped_column(String(300), nullable=True)
    receipt_no: Mapped[str | None] = mapped_column(String(30), nullable=True, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    verified_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    member: Mapped[Member] = relationship()
    membership: Mapped[Membership | None] = relationship()


class Attendance(Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("member_id", "day", name="uq_attendance_member_day"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    check_in_at: Mapped[datetime] = mapped_column(DateTime)
    method: Mapped[str] = mapped_column(String(10))  # qr | manual | finger

    member: Mapped[Member] = relationship()


class WorkoutPlan(Base):
    __tablename__ = "workout_plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), unique=True)
    trainer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    workout: Mapped[str] = mapped_column(Text, default="")
    diet: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())


class GymSettings(Base):
    __tablename__ = "gym_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    gym_name: Mapped[str] = mapped_column(String(120), default="My Gym")
    upi_id: Mapped[str] = mapped_column(String(100), default="")
    upi_payee_name: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(20), default="")
    address: Mapped[str] = mapped_column(String(300), default="")
    timings: Mapped[str] = mapped_column(String(200), default="")
    expiry_alert_days: Mapped[int] = mapped_column(Integer, default=7)
    checkin_secret: Mapped[str] = mapped_column(String(64))


class Offer(Base):
    """Owner-created discount, e.g. Diwali / New Year / gym anniversary.
    kind: percent | flat. plan_ids: comma list, empty = all plans.
    code: empty = applied automatically during the dates; else member/desk must enter it."""
    __tablename__ = "offers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    kind: Mapped[str] = mapped_column(String(10))
    value: Mapped[int] = mapped_column(Integer)
    starts_on: Mapped[date] = mapped_column(Date)
    ends_on: Mapped[date] = mapped_column(Date)
    plan_ids: Mapped[str] = mapped_column(String(200), default="")
    code: Mapped[str | None] = mapped_column(String(30), nullable=True, unique=True)
    new_members_only: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Device(Base):
    """Fingerprint terminal talking ADMS / push protocol to /iclock/*."""
    __tablename__ = "devices"
    id: Mapped[int] = mapped_column(primary_key=True)
    serial: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80), default="Entrance")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    attlog_stamp: Mapped[str] = mapped_column(String(20), default="0")
    operlog_stamp: Mapped[str] = mapped_column(String(20), default="0")
    last_sweep: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class DeviceCommand(Base):
    """status: pending -> sent -> done | failed"""
    __tablename__ = "device_commands"
    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), index=True)
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"), nullable=True)
    command: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    return_code: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class FingerTemplate(Base):
    """Backup of a member's enrolled fingerprint so it can be restored after renewal."""
    __tablename__ = "finger_templates"
    __table_args__ = (UniqueConstraint("member_id", "fid", name="uq_template_member_fid"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    member_id: Mapped[int] = mapped_column(ForeignKey("members.id"), index=True)
    fid: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(10), default="FP")  # FP (FINGERTMP) | BIODATA
    raw: Mapped[str] = mapped_column(Text)  # tab-separated key=value body as the device sent it


class Punch(Base):
    """Every fingerprint punch. result: ok | expired | unknown | disabled"""
    __tablename__ = "punches"
    id: Mapped[int] = mapped_column(primary_key=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"))
    pin: Mapped[str] = mapped_column(String(20))
    member_id: Mapped[int | None] = mapped_column(ForeignKey("members.id"), nullable=True)
    punched_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    result: Mapped[str] = mapped_column(String(10))
