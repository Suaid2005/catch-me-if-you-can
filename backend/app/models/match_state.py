"""
app/models/match_state.py
─────────────────────────
Persistent match and room state model for PostgreSQL / Supabase & SQLite.
Ensures zero game corruption across server restarts, Render dyno sleep,
and temporary network dropouts.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Integer, DateTime, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MatchStateModel(Base):
    __tablename__ = "match_states"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # 6-character room code (e.g. "ABC123")
    room_code: Mapped[str] = mapped_column(String(8), unique=True, index=True, nullable=False)

    # Host references
    host_sid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    host_user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Current lifecycle phase: lobby, role_reveal, clues, discussion, voting, final_guess, results, ended
    phase: Mapped[str] = mapped_column(String(32), default="lobby", index=True, nullable=False)

    # Match configuration
    mode: Mapped[str] = mapped_column(String(32), default="classic")
    category: Mapped[str] = mapped_column(String(64), default="Random")
    difficulty: Mapped[str] = mapped_column(String(32), default="medium")
    impostor_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_rounds: Mapped[int] = mapped_column(Integer, default=2)
    current_round: Mapped[int] = mapped_column(Integer, default=1)
    current_turn_sid: Mapped[str | None] = mapped_column(String(64), nullable=True)
    current_turn_index: Mapped[int] = mapped_column(Integer, default=0)

    # Active membership & session states
    # [{sid, user_id, username, avatar, is_ready, is_alive, is_bot, is_host}]
    players: Mapped[list | None] = mapped_column(JSON, default=list, nullable=True)

    # Turn ordering (list of socket IDs)
    turn_order: Mapped[list | None] = mapped_column(JSON, default=list, nullable=True)

    # Clue history [{sid, username, clue, round, evaluation}]
    clues: Mapped[list | None] = mapped_column(JSON, default=list, nullable=True)

    # Secret votes {voter_sid: target_sid}
    votes: Mapped[dict | None] = mapped_column(JSON, default=dict, nullable=True)

    # Role acknowledgments (list of sids)
    role_acks: Mapped[list | None] = mapped_column(JSON, default=list, nullable=True)

    # Active chaos card (if enabled)
    chaos_card: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # Outcome
    winner: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # PROTECTED GAME SECRETS (Never exposed in public API responses or lobby states)
    secret_word: Mapped[str | None] = mapped_column(String(64), nullable=True)
    undercover_word: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Protected player assignments {sid_or_uid: {role, card_title, secret_word, is_impostor, is_alive}}
    player_assignments: Mapped[dict | None] = mapped_column(JSON, default=dict, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    def to_public_dict(self) -> dict:
        """
        Public-safe representation for clients — ABSOLUTELY ZERO SECRETS.
        Secret word and individual player assignments are omitted.
        """
        return {
            "room_code": self.room_code,
            "phase": self.phase,
            "mode": self.mode,
            "category": self.category,
            "difficulty": self.difficulty,
            "total_rounds": self.total_rounds,
            "current_round": self.current_round,
            "current_turn_sid": self.current_turn_sid,
            "players": self.players or [],
            "turn_order": self.turn_order or [],
            "clues": self.clues or [],
            "votes_count": len(self.votes or {}),
            "chaos_card": self.chaos_card,
            "winner": self.winner,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    def __repr__(self) -> str:
        return f"<MatchStateModel room={self.room_code!r} phase={self.phase!r}>"
