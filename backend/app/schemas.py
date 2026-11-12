from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

PHONE = r"^[6-9]\d{9}$"


def _clean_phone(v: str) -> str:
    v = "".join(ch for ch in v if ch.isdigit())
    if len(v) == 12 and v.startswith("91"):
        v = v[2:]
    return v


class LoginIn(BaseModel):
    phone: str
    password: str

    _p = field_validator("phone")(_clean_phone)


class TokenOut(BaseModel):
    token: str
    user: "UserOut"


class UserOut(BaseModel):
    id: int
    name: str
    phone: str
    email: str | None
    role: str
    is_active: bool
    member_id: int | None = None


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=PHONE)
    email: str | None = None
    password: str = Field(min_length=6)
    role: Literal["staff", "trainer"]

    _p = field_validator("phone", mode="before")(_clean_phone)


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6)


class PasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6)


class PlanIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    duration_days: int = Field(gt=0, le=3660)
    price: int = Field(ge=0)
    description: str | None = None
    is_active: bool = True


class PlanOut(PlanIn):
    id: int


class MemberCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=PHONE)
    email: str | None = None
    password: str | None = Field(default=None, min_length=6)
    gender: Literal["male", "female", "other"] | None = None
    dob: date | None = None
    address: str | None = None
    emergency_contact: str | None = None
    joined_on: date | None = None
    trainer_id: int | None = None
    notes: str | None = None
    # optional: start a plan right away (paid at the desk)
    plan_id: int | None = None
    payment_method: Literal["cash", "upi"] | None = None
    utr: str | None = None

    _p = field_validator("phone", mode="before")(_clean_phone)


class MemberUpdate(BaseModel):
    name: str | None = None
    phone: str | None = Field(default=None, pattern=PHONE)
    email: str | None = None
    gender: Literal["male", "female", "other"] | None = None
    dob: date | None = None
    address: str | None = None
    emergency_contact: str | None = None
    trainer_id: int | None = None
    notes: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6)

    @field_validator("phone", mode="before")
    @classmethod
    def _cp(cls, v):
        return _clean_phone(v) if v else v


class MembershipOut(BaseModel):
    id: int
    plan_id: int
    plan_name: str
    start_date: date | None
    end_date: date | None
    amount: int
    list_price: int | None
    discount: int
    discount_note: str | None
    status: str
    created_at: datetime | None


class MemberOut(BaseModel):
    id: int
    user_id: int
    code: str
    name: str
    phone: str
    email: str | None
    gender: str | None
    dob: date | None
    address: str | None
    emergency_contact: str | None
    joined_on: date
    trainer_id: int | None
    trainer_name: str | None
    notes: str | None
    is_active: bool
    device_enabled: bool | None = None
    has_fingerprint: bool = False
    status: str
    end_date: date | None
    days_left: int | None
    plan: str | None


class PaymentOut(BaseModel):
    id: int
    member_id: int
    member_name: str
    member_code: str
    amount: int
    method: str
    utr: str | None
    status: str
    note: str | None
    receipt_no: str | None
    plan_name: str | None
    list_price: int | None = None
    discount: int = 0
    discount_note: str | None = None
    created_at: datetime | None
    verified_at: datetime | None


class DeskPaymentIn(BaseModel):
    """Staff records a payment received at the desk (verified immediately).
    Offers apply automatically; `code` adds a coupon offer.
    `amount` (a custom price) is owner-only, with `discount_reason`."""
    plan_id: int
    method: Literal["cash", "upi"]
    utr: str | None = None
    code: str | None = None
    amount: int | None = Field(default=None, ge=0)
    discount_reason: str | None = Field(default=None, max_length=120)
    note: str | None = None


class UpiSubmitIn(BaseModel):
    """Member says they paid via UPI QR and gives the UTR / reference no."""
    plan_id: int
    utr: str = Field(min_length=6, max_length=40)
    code: str | None = None

    @field_validator("utr")
    @classmethod
    def _u(cls, v: str) -> str:
        v = v.strip().replace(" ", "")
        if not v.isalnum():
            raise ValueError("UTR should be letters/numbers only")
        return v.upper()


class RejectIn(BaseModel):
    note: str | None = None


class AttendanceOut(BaseModel):
    id: int
    member_id: int
    member_name: str
    member_code: str
    day: date
    check_in_at: datetime
    method: str


class WorkoutIn(BaseModel):
    workout: str = ""
    diet: str = ""


class WorkoutOut(WorkoutIn):
    member_id: int
    trainer_id: int | None
    trainer_name: str | None
    updated_at: datetime | None


class GymSettingsIn(BaseModel):
    gym_name: str = Field(min_length=2, max_length=120)
    upi_id: str = Field(default="", max_length=100)
    upi_payee_name: str = Field(default="", max_length=120)
    phone: str = ""
    address: str = ""
    timings: str = ""
    expiry_alert_days: int = Field(default=7, ge=1, le=60)

    @field_validator("upi_id")
    @classmethod
    def _upi(cls, v: str) -> str:
        v = v.strip()
        if v and "@" not in v:
            raise ValueError("UPI ID looks wrong (should be like name@bank)")
        return v


class GymSettingsOut(GymSettingsIn):
    pass


class CheckinIn(BaseModel):
    token: str


class OfferIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    kind: Literal["percent", "flat"]
    value: int = Field(gt=0)
    starts_on: date
    ends_on: date
    plan_ids: list[int] = []
    code: str | None = Field(default=None, max_length=30)
    new_members_only: bool = False
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def _code(cls, v):
        if not v or not v.strip():
            return None
        v = v.strip().upper()
        if not v.replace("-", "").isalnum():
            raise ValueError("Use only letters, numbers and dashes")
        return v

    @model_validator(mode="after")
    def _check(self):
        if self.ends_on < self.starts_on:
            raise ValueError("End date is before the start date")
        if self.kind == "percent" and self.value > 90:
            raise ValueError("Percentage discount can be at most 90%")
        return self


class OfferOut(BaseModel):
    id: int
    name: str
    kind: str
    value: int
    starts_on: date
    ends_on: date
    plan_ids: list[int]
    code: str | None
    new_members_only: bool
    is_active: bool
    state: str  # running | upcoming | ended | paused
    times_used: int


class QuoteOut(BaseModel):
    plan_id: int
    plan_name: str
    duration_days: int
    list_price: int
    discount: int
    price: int
    offer_name: str | None


class DeviceIn(BaseModel):
    serial: str = Field(min_length=3, max_length=40)
    name: str = Field(default="Entrance", max_length=80)


class DeviceOut(BaseModel):
    id: int
    serial: str
    name: str
    is_active: bool
    last_seen: datetime | None
    online: bool
    pending_commands: int


TokenOut.model_rebuild()
