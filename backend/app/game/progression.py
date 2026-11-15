"""
app/game/progression.py
───────────────────────
Gamification & Progression System for 'Catch Me If You Can?'.
Features:
- XP Calculation based on match actions
- Level progression (formula: XP_req = level * 250)
- Coin economy (earned strictly through gameplay, 100% free)
- Daily Missions & Weekly Challenges
- Achievement Badges
- Cosmetic items (Avatar frames, title banners, vote stamps)
"""
from typing import Dict, Any, List
import logging
import asyncio
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.database import AsyncSessionLocal
from app.models.user import User, MatchRewardLedger

logger = logging.getLogger(__name__)

# Level curve: 250 XP per level (Level 1: 0-249 XP, Level 2: 250-499 XP, etc.)
def get_xp_for_level(level: int) -> int:
    return max(0, (level - 1) * 250)

def get_level_info(xp: int) -> Dict[str, Any]:
    level = max(1, (xp // 250) + 1)
    current_level_base_xp = (level - 1) * 250
    xp_in_level = max(0, xp - current_level_base_xp)
    progress_pct = min(100.0, max(0.0, (xp_in_level / 250.0) * 100.0))
    return {
        "level": level,
        "total_xp": xp,
        "current_level_xp": xp_in_level,
        "next_level_xp": 250,
        "progress_pct": round(progress_pct, 1),
        "xp_to_next_level": 250 - xp_in_level
    }

def calculate_match_rewards(
    won: bool,
    role: str,
    was_impostor: bool,
    guessed_word_correctly: bool = False,
    times_accused: int = 0,
    rounds_survived: int = 0
) -> Dict[str, Any]:
    """
    Computes XP, Coins, and Badges earned from a completed match.
    Pure calculation function with zero external or state dependencies.
    """
    xp = 100 # Base match completion XP
    coins = 30 # Base coins

    win_xp = 150 if won else 0
    win_coins = 50 if won else 0
    xp += win_xp
    coins += win_coins

    imp_xp = 0
    imp_coins = 0
    guess_xp = 0
    guess_coins = 0
    innocent_xp = 0
    innocent_coins = 0

    if was_impostor:
        if won:
            imp_xp = 150
            imp_coins = 60 # Bonus for successfully deceiving everyone
            xp += imp_xp
            coins += imp_coins
        if guessed_word_correctly:
            guess_xp = 200
            guess_coins = 80 # Big reward for stealing victory at the last second!
            xp += guess_xp
            coins += guess_coins
    else:
        # Innocent reward
        if won:
            innocent_xp = 75
            innocent_coins = 25
            xp += innocent_xp
            coins += innocent_coins

    # Survival bonus (0 in Stage 2 since round survival tracking is omitted)
    survival_xp = rounds_survived * 25
    xp += survival_xp

    return {
        "xp_earned": xp,
        "coins_earned": coins,
        "won": won,
        "was_impostor": was_impostor,
        "guessed_word_correctly": guessed_word_correctly,
        "breakdown": {
            "base_xp": 100,
            "base_coins": 30,
            "win_bonus_xp": win_xp,
            "win_bonus_coins": win_coins,
            "impostor_bonus_xp": imp_xp,
            "impostor_bonus_coins": imp_coins,
            "word_guess_bonus_xp": guess_xp,
            "word_guess_bonus_coins": guess_coins,
            "innocent_bonus_xp": innocent_xp,
            "innocent_bonus_coins": innocent_coins,
            "survival_bonus_xp": survival_xp
        }
    }


# In-process lock to prevent concurrent reward persistence collisions
_reward_lock = asyncio.Lock()


async def apply_authoritative_rewards(
    match_id: str,
    player_rewards: list[dict],
    is_valid_match: bool = True,
) -> dict[str, dict]:
    """
    Authoritatively persists match rewards directly into database accounts for human participants.

    Guarantees:
    - ACID transaction: ledger entry + user balance increment committed atomically.
    - Idempotency: match_reward_ledger with unique constraint on (match_id, user_id) blocks duplicate rewards.
    - Bot exclusion: bots and unverified seats are strictly excluded.
    - Invalid/abandoned match protection: abandoned matches (is_valid_match=False) receive zero rewards.
    - Preserves progression formula: level is recalculated from total xp.
    """
    if not is_valid_match or not match_id or match_id.startswith("match_unknown"):
        logger.warning("[REWARDS] Skipping reward persistence for invalid or abandoned match: %s", match_id)
        return {}

    # Filter eligible human players with non-zero rewards
    eligible_rewards = [
        p for p in player_rewards
        if not p.get("is_bot", False)
        and p.get("user_id")
        and (int(p.get("xp_earned", 0)) > 0 or int(p.get("coins_earned", 0)) > 0)
    ]
    if not eligible_rewards:
        return {}

    # SEC-05: Sort deterministically by user_id to enforce consistent row-lock order and avoid deadlocks
    sorted_rewards = sorted(eligible_rewards, key=lambda p: str(p["user_id"]))
    updated_users: dict[str, dict] = {}

    async with _reward_lock:
        try:
            async with AsyncSessionLocal() as session:
                async with session.begin():
                    for p in sorted_rewards:
                        user_id = str(p["user_id"])
                        xp_earned = int(p.get("xp_earned", 0))
                        coins_earned = int(p.get("coins_earned", 0))

                        # SEC-05: Acquire row lock on User first to serialize access
                        user = (
                            await session.execute(
                                select(User).where(User.id == user_id).with_for_update()
                            )
                        ).scalar_one_or_none()

                        if not user:
                            logger.warning("[REWARDS] User %s not found in database. Skipping.", user_id)
                            continue

                        # Idempotency check with user row lock held
                        ledger_check = await session.execute(
                            select(MatchRewardLedger).where(
                                MatchRewardLedger.match_id == match_id,
                                MatchRewardLedger.user_id == user_id,
                            )
                        )
                        if ledger_check.scalar_one_or_none() is not None:
                            logger.info(
                                "[REWARDS] User %s already received rewards for match %s. Skipping duplicate.",
                                user_id,
                                match_id,
                            )
                            continue

                        # Add to ledger
                        ledger_record = MatchRewardLedger(
                            match_id=match_id,
                            user_id=user_id,
                            xp_awarded=xp_earned,
                            coins_awarded=coins_earned,
                        )
                        session.add(ledger_record)
                        await session.flush()

                        # Authoritatively increment account balance & lifetime statistics
                        user.xp += xp_earned
                        user.coins += coins_earned
                        user.level = max(1, (user.xp // 250) + 1)
                        user.games_played = (user.games_played or 0) + 1
                        if p.get("won"):
                            user.games_won = (user.games_won or 0) + 1
                        if p.get("was_impostor"):
                            if p.get("won"):
                                user.times_escaped = (user.times_escaped or 0) + 1
                            else:
                                user.times_caught = (user.times_caught or 0) + 1

                        updated_users[user_id] = {
                            "user_id": user_id,
                            "new_total_xp": user.xp,
                            "new_total_coins": user.coins,
                            "new_level": user.level,
                            "xp_earned": xp_earned,
                            "coins_earned": coins_earned,
                        }

                        logger.info(
                            "[REWARDS AUTHORITATIVE] Awarded match %s rewards to %s: +%d XP, +%d Coins (Total XP: %d, Coins: %d, Level: %d)",
                            match_id,
                            user.username,
                            xp_earned,
                            coins_earned,
                            user.xp,
                            user.coins,
                            user.level,
                        )
        except IntegrityError as e:
            # SEC-04: Narrowly handle unique constraint collision (e.g. concurrent race caught by uq_match_user_reward)
            logger.warning(
                "[REWARDS] Unique constraint violation on match_reward_ledger for match %s (handled via idempotency): %s",
                match_id,
                e,
            )
            updated_users.clear()

    return updated_users


# ── Daily Missions ────────────────────────────────────────────────

DAILY_MISSIONS = [
    {
        "id": "play_3_matches",
        "title": "Party Enthusiast",
        "desc": "Play 3 matches in any game mode",
        "target": 3,
        "reward_coins": 100,
        "reward_xp": 200
    },
    {
        "id": "undercover_win",
        "title": "Master of Disguise",
        "desc": "Win a game in Undercover mode",
        "target": 1,
        "reward_coins": 150,
        "reward_xp": 300
    },
    {
        "id": "guess_word",
        "title": "Mind Reader",
        "desc": "Guess the secret word correctly as Impostor",
        "target": 1,
        "reward_coins": 200,
        "reward_xp": 350
    },
    {
        "id": "give_subtle_clue",
        "title": "Silver Tongue",
        "desc": "Submit 5 clues with balanced semantic rating",
        "target": 5,
        "reward_coins": 80,
        "reward_xp": 150
    }
]


# ── Cosmetic Vault Items ──────────────────────────────────────────

COSMETIC_CATALOG = [
    {
        "id": "frame_neon_cyan",
        "name": "Neon Glitch Frame",
        "type": "avatar_frame",
        "price_coins": 250,
        "rarity": "rare",
        "color": "#00F5D4",
        "unlocked_default": False
    },
    {
        "id": "frame_gold_detective",
        "name": "Golden Detective Ring",
        "type": "avatar_frame",
        "price_coins": 500,
        "rarity": "epic",
        "color": "#FFD166",
        "unlocked_default": False
    },
    {
        "id": "frame_crimson_shadow",
        "name": "Crimson Shadow Cloak",
        "type": "avatar_frame",
        "price_coins": 750,
        "rarity": "legendary",
        "color": "#FF2E63",
        "unlocked_default": False
    },
    {
        "id": "stamp_sus",
        "name": "SUS! Vote Stamp",
        "type": "vote_stamp",
        "price_coins": 150,
        "rarity": "common",
        "emoji": "🚨",
        "unlocked_default": True
    },
    {
        "id": "stamp_caught",
        "name": "CAUGHT RED-HANDED",
        "type": "vote_stamp",
        "price_coins": 300,
        "rarity": "rare",
        "emoji": "🔒",
        "unlocked_default": False
    },
    {
        "id": "stamp_guilty",
        "name": "GUILTY AS CHARGED",
        "type": "vote_stamp",
        "price_coins": 450,
        "rarity": "epic",
        "emoji": "⚖️",
        "unlocked_default": False
    }
]


def get_cosmetics() -> List[Dict[str, Any]]:
    return COSMETIC_CATALOG

def get_daily_missions() -> List[Dict[str, Any]]:
    return DAILY_MISSIONS
