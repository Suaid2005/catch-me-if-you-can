"""
backend/tests/test_session_and_progression.py
─────────────────────────────────────────────
Comprehensive tests for:
1. 15-minute access token & 30-day refresh token creation
2. Refresh token rotation & single-use enforcement
3. Token reuse detection: revoked token presentation revokes ALL active sessions
4. Explicit logout revokes refresh token
5. Server-side progression endpoints:
   - Initial state (150 coins, 0 XP, level 1, classic detective default)
   - Avatar purchase (balance deduction, unlocked list update, auto-equip)
   - Double-purchase prevention (400 Conflict/Bad Request)
   - Insufficient coins prevention (400 Bad Request)
   - Avatar equipping (verifying ownership)
   - Cosmetic purchase & equipping (frames and stamps)
   - Reward sync (+XP, +coins, dynamic level calculation)
6. Phone OTP request & verify behavior
"""
import uuid
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select

from app.main import app
from app.database import AsyncSessionLocal
from app.models.user import User, RefreshToken, PhoneVerificationOtp


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
async def test_session_lifecycle_and_rotation(setup_db, client):
    """Test 15-minute access token + refresh token creation, rotation, and logout."""
    uid = uuid.uuid4().hex[:6]
    username = f"Agent_{uid}"
    email = f"agent_{uid}@example.com"
    password = "StrongPassword123!"

    # 1. Register and activate
    data = await register_and_activate(client, username, email, password)
    access_token1 = data["access_token"]
    refresh_token1 = data["refresh_token"]
    assert access_token1 and refresh_token1

    # Verify refresh token in DB
    async with AsyncSessionLocal() as session:
        tokens = (await session.execute(select(RefreshToken).where(RefreshToken.user_id == data["user"]["id"]))).scalars().all()
        assert len(tokens) == 1
        assert tokens[0].revoked is False

    # 2. Refresh tokens (Rotation)
    ref_res = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": refresh_token1},
    )
    assert ref_res.status_code == 200
    ref_data = ref_res.json()
    access_token2 = ref_data["access_token"]
    refresh_token2 = ref_data["refresh_token"]
    assert access_token2 != access_token1
    assert refresh_token2 != refresh_token1

    # Verify old refresh token is now revoked and replaced_by points to new token
    async with AsyncSessionLocal() as session:
        tokens = (await session.execute(select(RefreshToken).where(RefreshToken.user_id == data["user"]["id"]))).scalars().all()
        assert len(tokens) == 2
        revoked_tokens = [t for t in tokens if t.revoked]
        active_tokens = [t for t in tokens if not t.revoked]
        assert len(revoked_tokens) == 1
        assert len(active_tokens) == 1
        assert revoked_tokens[0].replaced_by == active_tokens[0].id

    # 3. Explicit Logout
    logout_res = await client.post(
        "/api/auth/logout",
        json={"refresh_token": refresh_token2},
    )
    assert logout_res.status_code == 200

    # Verify token 2 is now revoked
    async with AsyncSessionLocal() as session:
        tokens = (await session.execute(select(RefreshToken).where(RefreshToken.user_id == data["user"]["id"]))).scalars().all()
        assert all(t.revoked for t in tokens)


@pytest.mark.asyncio
async def test_refresh_token_reuse_detection(setup_db, client):
    """
    Test Token Reuse Detection:
    If an attacker attempts to use an already-rotated (revoked) refresh token,
    all active sessions for that user must immediately be revoked.
    """
    uid = uuid.uuid4().hex[:6]
    username = f"SecureAgent_{uid}"
    email = f"sec_agent_{uid}@example.com"
    password = "StrongPassword123!"

    # 1. Register -> receives pair 1
    reg_res = await register_and_activate(client, username, email, password)
    user_id = reg_res["user"]["id"]
    refresh_token1 = reg_res["refresh_token"]

    # 2. Legitimate user refreshes -> receives pair 2 (token1 is revoked)
    ref_res1 = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token1})
    assert ref_res1.status_code == 200
    refresh_token2 = ref_res1.json()["refresh_token"]

    # 3. Legitimate user refreshes again -> receives pair 3 (token2 is revoked)
    ref_res2 = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token2})
    assert ref_res2.status_code == 200
    refresh_token3 = ref_res2.json()["refresh_token"]

    # 4. Attacker attempts to replay token1 (already used/revoked!)
    attack_res = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token1})
    assert attack_res.status_code == 401
    assert "compromise detected" in attack_res.json()["detail"].lower()

    # 5. ALL user tokens (including token3) MUST now be revoked!
    async with AsyncSessionLocal() as session:
        tokens = (await session.execute(select(RefreshToken).where(RefreshToken.user_id == user_id))).scalars().all()
        assert len(tokens) >= 3
        assert all(t.revoked for t in tokens)

    # Subsequent refresh with token3 must now also fail
    ref_res3 = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token3})
    assert ref_res3.status_code == 401


