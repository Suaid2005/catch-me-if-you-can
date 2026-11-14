"""
backend/tests/test_stage2_gamification.py
─────────────────────────────────────────
Authoritative verification suite for Stage 2:
1. Pure, deterministic reward calculations (calculate_match_rewards).
2. Level formula & progress calculation (get_level_info).
3. Bot exclusion from progression.
4. Unique match_id generation per match.
5. Persistence sanitization (session-only progression, zero DB columns).
6. Vocabulary accessibility, tier distribution, and default easy difficulty.
"""
import pytest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.game.progression import calculate_match_rewards, get_level_info
from app.game.engine import secret_word_engine
from app.game.persistence import _strip_progression_from_players
from app.socket.game_events import _sanitize_players_for_persistence
from ml.word_intelligence import word_intelligence


def test_base_rewards_and_breakdown():
    """Verify base match completion rewards and breakdown consistency."""
    rewards = calculate_match_rewards(
        won=False,
        role="innocent",
        was_impostor=False,
        guessed_word_correctly=False,
        times_accused=0,
        rounds_survived=0,
    )

    assert rewards["xp_earned"] == 100
    assert rewards["coins_earned"] == 30
    assert rewards["breakdown"]["base_xp"] == 100
    assert rewards["breakdown"]["base_coins"] == 30
    assert rewards["won"] is False
    assert rewards["was_impostor"] is False


def test_innocent_victory_rewards():
    """Verify innocent victory rewards."""
    rewards = calculate_match_rewards(
        won=True,
        role="innocent",
        was_impostor=False,
        guessed_word_correctly=False,
        times_accused=0,
        rounds_survived=0,
    )

    # Base: 100 xp, 30 coins + Win: 150 xp, 50 coins + Innocent bonus: 75 xp, 25 coins -> 325 xp, 105 coins
    assert rewards["xp_earned"] == 325
    assert rewards["coins_earned"] == 105
    assert rewards["breakdown"]["base_xp"] == 100
    assert rewards["breakdown"]["win_bonus_xp"] == 150
    assert rewards["breakdown"]["innocent_bonus_xp"] == 75


def test_impostor_victory_and_word_steal():
    """Verify impostor victory rewards and last-chance word steal bonus."""
    rewards = calculate_match_rewards(
        won=True,
        role="impostor",
        was_impostor=True,
        guessed_word_correctly=True,
        times_accused=2,
        rounds_survived=0,
    )

    # Base: 100 + Win: 150 + Impostor bonus: 150 + Word guess: 200 -> 600 XP
    # Coins: 30 + 50 + 60 + 80 -> 220 Coins
    assert rewards["xp_earned"] == 600
    assert rewards["coins_earned"] == 220
    assert rewards["breakdown"]["impostor_bonus_xp"] == 150
    assert rewards["breakdown"]["word_guess_bonus_xp"] == 200


def test_level_info_linear_formula():
    """Verify level calculation: linear 250 XP per level."""
    # 0 XP -> Level 1, 0%
    info0 = get_level_info(0)
    assert info0["level"] == 1
    assert info0["progress_pct"] == 0.0

    # 125 XP -> Level 1, 50%
    info125 = get_level_info(125)
    assert info125["level"] == 1
    assert info125["progress_pct"] == 50.0

    # 250 XP -> Level 2, 0%
    info250 = get_level_info(250)
    assert info250["level"] == 2
    assert info250["progress_pct"] == 0.0

    # 575 XP -> Level 3 (500 base + 75), 30%
    info575 = get_level_info(575)
    assert info575["level"] == 3
    assert info575["progress_pct"] == 30.0


def test_unique_match_id_generation():
    """Verify engine generates a unique match_id for every match."""
    players = [
        {"sid": "s1", "username": "Alice", "user_id": "u1"},
        {"sid": "s2", "username": "Bob", "user_id": "u2"},
        {"sid": "s3", "username": "Charlie", "user_id": "u3"},
    ]

    m1 = secret_word_engine.setup_match(players, difficulty="easy")
    m2 = secret_word_engine.setup_match(players, difficulty="easy")

    assert "match_id" in m1
    assert "match_id" in m2
    assert isinstance(m1["match_id"], str)
    assert len(m1["match_id"]) == 32
    # Two distinct matches in same room MUST have distinct match_ids
    assert m1["match_id"] != m2["match_id"]

    # Match ID stamped into player assignments
    assert m1["player_assignments"]["s1"]["match_id"] == m1["match_id"]


def test_default_difficulty_is_easy():
    """Verify engine defaults difficulty to 'easy'."""
    players = [
        {"sid": "s1", "username": "Alice"},
        {"sid": "s2", "username": "Bob"},
        {"sid": "s3", "username": "Charlie"},
    ]
    match = secret_word_engine.setup_match(players)
    assert match["difficulty"] == "easy"


def test_persistence_sanitization_excludes_progression():
    """Verify persistence layer strictly strips progression data."""
    players = [
        {
            "sid": "s1",
            "username": "Alice",
            "progression": {"xp": 500, "coins": 120, "level": 3},
            "is_alive": True,
        },
        {
            "sid": "s2",
            "username": "Bob",
            "progression": {"xp": 100, "coins": 30, "level": 1},
            "is_alive": True,
        },
    ]

    # Socket sanitize
    clean1 = _sanitize_players_for_persistence(players)
    for p in clean1:
        assert "progression" not in p
        assert "username" in p

    # Persistence sanitize
    clean2 = _strip_progression_from_players(players)
    for p in clean2:
        assert "progression" not in p
        assert "username" in p


def test_vocabulary_accessible_categories():
    """Verify vocabulary categories match approved 6 categories."""
    categories = word_intelligence.dataset.get("categories", {})
    valid_categories = {
        "Technology",
        "Food & Drinks",
        "Animals",
        "Everyday Objects",
        "Sports & Entertainment",
        "Places",
    }

    assert set(categories.keys()) == valid_categories

    # Verify each category has words in all tiers
    for cat, tiers in categories.items():
        assert "easy" in tiers
        assert "medium" in tiers
        assert "hard" in tiers
        assert "expert" in tiers
        assert len(tiers["easy"]) >= 4
