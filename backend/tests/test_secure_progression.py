"""
backend/tests/test_secure_progression.py
────────────────────────────────────────
Security Verification Suite for Server-Authoritative Progression & Anti-Manipulation:
1. test_arbitrary_reward_injection_rejected: Direct client reward submission to POST /api/progression/rewards returns 403 Forbidden.
2. test_valid_match_awards_rewards: Authoritative match finalization awards XP/coins and recalculates level.
3. test_duplicate_match_reward_prevented: A match cannot award rewards twice (idempotency via MatchRewardLedger).
4. test_concurrent_match_finalization_idempotency: Concurrent finalizations cannot duplicate rewards (ACID transaction & unique constraint).
5. test_bots_and_guests_excluded_from_rewards: Bots and guest seats are strictly excluded from reward persistence.
6. test_invalid_or_abandoned_match_no_rewards: Abandoned or invalid matches award zero rewards.
7. test_cross_player_reward_isolation: Rewards for Player A never leak or affect Player B.
8. test_store_purchases_and_equipment_remain_functional: Avatar purchase, equipping, and cosmetic system remain intact.
9. test_finalize_match_core_authoritative_persistence: In-game match finalization orchestrates authoritative DB updates.
"""
import uuid
import asyncio
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, func

from app.main import app
from app.database import init_db, close_db, AsyncSessionLocal
from app.models.user import User, MatchRewardLedger
from app.game.progression import apply_authoritative_rewards, calculate_match_rewards, get_level_info
from unittest.mock import patch
from sqlalchemy.exc import OperationalError
from app.socket.game_events import (
    _finalize_match_core,
    active_matches,
    game_final_guess,
    _start_final_guess_timer,
    _cancel_final_guess_timer,
    _active_final_guess_timers,
    cancel_all_game_timers,
)
from app.game.room_manager import room_manager


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def register_and_activate(client, username, email, password):
    phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
    reg_res = await client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "phone_number": phone, "password": password, "confirm_password": password},
    )
    reg_data = reg_res.json()
    token = reg_data["registration_token"]
    email_otp = reg_data["dev_email_otp"]
    phone_otp = reg_data["dev_phone_otp"]
    await client.post("/api/auth/register/verify-email", json={"registration_token": token, "otp": email_otp})
    v2 = await client.post("/api/auth/register/verify-phone", json={"registration_token": token, "otp": phone_otp})
    v2_data = v2.json()
    return {
        "user": {"id": v2_data["user_id"], "username": username},
        "access_token": v2_data["tokens"]["access_token"],
        "refresh_token": v2_data["tokens"]["refresh_token"],
    }


@pytest.mark.asyncio
async def test_arbitrary_reward_injection_rejected(setup_db, client):
    """
    CRITICAL SECURITY TEST:
    Verifies that direct client reward submissions to POST /api/progression/rewards
    are unconditionally rejected with HTTP 403 Forbidden.
    """
    uid = uuid.uuid4().hex[:6]
    username = f"Hacker_{uid}"
    email = f"hacker_{uid}@example.com"
    password = "SecurePassword123!"

    reg = await register_and_activate(client, username, email, password)
    token = reg["access_token"]
    user_id = reg["user"]["id"]
    auth_header = {"Authorization": f"Bearer {token}"}

    # Attempt arbitrary reward injection (e.g. 100,000 XP and 50,000 coins)
    exploit_res = await client.post(
        "/api/progression/rewards",
        headers=auth_header,
        json={"xp_earned": 100000, "coins_earned": 50000},
    )
    assert exploit_res.status_code == 403
    assert "Direct client reward submission is disabled" in exploit_res.json()["detail"]

    # Verify unauthenticated call is rejected with 401
    anon_res = await client.post(
        "/api/progression/rewards",
        json={"xp_earned": 100000, "coins_earned": 50000},
    )
    assert anon_res.status_code == 401

    # Verify user database balance remains strictly unmanipulated
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        assert user.xp == 0
        assert user.coins == 150
        assert user.level == 1


@pytest.mark.asyncio
async def test_valid_match_awards_rewards(setup_db, client):
    """
    Verifies that a valid completed match correctly and authoritatively persists
    rewards to the player's account in the database.
    """
    uid = uuid.uuid4().hex[:6]
    username = f"Valid_{uid}"
    email = f"valid_{uid}@example.com"
    password = "SecurePassword123!"

    reg = await register_and_activate(client, username, email, password)
    user_id = reg["user"]["id"]
    match_id = f"match_valid_{uuid.uuid4().hex[:8]}"

    # Authoritative persistence
    updates = await apply_authoritative_rewards(
        match_id=match_id,
        player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 300, "coins_earned": 120}],
        is_valid_match=True,
    )

    assert user_id in updates
    assert updates[user_id]["new_total_xp"] == 300
    assert updates[user_id]["new_total_coins"] == 270  # 150 default + 120
    assert updates[user_id]["new_level"] == 2  # (300 // 250) + 1 = 2

    # Verify database state
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        assert user.xp == 300
        assert user.coins == 270
        assert user.level == 2

        # Verify ledger record
        ledger = (
            await session.execute(
                select(MatchRewardLedger).where(
                    MatchRewardLedger.match_id == match_id,
                    MatchRewardLedger.user_id == user_id,
                )
            )
        ).scalar_one()
        assert ledger.xp_awarded == 300
        assert ledger.coins_awarded == 120


