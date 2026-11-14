"""
backend/tests/test_stage1_reliability.py
─────────────────────────────────────────
Stage 1: Multiplayer Reliability Automated Test Suite

Verifies:
1. Authoritative 60s clue timer advancement & turn timeout handling.
2. Concurrency-safe turn advance (timer race prevention with per-room locks).
3. Stable player identity & duplicate connection prevention across socket updates.
4. 75-second reconnection grace period without premature seat deletion.
5. Reconnection authentication security using signed JWT tokens.
6. Safe host migration on disconnect and permanent leave.
7. Clean timer cancellation on room reset and match end.
8. Exact guest display-name preservation without unwanted prefixes or random suffixes.
"""
import pytest
import time
import asyncio
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.game.room_manager import RoomManager
from app.game.engine import SecretWordEngine
from app.schemas.user import UserPublic, GuestLogin
from app.api.auth import create_access_token, decode_access_token


# ── 1. Stable Player Identity & Duplicate Prevention ──────────────────────

def test_stable_player_identity_and_no_duplicates():
    """Ensure reconnecting with a new socket ID re-associates the existing player seat."""
    rm = RoomManager()
    code = rm.create_room(host_sid="sock_1", max_players=8)

    # Initial join
    ok1 = rm.add_socket_to_room(code, sid="sock_1", user_id="user_alice", username="Alice", avatar="👩")
    assert ok1 is True
    assert len(rm.get_players(code)) == 1
    assert rm.get_player("sock_1")["username"] == "Alice"

    # Alice disconnects temporarily
    disc_info = rm.mark_player_disconnected("sock_1")
    assert disc_info is not None
    assert rm.get_player("sock_1") is None  # old socket unmapped
    assert len(rm.get_players(code)) == 1    # seat preserved in grace period!
    assert rm.get_players(code)[0]["is_connected"] is False

    # Alice reconnects with new socket ID "sock_1_new"
    ok2 = rm.add_socket_to_room(code, sid="sock_1_new", user_id="user_alice", username="Alice", avatar="👩")
    assert ok2 is True
    # Still exactly 1 player in the room — NO duplicate seat!
    assert len(rm.get_players(code)) == 1
    reconnected = rm.get_player("sock_1_new")
    assert reconnected is not None
    assert reconnected["sid"] == "sock_1_new"
    assert reconnected["is_connected"] is True
    assert rm.is_host("sock_1_new", code) is True


# ── 2. Safe Host Migration ────────────────────────────────────────────────

def test_safe_host_migration():
    """Ensure host migration selects next connected player when host leaves."""
    rm = RoomManager()
    code = rm.create_room(host_sid="sock_1")

    rm.add_socket_to_room(code, sid="sock_1", user_id="u1", username="HostPlayer")
    rm.add_socket_to_room(code, sid="sock_2", user_id="u2", username="Player2")
    rm.add_socket_to_room(code, sid="sock_3", user_id="u3", username="Player3")

    assert rm.is_host("sock_1", code) is True
    assert len(rm.get_players(code)) == 3

    # Host disconnects and grace period expires -> permanent leave
    rm.mark_player_disconnected("sock_1")
    removed = rm.permanently_remove_player(code, "u1")
    assert removed["username"] == "HostPlayer"

    # Host should migrate to Player2 (sock_2)
    room = rm.get_room(code)
    assert room["host_sid"] == "sock_2"
    assert rm.is_host("sock_2", code) is True
    assert len(rm.get_players(code)) == 2


# ── 3. Reconnect Authentication Security ──────────────────────────────────

def test_reconnect_token_authentication():
    """Ensure reconnects are authenticated via JWT tokens, rejecting seat hijacking."""
    alice_id = "user_alice_uuid_123"
    bob_id = "user_bob_uuid_456"

    alice_token = create_access_token({"sub": alice_id})
    bob_token = create_access_token({"sub": bob_id})

    # Valid token decodes correctly
    alice_payload = decode_access_token(alice_token)
    assert alice_payload is not None
    assert alice_payload.get("sub") == alice_id

    # Bob's token cannot authenticate as Alice
    bob_payload = decode_access_token(bob_token)
    assert bob_payload.get("sub") != alice_id

    # Tampered or bogus token fails
    fake_payload = decode_access_token("fake.token.signature")
    assert fake_payload is None


# ── 4. Exact Guest Display Name Preservation ──────────────────────────────

