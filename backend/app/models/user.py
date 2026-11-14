"""
app/models/user.py
──────────────────
Database models for players and security tokens.
SQLAlchemy maps these Python classes to database tables.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    # Primary key — UUID strings so IDs are unpredictable
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    username: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String(32), unique=True, index=True, nullable=True)

    # Dual Verification & Account Status
    email_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_legacy: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # We NEVER store raw passwords — only the bcrypt hash.
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Guest accounts have no password — they get a temporary session.
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)

    # Avatar identifier (defaults to classic detective)
    avatar: Mapped[str] = mapped_column(String(64), default="avatar_classic_detective")

    # Persistent progression and cosmetic vault ownership
    coins: Mapped[int] = mapped_column(Integer, default=150, nullable=False)
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unlocked_avatars: Mapped[list[str]] = mapped_column(
        JSON, default=lambda: ["avatar_classic_detective"], nullable=False
    )
    equipped_avatar: Mapped[str] = mapped_column(
        String(64), default="avatar_classic_detective", nullable=False
    )
    unlocked_items: Mapped[list[str]] = mapped_column(
        JSON, default=lambda: ["stamp_sus"], nullable=False
    )
    equipped_frame: Mapped[str | None] = mapped_column(String(64), nullable=True)
    equipped_stamp: Mapped[str | None] = mapped_column(
        String(64), default="stamp_sus", nullable=True
    )

    # Lifetime stats
    games_played: Mapped[int] = mapped_column(Integer, default=0)
    games_won: Mapped[int] = mapped_column(Integer, default=0)
    times_caught: Mapped[int] = mapped_column(Integer, default=0)
    times_escaped: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # Relationships — a user can appear in many game history records
    game_histories: Mapped[list["GameHistory"]] = relationship(  # noqa: F821
        back_populates="user", lazy="select"
    )

    def __repr__(self) -> str:
        return f"<User id={self.id!r} username={self.username!r}>"


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<PasswordResetToken id={self.id!r} user_id={self.user_id!r} used={self.used}>"


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    replaced_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<RefreshToken id={self.id!r} user_id={self.user_id!r} revoked={self.revoked}>"


class PhoneVerificationOtp(Base):
    __tablename__ = "phone_verification_otps"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    phone_number: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    otp_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    def __repr__(self) -> str:
        return f"<PhoneVerificationOtp id={self.id!r} phone={self.phone_number!r} used={self.used}>"


class OtpChallenge(Base):
    __tablename__ = "otp_challenges"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    target: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    channel: Mapped[str] = mapped_column(String(16), nullable=False)  # "email" or "phone"
    purpose: Mapped[str] = mapped_column(String(32), index=True, nullable=False)  # "register_email", "register_phone", "forgot_password"
    otp_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_attempts: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resend_available_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)

    def __repr__(self) -> str:
        return f"<OtpChallenge id={self.id!r} target={self.target!r} purpose={self.purpose!r} used={self.used}>"


class MatchRewardLedger(Base):
    __tablename__ = "match_reward_ledger"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    match_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, nullable=False)
    coins_awarded: Mapped[int] = mapped_column(Integer, nullable=False)
    awarded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )

    __table_args__ = (
        UniqueConstraint("match_id", "user_id", name="uq_match_user_reward"),
    )

    def __repr__(self) -> str:
        return (
            f"<MatchRewardLedger id={self.id!r} match={self.match_id!r} "
            f"user={self.user_id!r} xp={self.xp_awarded} coins={self.coins_awarded}>"
        )