@pytest.mark.asyncio
async def test_duplicate_match_reward_prevented(setup_db, client):
    """
    Verifies idempotency: a match cannot award rewards more than once to the same user.
    """
    uid = uuid.uuid4().hex[:6]
    reg = await register_and_activate(
        client,
        f"Idempotent_{uid}",
        f"idempotent_{uid}@example.com",
        "Password123!",
    )
    user_id = reg["user"]["id"]
    match_id = f"match_idem_{uuid.uuid4().hex[:8]}"

    # First reward pass
    res1 = await apply_authoritative_rewards(
        match_id=match_id,
        player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 200, "coins_earned": 50}],
        is_valid_match=True,
    )
    assert user_id in res1
    assert res1[user_id]["new_total_coins"] == 200  # 150 + 50

    # Second reward pass with the SAME match_id (simulating duplicate webhook / replay)
    res2 = await apply_authoritative_rewards(
        match_id=match_id,
        player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 200, "coins_earned": 50}],
        is_valid_match=True,
    )
    # The duplicate attempt must be skipped
    assert user_id not in res2

    # Balance must remain unchanged
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        assert user.xp == 200
        assert user.coins == 200

        # Ledger count must be exactly 1
        ledger_count = (
            await session.execute(
                select(func.count(MatchRewardLedger.id)).where(
                    MatchRewardLedger.match_id == match_id,
                    MatchRewardLedger.user_id == user_id,
                )
            )
        ).scalar()
        assert ledger_count == 1


@pytest.mark.asyncio
async def test_concurrent_match_finalization_idempotency(setup_db, client):
    """
    Verifies concurrency protection: simultaneous finalize attempts for the same match
    cannot duplicate rewards or corrupt user balance.
    """
    uid = uuid.uuid4().hex[:6]
    reg = await register_and_activate(
        client,
        f"Concurrent_{uid}",
        f"concurrent_{uid}@example.com",
        "Password123!",
    )
    user_id = reg["user"]["id"]
    match_id = f"match_race_{uuid.uuid4().hex[:8]}"

    # Launch 5 concurrent finalization tasks for the same match
    tasks = [
        apply_authoritative_rewards(
            match_id=match_id,
            player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 100, "coins_earned": 50}],
            is_valid_match=True,
        )
        for _ in range(5)
    ]
    results = await asyncio.gather(*tasks)

    # Exactly one task should have awarded the user
    awarded_count = sum(1 for r in results if user_id in r)
    assert awarded_count == 1

    # Database balance must reflect exactly one award (150 + 50 = 200 coins, 100 XP)
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        assert user.coins == 200
        assert user.xp == 100

        ledger_rows = (
            await session.execute(
                select(MatchRewardLedger).where(
                    MatchRewardLedger.match_id == match_id,
                    MatchRewardLedger.user_id == user_id,
                )
            )
        ).scalars().all()
        assert len(ledger_rows) == 1


@pytest.mark.asyncio
async def test_bots_and_guests_excluded_from_rewards(setup_db, client):
    """
    Verifies that AI bot seats and unauthenticated guest seats are strictly excluded
    from database rewards and ledger persistence.
    """
    match_id = f"match_bots_{uuid.uuid4().hex[:8]}"

    # Test bot seat
    bot_res = await apply_authoritative_rewards(
        match_id=match_id,
        player_rewards=[{"user_id": "some_bot_id", "is_bot": True, "xp_earned": 500, "coins_earned": 200}],
        is_valid_match=True,
    )
    assert bot_res == {}

    # Test guest seat (no user_id)
    guest_res = await apply_authoritative_rewards(
        match_id=match_id,
        player_rewards=[{"user_id": None, "is_bot": False, "xp_earned": 500, "coins_earned": 200}],
        is_valid_match=True,
    )
    assert guest_res == {}

    # Verify zero ledger entries created
    async with AsyncSessionLocal() as session:
        ledgers = (
            await session.execute(
                select(MatchRewardLedger).where(MatchRewardLedger.match_id == match_id)
            )
        ).scalars().all()
        assert len(ledgers) == 0


