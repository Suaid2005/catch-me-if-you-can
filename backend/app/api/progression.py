"""
app/api/progression.py
──────────────────────
Endpoints for server-side avatar and cosmetic ownership, progression, and rewards.
Authenticated players have their coins, level, and inventory stored in the database.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models.user import User
from app.api.auth import get_current_user
from app.schemas.progression import (
    CATALOG_ITEMS,
    ProgressionResponse,
    PurchaseAvatarRequest,
    EquipAvatarRequest,
    PurchaseCosmeticRequest,
    EquipCosmeticRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _ensure_progression_defaults(user: User) -> None:
    """Ensures that user progression fields have non-empty valid defaults."""
    if not user.unlocked_avatars:
        user.unlocked_avatars = ["avatar_classic_detective"]
    elif "avatar_classic_detective" not in user.unlocked_avatars:
        user.unlocked_avatars = ["avatar_classic_detective"] + list(user.unlocked_avatars)

    if not user.equipped_avatar:
        user.equipped_avatar = "avatar_classic_detective"
    user.avatar = user.equipped_avatar

    if not user.unlocked_items:
        user.unlocked_items = ["stamp_sus"]

    if user.coins is None:
        user.coins = 150
    if user.xp is None:
        user.xp = 0
    if user.level is None:
        user.level = max(1, (user.xp // 250) + 1)


@router.get("", response_model=ProgressionResponse)
async def get_progression(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Fetch the authenticated user's authoritative progression and inventory."""
    _ensure_progression_defaults(current_user)
    return current_user


@router.post("/purchase-avatar", response_model=ProgressionResponse)
async def purchase_avatar(
    payload: PurchaseAvatarRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Purchase a character avatar from the catalog with coins."""
    _ensure_progression_defaults(current_user)
    avatar_id = payload.avatar_id.strip()

    item_info = CATALOG_ITEMS.get(avatar_id)
    if not item_info or item_info.get("type") != "avatar":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Avatar '{avatar_id}' is not available in the catalog.",
        )

    cost = int(item_info["cost"])

    # Check ownership
    if avatar_id in current_user.unlocked_avatars:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already own this avatar.",
        )

    # Double-spending / balance guard
    if current_user.coins < cost:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient coins. Required: {cost}, Available: {current_user.coins}.",
        )

    # Deduct coins and update inventory
    current_user.coins -= cost
    current_user.unlocked_avatars = list(current_user.unlocked_avatars) + [avatar_id]
    flag_modified(current_user, "unlocked_avatars")

    # Automatically equip the newly purchased avatar
    current_user.equipped_avatar = avatar_id
    current_user.avatar = avatar_id

    await db.flush()
    logger.info(
        "[PROGRESSION] User '%s' purchased avatar '%s' for %d coins (Balance: %d)",
        current_user.username,
        avatar_id,
        cost,
        current_user.coins,
    )

    return current_user


@router.post("/equip-avatar", response_model=ProgressionResponse)
async def equip_avatar(
    payload: EquipAvatarRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Equip an already-owned character avatar."""
    _ensure_progression_defaults(current_user)
    avatar_id = payload.avatar_id.strip()

    if avatar_id not in current_user.unlocked_avatars:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Avatar '{avatar_id}' is not unlocked in your inventory.",
        )

    current_user.equipped_avatar = avatar_id
    current_user.avatar = avatar_id

    await db.flush()
    logger.info("[PROGRESSION] User '%s' equipped avatar '%s'", current_user.username, avatar_id)

    return current_user


@router.post("/purchase-cosmetic", response_model=ProgressionResponse)
async def purchase_cosmetic(
    payload: PurchaseCosmeticRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Purchase a frame or stamp from the cosmetic catalog."""
    _ensure_progression_defaults(current_user)
    item_id = payload.item_id.strip()

    item_info = CATALOG_ITEMS.get(item_id)
    if not item_info or item_info.get("type") not in ("frame", "stamp"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cosmetic item '{item_id}' not found in catalog.",
        )

    cost = int(item_info["cost"])
    item_type = item_info["type"]

    if item_id in current_user.unlocked_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You already own this item.",
        )

    if current_user.coins < cost:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient coins. Required: {cost}, Available: {current_user.coins}.",
        )

    current_user.coins -= cost
    current_user.unlocked_items = list(current_user.unlocked_items) + [item_id]
    flag_modified(current_user, "unlocked_items")

    if item_type == "frame":
        current_user.equipped_frame = item_id
    elif item_type == "stamp":
        current_user.equipped_stamp = item_id

    await db.flush()
    logger.info(
        "[PROGRESSION] User '%s' purchased %s '%s' for %d coins",
        current_user.username,
        item_type,
        item_id,
        cost,
    )

    return current_user


@router.post("/equip-cosmetic", response_model=ProgressionResponse)
async def equip_cosmetic(
    payload: EquipCosmeticRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Equip or unequip a frame or stamp."""
    _ensure_progression_defaults(current_user)
    item_id = payload.item_id.strip() if payload.item_id else None

    if item_id:
        if item_id not in current_user.unlocked_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Item '{item_id}' is not in your unlocked inventory.",
            )

    if payload.item_type == "frame":
        current_user.equipped_frame = item_id
    elif payload.item_type == "stamp":
        current_user.equipped_stamp = item_id

    await db.flush()
    logger.info(
        "[PROGRESSION] User '%s' updated %s to '%s'",
        current_user.username,
        payload.item_type,
        item_id,
    )

    return current_user


@router.post("/rewards")
async def sync_rewards(
    current_user: User = Depends(get_current_user),
):
    """
    Direct client reward submission is permanently disabled.
    Multiplayer match rewards are calculated and awarded exclusively by the
    server during authoritative match finalization.
    """
    logger.warning(
        "[PROGRESSION] Blocked direct reward submission attempt from user '%s' (ID: %s)",
        current_user.username,
        current_user.id,
    )
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Direct client reward submission is disabled. Rewards are awarded exclusively by the server upon verified match completion.",
    )

