"""
app/schemas/progression.py
──────────────────────────
Pydantic schemas and cosmetic catalog definitions for persistent progression,
vault purchases, and avatar equipment.
"""
from pydantic import BaseModel, Field


# Canonical Vault & Cosmetic Catalog with authoritative costs and item types
CATALOG_ITEMS: dict[str, dict[str, int | str]] = {
    # Avatars
    "avatar_classic_detective": {"cost": 0, "type": "avatar"},
    "avatar_cyber_detective": {"cost": 150, "type": "avatar"},
    "avatar_shadow_agent": {"cost": 200, "type": "avatar"},
    "avatar_neon_hacker": {"cost": 250, "type": "avatar"},
    "avatar_golden_investigator": {"cost": 400, "type": "avatar"},
    "avatar_mystery_phantom": {"cost": 500, "type": "avatar"},
    # Frames
    "frame_neon_cyan": {"cost": 250, "type": "frame"},
    "frame_gold_detective": {"cost": 500, "type": "frame"},
    "frame_crimson_shadow": {"cost": 750, "type": "frame"},
    # Stamps
    "stamp_sus": {"cost": 0, "type": "stamp"},
    "stamp_caught": {"cost": 300, "type": "stamp"},
    "stamp_guilty": {"cost": 450, "type": "stamp"},
}


class ProgressionResponse(BaseModel):
    xp: int
    coins: int
    level: int
    unlocked_avatars: list[str]
    equipped_avatar: str
    unlocked_items: list[str]
    equipped_frame: str | None
    equipped_stamp: str | None

    model_config = {"from_attributes": True}


class PurchaseAvatarRequest(BaseModel):
    avatar_id: str = Field(..., min_length=3, max_length=64)


class EquipAvatarRequest(BaseModel):
    avatar_id: str = Field(..., min_length=3, max_length=64)


class PurchaseCosmeticRequest(BaseModel):
    item_id: str = Field(..., min_length=3, max_length=64)


class EquipCosmeticRequest(BaseModel):
    item_type: str = Field(..., pattern=r"^(frame|stamp)$")
    item_id: str | None = Field(default=None, max_length=64)


class RewardSyncRequest(BaseModel):
    xp_earned: int = Field(ge=0, le=100000)
    coins_earned: int = Field(ge=0, le=100000)


class PracticeMatchCompleteRequest(BaseModel):
    won: bool
    role: str = Field(default="civilian", max_length=32)
    was_impostor: bool = False
    guessed_word_correctly: bool = False
    rounds_survived: int = Field(default=0, ge=0, le=10)
    difficulty: str = Field(default="easy", max_length=16)