@pytest.mark.asyncio
async def test_invalid_or_abandoned_match_no_rewards(setup_db, client):
    """
    Verifies that abandoned, aborted, or invalid matches award zero rewards.
    """
    uid = uuid.uuid4().hex[:6]
    reg = await register_and_activate(
        client,
        f"Abandoned_{uid}",
        f"abandoned_{uid}@example.com",
        "Password123!",
    )
    user_id = reg["user"]["id"]

    # 1. is_valid_match=False
    res_invalid = await apply_authoritative_rewards(
        match_id=f"match_inv_{uuid.uuid4().hex[:8]}",
        player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 300, "coins_earned": 100}],
        is_valid_match=False,
    )
    assert res_invalid == {}

    # 2. match_unknown prefix
    res_unknown = await apply_authoritative_rewards(
        match_id="match_unknown_12345",
        player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 300, "coins_earned": 100}],
        is_valid_match=True,
    )
    assert res_unknown == {}

    # 3. empty match_id
    res_empty = await apply_authoritative_rewards(
        match_id="",
        player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 300, "coins_earned": 100}],
        is_valid_match=True,
    )
    assert res_empty == {}

    # Ensure user balance is untouched
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        assert user.xp == 0
        assert user.coins == 150


@pytest.mark.asyncio
async def test_cross_player_reward_isolation(setup_db, client):
    """
    Verifies that rewards for Player A cannot leak into or affect Player B's balance.
    """
    uid1 = uuid.uuid4().hex[:6]
    uid2 = uuid.uuid4().hex[:6]

    reg1 = await register_and_activate(
        client,
        f"PlayerA_{uid1}",
        f"playera_{uid1}@example.com",
        "Password123!",
    )
    user_a_id = reg1["user"]["id"]

    reg2 = await register_and_activate(
        client,
        f"PlayerB_{uid2}",
        f"playerb_{uid2}@example.com",
        "Password123!",
    )
    user_b_id = reg2["user"]["id"]

    match_id = f"match_iso_{uuid.uuid4().hex[:8]}"

    res = await apply_authoritative_rewards(
        match_id=match_id,
        player_rewards=[
            {"user_id": user_a_id, "is_bot": False, "xp_earned": 200, "coins_earned": 100},
            {"user_id": user_b_id, "is_bot": False, "xp_earned": 50, "coins_earned": 20},
        ],
        is_valid_match=True,
    )

    assert res[user_a_id]["new_total_xp"] == 200
    assert res[user_a_id]["new_total_coins"] == 250  # 150 + 100
    assert res[user_b_id]["new_total_xp"] == 50
    assert res[user_b_id]["new_total_coins"] == 170  # 150 + 20

    async with AsyncSessionLocal() as session:
        user_a = (await session.execute(select(User).where(User.id == user_a_id))).scalar_one()
        user_b = (await session.execute(select(User).where(User.id == user_b_id))).scalar_one()
        assert user_a.xp == 200 and user_a.coins == 250
        assert user_b.xp == 50 and user_b.coins == 170


