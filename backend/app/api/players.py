"""
app/api/players.py
───────────────────
Player profile endpoints:
  GET /api/players/{user_id}   → get a player's public stats
  GET /api/players/leaderboard → top players by win rate
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserPublic, UserStats

router = APIRouter()


@router.get("/leaderboard", response_model=list[UserPublic])
async def leaderboard(limit: int = 20, db: AsyncSession = Depends(get_db)):
    """Return top players sorted by games won."""
    result = await db.execute(
        select(User)
        .where(User.is_guest == False)  # noqa: E712 — exclude guests
        .order_by(desc(User.games_won))
        .limit(min(limit, 100))
    )
    users = result.scalars().all()
    return [UserPublic.model_validate(u) for u in users]


@router.get("/{user_id}", response_model=UserStats)
async def get_player(user_id: str, db: AsyncSession = Depends(get_db)):
    """Get a player's public stats by their ID."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")
    return UserStats.model_validate(user)
