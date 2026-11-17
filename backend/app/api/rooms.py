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
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timezone

from app.database import get_db
from app.models.room import Room, RoomStatus
from app.models.user import User
from app.schemas.room import RoomCreate, RoomJoin, RoomPublic, RoomJoinResponse
from app.api.auth import get_current_user, get_optional_current_user
from app.game.room_manager import room_manager
from app.game.code_utils import generate_unambiguous_code, get_code_candidates

router = APIRouter()


def _generate_room_code() -> str:
    """Generate a unique 6-character room code without visually ambiguous characters."""
    return generate_unambiguous_code(6)


async def find_room_by_code(
    code: str,
    db: AsyncSession,
    current_user_id: Optional[str] = None,
) -> Optional[Room]:
    """
    Finds a room by code across all persistence and memory layers:
    1. Room database table (exact match + visual ambiguity candidates)
    2. RoomManager active memory (if room was created or restored in memory)
    3. MatchStateModel database table (if persisted via MatchPersistence)

    If found in memory or match_states but missing in the Room table,
    it automatically synchronizes / re-creates the Room record in the database.
    """
    clean_code = code.upper().strip()
    if not clean_code:
        return None

    candidates = get_code_candidates(clean_code)

    # 1. Query the SQL Room table for exact match and candidate variations
    for cand in candidates:
        result = await db.execute(select(Room).where(Room.code == cand))
        room = result.scalar_one_or_none()
        if room:
            # Sync current_players with actual connected players if in memory
            if room_manager.room_exists(room.code):
                actual = len(room_manager.get_players(room.code))
                if actual > 0:
                    room.current_players = actual
            return room

    # 2. Check active in-memory RoomManager
    for cand in candidates:
        canonical = room_manager.get_canonical_code(cand)
        if canonical:
            mem_room = room_manager.get_room(canonical) or {}
            active_players = room_manager.get_players(canonical)
            host_uid = mem_room.get("host_user_id") or current_user_id or "host"
            phase = mem_room.get("game_phase", "lobby")
            room = Room(
                code=canonical,
                host_id=host_uid,
                max_players=mem_room.get("max_players", 8),
                allow_bots=mem_room.get("allow_bots", True),
                current_players=len(active_players),
                status=RoomStatus.WAITING if phase in (None, "lobby") else RoomStatus.PLAYING,
            )
            db.add(room)
            await db.flush()
            return room

    # 3. Check persistent MatchStateModel table directly with active db session
    from app.models.match_state import MatchStateModel
    for cand in candidates:
        stmt = select(MatchStateModel).where(MatchStateModel.room_code == cand)
        res = await db.execute(stmt)
        record = res.scalar_one_or_none()
        if record:
            players = record.players or []
            phase = record.phase or "lobby"
            room = Room(
                code=record.room_code,
                host_id=record.host_sid or current_user_id or "host",
                max_players=8,
                allow_bots=True,
                current_players=len(players),
                status=RoomStatus.WAITING if phase in (None, "lobby") else RoomStatus.PLAYING,
            )
            db.add(room)
            await db.flush()
            if not room_manager.room_exists(record.room_code):
                room_manager.create_room(
                    host_sid=record.host_sid or "pending",
                    max_players=8,
                    allow_bots=True,
                    room_code=record.room_code,
                )
            return room

    return None


@router.post("/create", response_model=RoomPublic, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: RoomCreate,
    current_user: Optional[User] = Depends(get_optional_current_user),
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

    host_id = current_user.id if current_user else str(uuid.uuid4())
    room = Room(
        code=code,
        host_id=host_id,
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
    current_user: Optional[User] = Depends(get_optional_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Join an existing room by its code.
    Validates the code across all memory and DB persistence layers.
    Checks capacity, reconnection status, and returns canonical room metadata.
    """
    current_user_id = current_user.id if current_user else None
    room = await find_room_by_code(payload.code, db, current_user_id=current_user_id)

    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")

    # Allow seamless reconnection if player is already seated in this room
    is_existing_player = False
    if current_user and room_manager.room_exists(room.code):
        players = room_manager.get_players(room.code)
        if any(p.get("user_id") == current_user.id for p in players):
            is_existing_player = True

    if not is_existing_player:
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
    """Get room details by code across all persistence layers. Used by lobby page on first load."""
    room = await find_room_by_code(code, db)
    if not room:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Room not found")
    return RoomPublic.model_validate(room)