@pytest.mark.asyncio
async def test_store_purchases_and_equipment_remain_functional(setup_db, client):
    """
    Verifies that legitimate cosmetic purchases, avatar unlocking, and equipping
    continue to function correctly and enforce coin balance boundaries.
    """
    uid = uuid.uuid4().hex[:6]
    reg = await register_and_activate(
        client,
        f"Shopper_{uid}",
        f"shopper_{uid}@example.com",
        "Password123!",
    )
    token = reg["access_token"]
    user_id = reg["user"]["id"]
    auth_header = {"Authorization": f"Bearer {token}"}

    # Award coins via authoritative match finalization
    await apply_authoritative_rewards(
        match_id=f"match_shop_{uuid.uuid4().hex[:8]}",
        player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 100, "coins_earned": 200}],
        is_valid_match=True,
    )
    # Total coins: 150 + 200 = 350

    # Purchase avatar_cyber_detective (150 coins)
    buy_res = await client.post(
        "/api/progression/purchase-avatar",
        headers=auth_header,
        json={"avatar_id": "avatar_cyber_detective"},
    )
    assert buy_res.status_code == 200
    assert buy_res.json()["coins"] == 200
    assert buy_res.json()["equipped_avatar"] == "avatar_cyber_detective"

    # Equip classic detective back
    equip_res = await client.post(
        "/api/progression/equip-avatar",
        headers=auth_header,
        json={"avatar_id": "avatar_classic_detective"},
    )
    assert equip_res.status_code == 200
    assert equip_res.json()["equipped_avatar"] == "avatar_classic_detective"

    # Purchase frame_neon_cyan (250 coins) -> Insufficient coins (only 200 left)
    over_res = await client.post(
        "/api/progression/purchase-cosmetic",
        headers=auth_header,
        json={"item_id": "frame_neon_cyan"},
    )
    assert over_res.status_code == 400
    assert "insufficient coins" in over_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_finalize_match_core_authoritative_persistence(setup_db, client):
    """
    Verifies that _finalize_match_core correctly orchestrates match reward calculation,
    bot exclusion, and authoritative persistence into the database.
    """
    uid = uuid.uuid4().hex[:6]
    user_auth = await register_and_activate(client, f"Core_{uid}", f"core_{uid}@example.com", "Password123!")
    user_id = user_auth["user"]["id"]

    room_code = f"T{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=True)
    room = room_manager.get_room(room_code)

    sid_human = f"sid_human_{uid}"
    sid_bot = f"sid_bot_{uid}"

    # Add human and bot
    room_manager.add_socket_to_room(room_code=room_code, sid=sid_human, user_id=user_id, username="HumanDetective")
    room_manager.add_socket_to_room(room_code=room_code, sid=sid_bot, username="BotAgent", is_bot=True)

    match_id = f"match_core_{uuid.uuid4().hex[:8]}"
    active_matches[room_code] = {
        "match_id": match_id,
        "phase": "playing",
        "rewards_calculated": False,
        "player_assignments": {
            sid_human: {"role": "innocent", "team": "innocent", "is_impostor": False, "is_alive": True, "user_id": user_id},
            sid_bot: {"role": "impostor", "team": "impostor", "is_impostor": True, "is_alive": True},
        },
    }

    # Finalize match: innocents win
    results = await _finalize_match_core(
        room_code=room_code,
        winner="innocents",
        win_reason="Impostor identified!",
    )

    assert results["winner"] == "innocents"
    assert sid_human in results["rewards"]
    assert sid_bot not in results["rewards"]  # Bot excluded!

    # Check human reward entry
    human_reward = results["rewards"][sid_human]
    assert human_reward["xp_earned"] > 0
    assert human_reward["coins_earned"] > 0
    assert human_reward["new_total_xp"] > 0

    # Verify that human database account was authoritatively updated
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        assert user.xp == human_reward["new_total_xp"]
        assert user.coins == human_reward["new_total_coins"]

        # Ledger verified
        ledger = (
            await session.execute(
                select(MatchRewardLedger).where(
                    MatchRewardLedger.match_id == match_id,
                    MatchRewardLedger.user_id == user_id,
                )
            )
        ).scalar_one_or_none()
        assert ledger is not None
        assert ledger.xp_awarded == human_reward["xp_earned"]
        assert ledger.coins_awarded == human_reward["coins_earned"]

    # Cleanup in-memory structures
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_final_guess_authorization_and_phase_enforcement(setup_db, client):
    """
    SEC-01 Regression Tests:
    - Final guess rejected during clue and voting phases.
    - Innocent player cannot submit final guess.
    - Authorized caught Impostor can submit final guess.
    - Duplicate final guess submissions rejected.
    """
    uid = uuid.uuid4().hex[:6]
    room_code = f"T{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)

    sid_innocent = f"sid_inno_{uid}"
    sid_impostor = f"sid_imp_{uid}"
    room_manager.add_socket_to_room(room_code, sid=sid_innocent, username="DetectiveAlice")
    room_manager.add_socket_to_room(room_code, sid=sid_impostor, username="ImpostorBob")

    match_id = f"match_fg_{uuid.uuid4().hex[:8]}"
    match_state = {
        "match_id": match_id,
        "phase": "clues",
        "secret_word": "DIAMOND",
        "undercover_word": "RUBY",
        "rewards_calculated": False,
        "final_guess_submitted": False,
        "caught_impostor_sid": None,
        "player_assignments": {
            sid_innocent: {"role": "innocent", "team": "innocent", "is_impostor": False, "is_alive": True},
            sid_impostor: {"role": "impostor", "team": "impostor", "is_impostor": True, "is_alive": False},
        },
    }
    active_matches[room_code] = match_state

    # 1. Attempt final guess during clues phase -> MUST BE REJECTED
    await game_final_guess(sid_impostor, {"guess": "DIAMOND"})
    assert match_state["phase"] == "clues"
    assert not match_state.get("rewards_calculated")
    assert not match_state.get("final_guess_submitted")

    # 2. Transition to voting phase -> MUST BE REJECTED
    match_state["phase"] = "voting"
    await game_final_guess(sid_innocent, {"guess": "DIAMOND"})
    assert match_state["phase"] == "voting"
    assert not match_state.get("rewards_calculated")

    # 3. Transition to final_guess phase, but call from innocent player -> MUST BE REJECTED
    match_state["phase"] = "final_guess"
    match_state["caught_impostor_sid"] = sid_impostor
    await game_final_guess(sid_innocent, {"guess": "DIAMOND"})
    assert match_state["phase"] == "final_guess"
    assert not match_state.get("rewards_calculated")
    assert not match_state.get("final_guess_submitted")

    # 4. Authorized caught impostor submits correct guess -> ACCEPTED, steals victory
    await game_final_guess(sid_impostor, {"guess": "DIAMOND"})
    assert match_state["phase"] == "results"
    assert match_state["winner"] == "impostor"
    assert match_state["final_guess_submitted"] is True
    assert match_state["rewards_calculated"] is True

    # 5. Duplicate submission attempt -> REJECTED
    old_cached = match_state.get("cached_results")
    await game_final_guess(sid_impostor, {"guess": "DIAMOND"})
    assert match_state.get("cached_results") == old_cached

    # Cleanup
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_finalize_match_core_db_failure_retry_safety(setup_db, client):
    """
    SEC-02 Regression Tests:
    - Database failure during reward persistence does NOT mark rewards_calculated=True.
    - Match finalization can be retried safely.
    - Subsequent retry successfully awards and commits persistent progression.
    """
    uid = uuid.uuid4().hex[:6]
    user_auth = await register_and_activate(client, f"RetryUser_{uid}", f"retry_{uid}@example.com", "Password123!")
    user_id = user_auth["user"]["id"]

    room_code = f"T{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)
    sid_human = f"sid_retry_{uid}"
    room_manager.add_socket_to_room(room_code=room_code, sid=sid_human, user_id=user_id, username="HumanRetry")

    match_id = f"match_retry_{uuid.uuid4().hex[:8]}"
    match_state = {
        "match_id": match_id,
        "phase": "playing",
        "rewards_calculated": False,
        "player_assignments": {
            sid_human: {"role": "innocent", "team": "innocent", "is_impostor": False, "is_alive": True, "user_id": user_id},
        },
    }
    active_matches[room_code] = match_state

    # 1. Simulate DB outage during apply_authoritative_rewards
    with patch("app.socket.game_events.apply_authoritative_rewards", side_effect=RuntimeError("Simulated DB connection drop")):
        with pytest.raises(RuntimeError, match="Simulated DB connection drop"):
            await _finalize_match_core(room_code=room_code, winner="innocents", win_reason="Test reason")

    # CRITICAL: rewards_calculated MUST NOT be True on DB failure!
    assert match_state["rewards_calculated"] is False
    assert match_state.get("broadcast_emitted") is not True

    # User balance in DB must be untouched
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        assert user.xp == 0
        assert user.coins == 150

    # 2. Subsequent retry when DB is healthy
    results = await _finalize_match_core(room_code=room_code, winner="innocents", win_reason="Test reason")
    assert results["winner"] == "innocents"
    assert match_state["rewards_calculated"] is True

    # User balance in DB must now be authoritatively updated
    async with AsyncSessionLocal() as session:
        user = (await session.execute(select(User).where(User.id == user_id))).scalar_one()
        assert user.xp > 0
        assert user.coins > 150

    # Cleanup
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_operational_error_propagates_without_swallowing(setup_db, client):
    """
    SEC-04 Regression Test:
    - apply_authoritative_rewards does NOT swallow OperationalError as a concurrency collision.
    - True database operational errors raise and propagate to caller.
    """
    uid = uuid.uuid4().hex[:6]
    user_auth = await register_and_activate(client, f"OpErr_{uid}", f"operr_{uid}@example.com", "Password123!")
    user_id = user_auth["user"]["id"]
    match_id = f"match_operr_{uuid.uuid4().hex[:8]}"

    # Mock session.begin() to raise OperationalError (e.g. database server closed connection)
    with patch("app.game.progression.AsyncSessionLocal") as mock_session_cls:
        mock_session = mock_session_cls.return_value
        mock_session.__aenter__.side_effect = OperationalError("connection refused", None, None)

        with pytest.raises(OperationalError):
            await apply_authoritative_rewards(
                match_id=match_id,
                player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 100, "coins_earned": 50}],
                is_valid_match=True,
            )


