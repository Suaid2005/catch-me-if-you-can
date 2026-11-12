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

# Level curve: 1 -> 2: 250 XP, 2 -> 3: 500 XP, etc.
def get_xp_for_level(level: int) -> int:
    return level * 250

def calculate_match_rewards(
    won: bool,
    role: str,
    was_impostor: bool,
    guessed_word_correctly: bool = False,
    times_accused: int = 0,
    rounds_survived: int = 1
) -> Dict[str, Any]:
    """
    Computes XP, Coins, and Badges earned from a completed match.
    """
    xp = 100 # Base match completion XP
    coins = 30 # Base coins

    if won:
        xp += 150
        coins += 50

    if was_impostor:
        if won:
            xp += 150
            coins += 60 # Bonus for successfully deceiving everyone
        if guessed_word_correctly:
            xp += 200
            coins += 80 # Big reward for stealing victory at the last second!
    else:
        # Innocent reward
        if won:
            xp += 75
            coins += 25

    # Survival bonus
    xp += rounds_survived * 25

    return {
        "xp_earned": xp,
        "coins_earned": coins,
        "won": won,
        "was_impostor": was_impostor,
        "guessed_word_correctly": guessed_word_correctly
    }


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