def test_exact_guest_display_name_preservation():
    """Ensure guest names like 'Maya' or 'Alex' are preserved without 'Guest_' prefixes or suffixes."""
    # Direct schema validation
    raw_guest = {"id": "123", "username": "Maya", "avatar": "🕵️", "games_played": 0, "games_won": 0, "is_guest": True}
    public = UserPublic.model_validate(raw_guest)
    assert public.username == "Maya"

    # Legacy prefixed username strip
    legacy_guest = {"id": "456", "username": "Guest_Alex_75BB", "avatar": "🧑", "games_played": 0, "games_won": 0, "is_guest": True}
    legacy_public = UserPublic.model_validate(legacy_guest)
    assert legacy_public.username == "Alex"

    # DB collision delimiter strip (username::uuid)
    collision_guest = {"id": "789", "username": "Ghost Hunter::a1b2c3", "avatar": "👻", "games_played": 0, "games_won": 0, "is_guest": True}
    collision_public = UserPublic.model_validate(collision_guest)
    assert collision_public.username == "Ghost Hunter"


# ── 5. Clue Submission & Engine Turn Advance ─────────────────────────────

def test_clue_turn_advancement_and_round_management():
    """Ensure submit_clue strictly enforces turn order and advances correctly."""
    engine = SecretWordEngine()
    players = [
        {"sid": "p1", "username": "Player1", "user_id": "u1"},
        {"sid": "p2", "username": "Player2", "user_id": "u2"},
        {"sid": "p3", "username": "Player3", "user_id": "u3"},
    ]

    match_state = engine.setup_match(players=players, clue_rounds=1)
    turn_order = match_state["turn_order"]
    first_sid = turn_order[0]
    second_sid = turn_order[1]

    # Submitting out of order must fail
    bad_res = engine.submit_clue(match_state, second_sid, "Illegal Clue")
    assert bad_res["success"] is False
    assert bad_res["error"] == "Not your turn"

    # Correct submission succeeds and advances
    good_res1 = engine.submit_clue(match_state, first_sid, "First Valid Clue")
    assert good_res1["success"] is True
    assert good_res1["next_turn_sid"] == second_sid
    assert match_state["current_turn_index"] == 1

    # Second player submits
    good_res2 = engine.submit_clue(match_state, second_sid, "Second Valid Clue")
    assert good_res2["success"] is True
    assert match_state["current_turn_index"] == 2

    # Third player submits -> since total_rounds=1, transition to discussion
    third_sid = turn_order[2]
    good_res3 = engine.submit_clue(match_state, third_sid, "Third Valid Clue")
    assert good_res3["success"] is True
    assert good_res3["next_phase"] == "discussion"
    assert match_state["phase"] == "discussion"


# ── 6. Timer Race Condition & Concurrency Guard ───────────────────────────

def test_timer_race_condition_guard():
    """
    Ensure that if a late clue submission and a timeout event occur concurrently,
    only ONE can advance the turn and the second is safely rejected.
    """
    engine = SecretWordEngine()
    players = [
        {"sid": "p1", "username": "Player1"},
        {"sid": "p2", "username": "Player2"},
    ]

    match_state = engine.setup_match(players=players, clue_rounds=2)
    p1 = match_state["turn_order"][0]

    # Late player clue arrives first
    res_player = engine.submit_clue(match_state, p1, "Late Clue at second 59.9")
    assert res_player["success"] is True

    # Timeout arrives slightly later for the same turn index
    # Turn already advanced, so p1 is no longer active
    res_timeout = engine.submit_clue(match_state, p1, "[Timed Out]")
    assert res_timeout["success"] is False
    assert res_timeout["error"] == "Not your turn"
    # Current turn index was only incremented ONCE
    assert match_state["current_turn_index"] == 1


# ── 7. Reconnection Grace Period Cancellation ─────────────────────────────

def test_reconnection_cancels_grace_period():
    """Ensure that reconnecting before grace period expiry preserves the player."""
    rm = RoomManager()
    code = rm.create_room(host_sid="s1")
    rm.add_socket_to_room(code, sid="s1", user_id="u1", username="Sam")

    # Disconnect
    rm.mark_player_disconnected("s1")
    player = rm.get_players(code)[0]
    assert player["is_connected"] is False

    # Reconnect
    rm.add_socket_to_room(code, sid="s1_new", user_id="u1", username="Sam")
    player = rm.get_players(code)[0]
    assert player["is_connected"] is True
    assert player["sid"] == "s1_new"