@pytest.mark.asyncio
async def test_repeated_startup_migrations_idempotent(setup_db):
    """
    SEC-03 Regression Test:
    - Repeated startup initialization (init_db) runs cleanly without errors.
    - Existing tables and columns remain fully preserved.
    """
    # First invocation in fixture, invoke a second and third time
    await init_db()
    await init_db()

    async with AsyncSessionLocal() as session:
        # Verify match_reward_ledger and users tables exist and can be queried
        users = (await session.execute(select(func.count(User.id)))).scalar()
        ledgers = (await session.execute(select(func.count(MatchRewardLedger.id)))).scalar()
        assert users >= 0
        assert ledgers >= 0


# ── Phase 10.4: Server-Authoritative Final Guess Timeout Tests ───────────────

@pytest.mark.asyncio
async def test_final_guess_timeout_produces_innocents_victory(setup_db, client):
    """
    Req 1: No guess within 20 seconds produces an Innocents victory with explicit timeout reason.
    """
    uid = uuid.uuid4().hex[:6]
    user_auth = await register_and_activate(client, f"TimeInno_{uid}", f"timeinno_{uid}@example.com", "Password123!")
    user_id = user_auth["user"]["id"]

    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)

    sid_innocent = f"sid_inno_{uid}"
    sid_impostor = f"sid_imp_{uid}"

    room_manager.add_socket_to_room(room_code, sid_innocent, user_id=user_id, username=f"TimeInno_{uid}")
    room_manager.add_socket_to_room(room_code, sid_impostor, user_id=None, username=f"TimeImp_{uid}")

    match_id = f"match_fg_timeout_{uid}"
    match_state = {
        "match_id": match_id,
        "room_code": room_code,
        "phase": "final_guess",
        "secret_word": "SUNSHINE",
        "undercover_word": "MOONLIGHT",
        "rewards_calculated": False,
        "final_guess_submitted": False,
        "caught_impostor_sid": sid_impostor,
        "player_assignments": {
            sid_innocent: {"role": "innocent", "team": "innocent", "is_impostor": False, "is_alive": True, "user_id": user_id},
            sid_impostor: {"role": "impostor", "team": "impostor", "is_impostor": True, "is_alive": False},
        },
    }
    active_matches[room_code] = match_state

    # Start timer with 20ms duration for fast deterministic test execution
    timer_task = _start_final_guess_timer(room_code, match_id, duration=0.02)
    assert room_code in _active_final_guess_timers

    await timer_task

    # Verifications
    assert match_state["phase"] == "results"
    assert match_state["winner"] == "innocents"
    assert "ran out of time" in match_state["win_reason"]
    assert match_state["final_guess_submitted"] is True
    assert match_state["rewards_calculated"] is True
    assert room_code not in _active_final_guess_timers

    # Cleanup
    _cancel_final_guess_timer(room_code)
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_valid_guess_before_timeout_cancels_timeout(setup_db, client):
    """
    Req 2: A valid guess before timeout cancels the timeout and determines outcome.
    """
    uid = uuid.uuid4().hex[:6]
    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)

    sid_innocent = f"sid_inno_{uid}"
    sid_impostor = f"sid_imp_{uid}"
    room_manager.add_socket_to_room(room_code, sid_innocent, username="Player1")
    room_manager.add_socket_to_room(room_code, sid_impostor, username="Player2")

    match_id = f"match_fg_steal_{uid}"
    match_state = {
        "match_id": match_id,
        "room_code": room_code,
        "phase": "final_guess",
        "secret_word": "SAPPHIRE",
        "undercover_word": "DIAMOND",
        "rewards_calculated": False,
        "final_guess_submitted": False,
        "caught_impostor_sid": sid_impostor,
        "player_assignments": {
            sid_innocent: {"role": "innocent", "team": "innocent", "is_impostor": False, "is_alive": True},
            sid_impostor: {"role": "impostor", "team": "impostor", "is_impostor": True, "is_alive": False},
        },
    }
    active_matches[room_code] = match_state

    # Start timer for 100ms
    _start_final_guess_timer(room_code, match_id, duration=0.1)

    # Impostor submits correct guess before timeout
    await asyncio.sleep(0.01)
    await game_final_guess(sid_impostor, {"guess": "SAPPHIRE"})

    assert match_state["phase"] == "results"
    assert match_state["winner"] == "impostor"
    assert match_state["rewards_calculated"] is True
    # Timer was cancelled
    assert room_code not in _active_final_guess_timers

    # Wait past timeout duration: outcome must NOT be overwritten
    await asyncio.sleep(0.12)
    assert match_state["winner"] == "impostor"

    # Cleanup
    _cancel_final_guess_timer(room_code)
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_incorrect_valid_guess_before_timeout_preserves_behavior(setup_db, client):
    """
    Req 3: An incorrect valid guess before timeout preserves existing behavior (innocents win due to wrong guess, not timeout).
    """
    uid = uuid.uuid4().hex[:6]
    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)

    sid_innocent = f"sid_inno_{uid}"
    sid_impostor = f"sid_imp_{uid}"
    room_manager.add_socket_to_room(room_code, sid_innocent, username="Player1")
    room_manager.add_socket_to_room(room_code, sid_impostor, username="Player2")

    match_id = f"match_fg_wrong_{uid}"
    match_state = {
        "match_id": match_id,
        "room_code": room_code,
        "phase": "final_guess",
        "secret_word": "SAPPHIRE",
        "undercover_word": "DIAMOND",
        "rewards_calculated": False,
        "final_guess_submitted": False,
        "caught_impostor_sid": sid_impostor,
        "player_assignments": {
            sid_innocent: {"role": "innocent", "team": "innocent", "is_impostor": False, "is_alive": True},
            sid_impostor: {"role": "impostor", "team": "impostor", "is_impostor": True, "is_alive": False},
        },
    }
    active_matches[room_code] = match_state

    _start_final_guess_timer(room_code, match_id, duration=0.1)

    # Caught impostor submits wrong guess
    await asyncio.sleep(0.01)
    await game_final_guess(sid_impostor, {"guess": "RUBY"})

    assert match_state["phase"] == "results"
    assert match_state["winner"] == "innocents"
    assert "SAPPHIRE" in match_state["win_reason"]
    assert "ran out of time" not in match_state["win_reason"]
    assert room_code not in _active_final_guess_timers

    # Cleanup
    _cancel_final_guess_timer(room_code)
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_unauthorized_guess_does_not_cancel_timeout(setup_db, client):
    """
    Req 4: An unauthorized guess does not cancel the timeout or mutate state.
    """
    uid = uuid.uuid4().hex[:6]
    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)

    sid_innocent = f"sid_inno_{uid}"
    sid_impostor = f"sid_imp_{uid}"
    room_manager.add_socket_to_room(room_code, sid_innocent, username="Player1")
    room_manager.add_socket_to_room(room_code, sid_impostor, username="Player2")

    match_id = f"match_fg_unauth_{uid}"
    match_state = {
        "match_id": match_id,
        "room_code": room_code,
        "phase": "final_guess",
        "secret_word": "SAPPHIRE",
        "rewards_calculated": False,
        "final_guess_submitted": False,
        "caught_impostor_sid": sid_impostor,
        "player_assignments": {
            sid_innocent: {"role": "innocent", "team": "innocent", "is_impostor": False, "is_alive": True},
            sid_impostor: {"role": "impostor", "team": "impostor", "is_impostor": True, "is_alive": False},
        },
    }
    active_matches[room_code] = match_state

    # Start 50ms timer
    timer_task = _start_final_guess_timer(room_code, match_id, duration=0.05)

    # Unauthorized innocent player tries to submit guess
    await game_final_guess(sid_innocent, {"guess": "SAPPHIRE"})

    # Guess was rejected, timer was NOT cancelled
    assert match_state["phase"] == "final_guess"
    assert match_state["final_guess_submitted"] is False
    assert not timer_task.cancelled()
    assert not timer_task.done()

    # Wait for timeout to fire
    await asyncio.sleep(0.08)
    assert match_state["phase"] == "results"
    assert match_state["winner"] == "innocents"
    assert "ran out of time" in match_state["win_reason"]

    # Cleanup
    _cancel_final_guess_timer(room_code)
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_duplicate_guess_does_not_create_another_result(setup_db, client):
    """
    Req 5: A duplicate guess does not create another result or alter state.
    """
    uid = uuid.uuid4().hex[:6]
    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)

    sid_impostor = f"sid_imp_{uid}"
    room_manager.add_socket_to_room(room_code, sid_impostor, username="Player1")

    match_id = f"match_fg_dup_{uid}"
    match_state = {
        "match_id": match_id,
        "room_code": room_code,
        "phase": "final_guess",
        "secret_word": "SAPPHIRE",
        "rewards_calculated": False,
        "final_guess_submitted": False,
        "caught_impostor_sid": sid_impostor,
        "player_assignments": {
            sid_impostor: {"role": "impostor", "team": "impostor", "is_impostor": True, "is_alive": False},
        },
    }
    active_matches[room_code] = match_state

    # First valid guess
    await game_final_guess(sid_impostor, {"guess": "SAPPHIRE"})
    cached = match_state.get("cached_results")
    assert cached is not None

    # Second duplicate guess attempt
    await game_final_guess(sid_impostor, {"guess": "DIAMOND"})
    assert match_state.get("cached_results") == cached

    # Cleanup
    _cancel_final_guess_timer(room_code)
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_stale_timeout_cannot_finalize_subsequent_match(setup_db, client):
    """
    Req 6: A stale timeout cannot finalize a subsequent match in the same room.
    """
    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)

    old_match_id = f"match_old_{uuid.uuid4().hex[:6]}"
    match_state = {
        "match_id": old_match_id,
        "room_code": room_code,
        "phase": "final_guess",
        "rewards_calculated": False,
        "final_guess_submitted": False,
    }
    active_matches[room_code] = match_state

    # Start timer for old match
    _start_final_guess_timer(room_code, old_match_id, duration=0.03)

    # New match starts in the same room before old timer completes
    new_match_id = f"match_new_{uuid.uuid4().hex[:6]}"
    active_matches[room_code] = {
        "match_id": new_match_id,
        "room_code": room_code,
        "phase": "clues",
        "rewards_calculated": False,
        "final_guess_submitted": False,
    }

    # Wait for old timer to fire
    await asyncio.sleep(0.06)

    # New match MUST NOT be modified or finalized
    current = active_matches[room_code]
    assert current["phase"] == "clues"
    assert current.get("rewards_calculated") is False
    assert current.get("winner") is None

    # Cleanup
    _cancel_final_guess_timer(room_code)
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_abandoned_room_does_not_receive_timeout_result(setup_db, client):
    """
    Req 7: An abandoned room does not receive a timeout result or award rewards.
    """
    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)

    match_id = f"match_aban_{uuid.uuid4().hex[:6]}"
    match_state = {
        "match_id": match_id,
        "room_code": room_code,
        "phase": "final_guess",
        "rewards_calculated": False,
        "final_guess_submitted": False,
        "abandoned": True,  # Marked abandoned
    }
    active_matches[room_code] = match_state

    _start_final_guess_timer(room_code, match_id, duration=0.03)
    await asyncio.sleep(0.06)

    # Match remained unfinalized
    assert match_state.get("rewards_calculated") is False
    assert match_state.get("phase") == "final_guess"

    # Cleanup
    _cancel_final_guess_timer(room_code)
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_timeout_database_failure_does_not_falsely_mark_rewards(setup_db, client):
    """
    Req 8: Database failure during timeout finalization does not falsely mark rewards as calculated.
    """
    uid = uuid.uuid4().hex[:6]
    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    room_manager.create_room(room_code=room_code, max_players=4, allow_bots=False)

    sid_innocent = f"sid_inno_{uid}"
    sid_impostor = f"sid_imp_{uid}"
    room_manager.add_socket_to_room(room_code, sid_innocent, user_id=f"u_{uid}", username="Inno")
    room_manager.add_socket_to_room(room_code, sid_impostor, username="Imp")

    match_id = f"match_dbfail_{uid}"
    match_state = {
        "match_id": match_id,
        "room_code": room_code,
        "phase": "final_guess",
        "secret_word": "SECRET",
        "rewards_calculated": False,
        "final_guess_submitted": False,
        "caught_impostor_sid": sid_impostor,
        "player_assignments": {
            sid_innocent: {"role": "innocent", "team": "innocent", "is_impostor": False, "is_alive": True, "user_id": f"u_{uid}"},
            sid_impostor: {"role": "impostor", "team": "impostor", "is_impostor": True, "is_alive": False},
        },
    }
    active_matches[room_code] = match_state

    # Mock DB failure during persistence
    with patch("app.socket.game_events.apply_authoritative_rewards", side_effect=OperationalError("connection failed", None, None)):
        _start_final_guess_timer(room_code, match_id, duration=0.02)
        await asyncio.sleep(0.06)

        # Must NOT be marked as calculated
        assert match_state.get("rewards_calculated") is False

    # Cleanup
    _cancel_final_guess_timer(room_code)
    active_matches.pop(room_code, None)
    room_manager._rooms.pop(room_code, None)


