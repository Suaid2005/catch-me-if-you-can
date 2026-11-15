"""
app/schemas/user.py
────────────────────
Pydantic schemas define the shape of data that comes IN (requests)
and goes OUT (responses) through the API.
"""
import re
from datetime import datetime
import phonenumbers
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


def validate_and_normalize_phone(v: str | None) -> str:
    """Validates international phone numbers using phonenumbers library and returns E.164 string."""
    if not v or not isinstance(v, str) or not v.strip():
        raise ValueError("Phone number is required")
    raw = v.strip()
    if not raw.startswith("+"):
        raw = f"+{raw}"
    try:
        parsed = phonenumbers.parse(raw, None)
        if not phonenumbers.is_valid_number(parsed):
            raise ValueError("Invalid phone number length or structure for country")
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except Exception as exc:
        raise ValueError(f"Phone number must be a valid international E.164 number (e.g. +919876543210): {exc}")


# ── Request schemas (data sent TO the server) ────────────────────

class UserRegister(BaseModel):
    username: str = Field(
        ...,
        min_length=3,
        max_length=32,
        pattern=r"^[a-zA-Z0-9_\-]+$",
        description="Letters, numbers, _ and - only",
    )
    email: EmailStr = Field(..., description="Valid email address is required")
    phone_number: str = Field(..., description="Valid international E.164 phone number is required")
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str | None = None

    @field_validator("username")
    @classmethod
    def username_not_reserved(cls, v: str) -> str:
        reserved = {"admin", "bot", "system", "moderator", "guest"}
        if v.lower() in reserved:
            raise ValueError(f"'{v}' is a reserved username")
        return v

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, v: str | None) -> str:
        if not v or not isinstance(v, str) or not v.strip():
            raise ValueError("Email address is required")
        return v.strip().lower()

    @field_validator("phone_number", mode="before")
    @classmethod
    def normalize_phone(cls, v: str | None) -> str:
        return validate_and_normalize_phone(v)

    @model_validator(mode="after")
    def verify_password_match(self) -> "UserRegister":
        if self.confirm_password is not None and self.confirm_password != self.password:
            raise ValueError("Passwords do not match")
        return self


class UserLogin(BaseModel):
    username: str = Field(..., description="Username or verified email address")
    password: str = Field(..., min_length=1)


class GuestLogin(BaseModel):
    """Guest players pick a display name but create no permanent account."""
    display_name: str = Field(..., min_length=2, max_length=20)


# ── Dual OTP Registration Schemas ───────────────────────────────

class RegisterResponse(BaseModel):
    user_id: str
    username: str
    email: str
    phone_number: str
    email_verified: bool = False
    phone_verified: bool = False
    is_active: bool = False
    registration_token: str
    message: str
    dev_email_otp: str | None = None
    dev_phone_otp: str | None = None
    email_delivered: bool = False
    sms_delivered: bool = False
    provider_configured: bool = False
    tokens: dict | None = None


class VerifyEmailOtpRequest(BaseModel):
    registration_token: str
    otp: str = Field(..., min_length=4, max_length=10)


class VerifyPhoneOtpRequest(BaseModel):
    registration_token: str
    otp: str = Field(..., min_length=4, max_length=10)


class ResendOtpRequest(BaseModel):
    registration_token: str
    channel: str = Field(..., pattern=r"^(email|phone)$")


class ChangeEmailRequest(BaseModel):
    registration_token: str
    new_email: EmailStr

    @field_validator("new_email", mode="before")
    @classmethod
    def normalize_new_email(cls, v: str | None) -> str:
        if not v or not isinstance(v, str) or not v.strip():
            raise ValueError("Email address is required")
        return v.strip().lower()


class ChangePhoneRequest(BaseModel):
    registration_token: str
    new_phone: str

    @field_validator("new_phone", mode="before")
    @classmethod
    def normalize_new_phone(cls, v: str | None) -> str:
        return validate_and_normalize_phone(v)


# ── Account Recovery Schemas ───────────────────────────────────

class RecoverUsernameRequest(BaseModel):
    channel: str = Field(..., pattern=r"^(email|phone)$")
    identifier: str = Field(..., min_length=3)

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, v: str) -> str:
        return v.strip()


class ForgotPasswordRequest(BaseModel):
    channel: str = Field(..., pattern=r"^(email|phone)$")
    identifier: str = Field(..., min_length=3)

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, v: str) -> str:
        return v.strip()


class ForgotPasswordResponse(BaseModel):
    message: str
    challenge_id: str | None = None
    channel: str
    target_masked: str | None = None
    dev_otp: str | None = None
    reset_token: str | None = None


class VerifyForgotPasswordOtpRequest(BaseModel):
    challenge_id: str
    otp: str = Field(..., min_length=4, max_length=10)


class VerifyForgotPasswordOtpResponse(BaseModel):
    message: str
    reset_token: str


class ResetPasswordRequest(BaseModel):
    reset_token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(..., min_length=8, max_length=128)

    @model_validator(mode="after")
    def check_password_match(self) -> "ResetPasswordRequest":
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class MessageResponse(BaseModel):
    message: str


# ── Response schemas (data sent FROM the server) ──────────────────

class UserPublic(BaseModel):
    """Safe public view of a user — never includes password, phone, or raw email."""
    id: str
    username: str
    avatar: str
    games_played: int
    games_won: int
    is_guest: bool
    email_verified: bool = False
    phone_verified: bool = False
    is_active: bool = True
    is_legacy: bool = False

    @field_validator("username", mode="before")
    @classmethod
    def clean_guest_username(cls, v: str) -> str:
        if not isinstance(v, str):
            return str(v)
        if "::" in v:
            return v.split("::")[0]
        if v.startswith("Guest_") and len(v.split("_")) >= 3:
            parts = v.split("_")
            return "_".join(parts[1:-1])
        return v

    model_config = {"from_attributes": True}


class UserStats(UserPublic):
    """Extended stats for a player's profile page."""
    times_caught: int
    times_escaped: int
    win_rate: float = 0.0

    model_config = {"from_attributes": True}

    @property
    def computed_win_rate(self) -> float:
        if self.games_played == 0:
            return 0.0
        return round(self.games_won / self.games_played * 100, 1)


class TokenResponse(BaseModel):
    """Returned after a successful login, verification completion, or session token refresh."""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserPublic


class VerificationStatusResponse(BaseModel):
    user_id: str
    username: str
    email: str
    phone_number: str
    email_verified: bool
    phone_verified: bool
    is_active: bool
    message: str
    dev_email_otp: str | None = None
    dev_phone_otp: str | None = None
    tokens: TokenResponse | None = None
    user: UserPublic | None = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(..., min_length=16)


class LogoutRequest(BaseModel):
    refresh_token: str | None = None


class PhoneOtpRequest(BaseModel):
    phone_number: str

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return validate_and_normalize_phone(v)


class PhoneOtpVerifyRequest(BaseModel):
    phone_number: str
    otp: str = Field(..., min_length=4, max_length=10)

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        return validate_and_normalize_phone(v)


class PhoneOtpResponse(BaseModel):
    success: bool
    message: str
    provider_configured: bool
