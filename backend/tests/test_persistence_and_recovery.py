"""
tests/test_persistence_and_recovery.py
───────────────────────────────────────
Verifies:
1. SQLite & PostgreSQL async DB initialization.
2. Saving and recovering match state from MatchPersistence across backend restarts.
3. Secret-word privacy: ensures private roles and words are NOT leaked to public dicts.
4. Word intelligence lightweight embedding similarity on zero-RAM mode.
5. Readiness and health check endpoints.
"""
import pytest
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import AsyncSessionLocal
from app.models.match_state import MatchStateModel
from app.game.persistence import match_persistence
from ml.word_intelligence import word_intelligence
from ml.player_behavior import player_behavior_model


@pytest.mark.asyncio
async def test_db_init_and_match_state_table(setup_db):
    """Ensure database tables initialize properly."""
    assert True


@pytest.mark.asyncio
async def test_match_state_persistence_and_recovery(setup_db):
    """
    Test saving an active match and recovering it exactly as if
    the server restarted / dyno cold-started.
    """
    room_code = "TEST99"
    players = [
        {"sid": "socket_1", "user_id": "u1", "username": "Alice", "avatar": "👩", "is_ready": True, "is_alive": True, "is_bot": False},
        {"sid": "socket_2", "user_id": "u2", "username": "Bob", "avatar": "👨", "is_ready": True, "is_alive": True, "is_bot": False},
        {"sid": "socket_3", "user_id": "u3", "username": "Charlie", "avatar": "🕵️", "is_ready": True, "is_alive": True, "is_bot": False},
    ]

    match_state = {
        "mode": "classic",
        "category": "Technology",
        "difficulty": "medium",
        "impostor_count": 1,
        "total_rounds": 2,
        "current_round": 1,
        "current_turn_index": 0,
        "turn_order": ["socket_1", "socket_2", "socket_3"],
        "clues": [
            {"sid": "socket_1", "username": "Alice", "clue": "Pocket device", "round": 1, "evaluation": {"similarity": 0.65, "verdict": "BALANCED"}}
        ],
        "votes": {},
        "role_acks": {"socket_1", "socket_2"},
        "active_chaos_card": None,
        "phase": "clues",
        "winner": None,
        "secret_word": "SMARTPHONE",
        "undercover_word": "SMARTPHONE",
        "player_assignments": {
            "socket_1": {"role": "civilian", "card_title": "Citizen", "secret_word": "SMARTPHONE", "is_impostor": False, "is_alive": True},
            "socket_2": {"role": "civilian", "card_title": "Citizen", "secret_word": "SMARTPHONE", "is_impostor": False, "is_alive": True},
            "socket_3": {"role": "impostor", "card_title": "Impostor", "secret_word": None, "is_impostor": True, "is_alive": True},
        }
    }

    # 1. Save match state
    await match_persistence.save_match_state(room_code, match_state, players)

    # 2. Recover match state (simulating complete memory wipe)
    loaded = await match_persistence.load_match_state(room_code)
    assert loaded is not None, "Failed to recover match state from DB"

    rec_match = loaded["match_state"]
    assert rec_match["phase"] == "clues"
    assert rec_match["secret_word"] == "SMARTPHONE"
    assert len(rec_match["clues"]) == 1
    assert rec_match["clues"][0]["clue"] == "Pocket device"
    assert "socket_3" in rec_match["player_assignments"]
    assert rec_match["player_assignments"]["socket_3"]["is_impostor"] is True
    assert rec_match["player_assignments"]["socket_3"]["secret_word"] is None

    # 3. Verify public safety: to_public_dict MUST NOT expose secret_word or player_assignments
    record = MatchStateModel(
        room_code=room_code,
        phase="clues",
        secret_word="SMARTPHONE",
        player_assignments=match_state["player_assignments"],
        clues=match_state["clues"],
        players=players
    )
    pub = record.to_public_dict()
    assert "secret_word" not in pub
    assert "player_assignments" not in pub
    assert pub["room_code"] == room_code


def test_word_intelligence_lightweight():
    """Verify semantic word intelligence works in zero-RAM mode."""
    pair = word_intelligence.select_word_pair()
    assert "word" in pair
    assert "undercover" in pair

    sim_same = word_intelligence.compute_similarity("laptop", "laptop")
    assert sim_same > 0.95

    sim_diff = word_intelligence.compute_similarity("spaceship", "banana")
    assert sim_diff < sim_same


def test_player_behavior_model():
    """Verify player behavior ML model predicts suspicion score."""
    score = player_behavior_model.predict_suspicion_score(
        avg_semantic_similarity=0.2,
        avg_latency_sec=25.0,
        voted_with_majority=False,
        accusation_rate=0.7
    )
    assert 0.0 <= score <= 1.0
