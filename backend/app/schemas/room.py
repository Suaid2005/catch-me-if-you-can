"""
app/schemas/room.py
────────────────────
Pydantic schemas for room creation and join requests/responses.
"""
from pydantic import BaseModel, Field
from datetime import datetime
from app.models.room import RoomStatus


# ── Request schemas ───────────────────────────────────────────────

class RoomCreate(BaseModel):
    max_players: int = Field(default=8, ge=3, le=12)
    allow_bots: bool = True
    min_players_to_start: int = Field(default=3, ge=2, le=12)


class RoomJoin(BaseModel):
    code: str = Field(..., min_length=6, max_length=8,
                      description="The room code shown in the lobby")


# ── Response schemas ──────────────────────────────────────────────

class RoomPublic(BaseModel):
    id: str
    code: str
    host_id: str
    status: RoomStatus
    max_players: int
    current_players: int
    allow_bots: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RoomJoinResponse(BaseModel):
    room: RoomPublic
    message: str = "Joined successfully"
