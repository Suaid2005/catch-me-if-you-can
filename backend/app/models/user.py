"""
app/models/user.py
──────────────────
Database model for a registered player.
SQLAlchemy maps this Python class to a 'users' table in the database.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    # Primary key — we use UUID strings instead of integers so IDs are
    # unpredictable (harder to enumerate all players).
    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    username: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)

    # We NEVER store raw passwords — only the bcrypt hash.
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Guest accounts have no password — they get a temporary username.
    is_guest: Mapped[bool] = mapped_column(Boolean, default=False)

    # Avatar is an emoji character for now (e.g. "🕵️"). Simple and free.
    avatar: Mapped[str] = mapped_column(String(10), default="🧑")

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
