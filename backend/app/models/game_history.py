"""
app/models/game_history.py
──────────────────────────
Records the outcome of each completed game, per player.
This feeds the ML model training pipeline in Milestone 10.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, Float, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class GameHistory(Base):
    __tablename__ = "game_history"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    room_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)

    # What role was this player assigned?
    role: Mapped[str] = mapped_column(String(32), nullable=False)

    # Did this player win?
    won: Mapped[bool] = mapped_column(Boolean, nullable=False)

    # Was this player caught / eliminated?
    was_eliminated: Mapped[bool] = mapped_column(Boolean, default=False)

    # Number of rounds this player survived
    rounds_survived: Mapped[int] = mapped_column(Integer, default=0)

    # ML training data: average suspicion score the system gave this player
    avg_suspicion_score: Mapped[float] = mapped_column(Float, default=0.0)

    # Store the full chat log and vote record as JSON for replay and ML training
    chat_log: Mapped[list | None] = mapped_column(JSON, nullable=True)
    vote_record: Mapped[list | None] = mapped_column(JSON, nullable=True)

    # Was this a bot player? Bot games are labelled separately for ML.
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False)

    played_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationship back to the User model
    user: Mapped["User"] = relationship(back_populates="game_histories")  # noqa: F821

    def __repr__(self) -> str:
        return f"<GameHistory room={self.room_id!r} user={self.user_id!r} role={self.role!r}>"