@pytest.mark.asyncio
async def test_server_side_progression_and_vault(setup_db, client):
    """Test persistent progression, avatar purchasing, double spending guard, and equipment."""
    uid = uuid.uuid4().hex[:6]
    username = f"VaultSleuth_{uid}"
    email = f"sleuth_{uid}@example.com"
    password = "StrongPassword123!"

    reg = await register_and_activate(client, username, email, password)
    user_id = reg["user"]["id"]
    token = reg["access_token"]
    auth_header = {"Authorization": f"Bearer {token}"}

    # 1. Initial progression state
    prog_res = await client.get("/api/progression", headers=auth_header)
    assert prog_res.status_code == 200
    prog = prog_res.json()
    assert prog["coins"] == 150
    assert prog["xp"] == 0
    assert prog["level"] == 1
    assert "avatar_classic_detective" in prog["unlocked_avatars"]
    assert prog["equipped_avatar"] == "avatar_classic_detective"

    # 2. Purchase avatar_cyber_detective (cost 150)
    buy_res = await client.post(
        "/api/progression/purchase-avatar",
        headers=auth_header,
        json={"avatar_id": "avatar_cyber_detective"},
    )
    assert buy_res.status_code == 200
    buy_data = buy_res.json()
    assert buy_data["coins"] == 0  # 150 - 150 = 0
    assert "avatar_cyber_detective" in buy_data["unlocked_avatars"]
    assert buy_data["equipped_avatar"] == "avatar_cyber_detective"

    # 3. Duplicate purchase blocked
    dup_res = await client.post(
        "/api/progression/purchase-avatar",
        headers=auth_header,
        json={"avatar_id": "avatar_cyber_detective"},
    )
    assert dup_res.status_code == 400
    assert "already own" in dup_res.json()["detail"].lower()

    # 4. Insufficient coins blocked (trying to buy avatar_shadow_agent with 0 coins)
    broke_res = await client.post(
        "/api/progression/purchase-avatar",
        headers=auth_header,
        json={"avatar_id": "avatar_shadow_agent"},
    )
    assert broke_res.status_code == 400
    assert "insufficient coins" in broke_res.json()["detail"].lower()

    # 5. Equip classic detective
    equip_res = await client.post(
        "/api/progression/equip-avatar",
        headers=auth_header,
        json={"avatar_id": "avatar_classic_detective"},
    )
    assert equip_res.status_code == 200
    assert equip_res.json()["equipped_avatar"] == "avatar_classic_detective"

    # 6. Equip unowned avatar blocked
    unowned_res = await client.post(
        "/api/progression/equip-avatar",
        headers=auth_header,
        json={"avatar_id": "avatar_mystery_phantom"},
    )
    assert unowned_res.status_code == 400
    assert "not unlocked" in unowned_res.json()["detail"].lower()

    # 7. Direct client reward injection is rejected with 403 Forbidden
    reward_res = await client.post(
        "/api/progression/rewards",
        headers=auth_header,
        json={"xp_earned": 500, "coins_earned": 400},
    )
    assert reward_res.status_code == 403
    assert "Direct client reward submission is disabled" in reward_res.json()["detail"]

    # Award coins server-authoritatively via apply_authoritative_rewards for remaining store tests
    from app.game.progression import apply_authoritative_rewards
    auth_res = await apply_authoritative_rewards(
        match_id=f"match_{uuid.uuid4().hex[:8]}",
        player_rewards=[{"user_id": user_id, "is_bot": False, "xp_earned": 500, "coins_earned": 400}],
        is_valid_match=True,
    )
    assert auth_res[user_id]["new_total_coins"] == 400
    assert auth_res[user_id]["new_total_xp"] == 500
    assert auth_res[user_id]["new_level"] == 3

    # 8. Purchase and equip frame (Neon Glitch Ring: frame_neon_cyan, cost 250)
    frame_buy = await client.post(
        "/api/progression/purchase-cosmetic",
        headers=auth_header,
        json={"item_id": "frame_neon_cyan"},
    )
    assert frame_buy.status_code == 200
    frame_data = frame_buy.json()
    assert frame_data["coins"] == 150  # 400 - 250 = 150
    assert "frame_neon_cyan" in frame_data["unlocked_items"]
    assert frame_data["equipped_frame"] == "frame_neon_cyan"

    # 9. Equip cosmetic / unequip frame
    unequip_res = await client.post(
        "/api/progression/equip-cosmetic",
        headers=auth_header,
        json={"item_type": "frame", "item_id": None},
    )
    assert unequip_res.status_code == 200
    assert unequip_res.json()["equipped_frame"] is None


@pytest.mark.asyncio
async def test_phone_otp_flow(setup_db, client):
    """Test phone OTP request and verification endpoints."""
    phone = f"+1212{uuid.uuid4().int % 10000000:07d}"

    # Request OTP
    req_res = await client.post(
        "/api/auth/phone-otp-request",
        json={"phone_number": phone},
    )
    assert req_res.status_code == 200
    req_data = req_res.json()
    assert "success" in req_data
    assert "message" in req_data

    # Retrieve generated OTP from DB for test verification
    async with AsyncSessionLocal() as session:
        otp_rec = (await session.execute(
            select(PhoneVerificationOtp).where(PhoneVerificationOtp.phone_number == phone, PhoneVerificationOtp.used == False)
        )).scalar_one_or_none()
        assert otp_rec is not None

    # Invalid OTP attempt
    bad_res = await client.post(
        "/api/auth/phone-otp-verify",
        json={"phone_number": phone, "otp": "000000"},
    )
    assert bad_res.status_code == 400
    assert "invalid or expired" in bad_res.json()["detail"].lower()

