"""
app/api/rooms.py
─────────────────
Room management endpoints:
  POST /api/rooms/create   → create a new game room
  POST /api/rooms/join     → join an existing room by code
  GET  /api/rooms/{code}   → get room info
"""
import random
import string
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.database import get_db
from app.models.room import Room, RoomStatus
from app.models.user import User
from app.schemas.room import RoomCreate, RoomJoin, RoomPublic, RoomJoinResponse
from app.api.auth import get_current_user
from app.game.room_manager import room_manager

router = APIRouter()


def _generate_room_code() -> str:
    """Generate a unique 6-character room code."""
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))


@router.post("/create", response_model=RoomPublic, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new game room. The caller becomes the host.
    Returns the room with its shareable code.
    """
    # Generate a unique code
    code = _generate_room_code()
    while (await db.execute(select(Room).where(Room.code == code))).scalar_one_or_none():
        code = _generate_room_code()

    room = Room(
        code=code,
        host_id=current_user.id,
        max_players=payload.max_players,
        allow_bots=payload.allow_bots,
        min_players_to_start=payload.min_players_to_start,
    )
    db.add(room)
    await db.flush()

    # Also register the room in the in-memory room_manager with the exact same code
    room_manager.create_room(
        host_sid="pending",  # Will be updated when the host's socket connects
        max_players=payload.max_players,
        allow_bots=payload.allow_bots,
        room_code=code,
    )

    return RoomPublic.model_validate(room)


@router.post("/join", response_model=RoomJoinResponse)
async def join_room(
    payload: RoomJoin,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Join an existing room by its code.
    Validates the code and checks if there's space.
    """
    code = payload.code.upper().strip()
    result = await db.execute(select(Room).where(Room.code == code))
    room = result.scalar_one_or_none()

    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    if room.status != RoomStatus.WAITING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Game already in progress")
    if room.current_players >= room.max_players:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Room is full")

    room.current_players += 1
    return RoomJoinResponse(room=RoomPublic.model_validate(room))


@router.get("/config/categories")
async def get_categories():
    from ml.word_intelligence import word_intelligence
    return {"categories": ["Random"] + word_intelligence.get_categories()}


@router.get("/config/word-pair")
async def get_word_pair(category: str = "Random", difficulty: str = "medium"):
    from ml.word_intelligence import word_intelligence
    return word_intelligence.select_word_pair(category=category, difficulty=difficulty)


@router.get("/{code}", response_model=RoomPublic)
async def get_room(code: str, db: AsyncSession = Depends(get_db)):
    """Get room details by code. Used by the lobby page on first load."""
    result = await db.execute(select(Room).where(Room.code == code.upper()))
    room = result.scalar_one_or_none()
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return RoomPublic.model_validate(room)