@pytest.mark.asyncio
async def test_timeout_task_cancelled_during_application_shutdown(setup_db):
    """
    Req 9: Timeout task is cancelled during application shutdown (cancel_all_game_timers).
    """
    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    match_id = f"match_shut_{uuid.uuid4().hex[:6]}"
    active_matches[room_code] = {
        "match_id": match_id,
        "room_code": room_code,
        "phase": "final_guess",
    }

    # Start long-running timer
    task = _start_final_guess_timer(room_code, match_id, duration=30.0)
    assert room_code in _active_final_guess_timers
    assert not task.done()

    # Trigger shutdown cancellation
    cancel_all_game_timers()
    await asyncio.sleep(0)

    # Task is cancelled and registry cleared
    assert task.cancelled() or task.done()
    assert len(_active_final_guess_timers) == 0

    # Cleanup
    active_matches.pop(room_code, None)


@pytest.mark.asyncio
async def test_only_one_timeout_task_exists_per_room(setup_db):
    """
    Req 10: Only one timeout task exists per room; scheduling a new one cancels prior task.
    """
    room_code = f"FG{uuid.uuid4().hex[:5].upper()}"
    match_id = f"match_single_{uuid.uuid4().hex[:6]}"
    active_matches[room_code] = {
        "match_id": match_id,
        "room_code": room_code,
        "phase": "final_guess",
    }

    # Start first timer
    task1 = _start_final_guess_timer(room_code, match_id, duration=30.0)
    assert _active_final_guess_timers[room_code] is task1
    assert not task1.done()

    # Start second timer for the same room
    task2 = _start_final_guess_timer(room_code, match_id, duration=30.0)
    await asyncio.sleep(0)
    assert _active_final_guess_timers[room_code] is task2
    # Task 1 must be cancelled
    assert task1.cancelled() or task1.done()

    # Cleanup
    _cancel_final_guess_timer(room_code)
    assert room_code not in _active_final_guess_timers
    active_matches.pop(room_code, None)


