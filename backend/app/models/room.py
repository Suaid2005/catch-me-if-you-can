"""
app/models/room.py
──────────────────
Database model for a game room.
Rooms are saved to the DB when created and updated when the game ends.
During the game, the live state lives in memory (RoomManager) for speed.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Boolean, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
import enum

from app.database import Base


class RoomStatus(str, enum.Enum):
    WAITING = "waiting"      # In lobby, not started
    PLAYING = "playing"      # Game in progress
    FINISHED = "finished"    # Game over


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # The 6-character code players share with friends (e.g. "ABC123")
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True, nullable=False)

    host_id: Mapped[str] = mapped_column(String(36), nullable=False)

    status: Mapped[RoomStatus] = mapped_column(
        SAEnum(RoomStatus), default=RoomStatus.WAITING
    )

    max_players: Mapped[int] = mapped_column(Integer, default=8)
    current_players: Mapped[int] = mapped_column(Integer, default=0)

    # Allow AI bots to fill empty slots
    allow_bots: Mapped[bool] = mapped_column(Boolean, default=True)
    min_players_to_start: Mapped[int] = mapped_column(Integer, default=4)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Room code={self.code!r} status={self.status}>"
