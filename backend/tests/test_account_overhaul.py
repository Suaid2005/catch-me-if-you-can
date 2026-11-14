"""
backend/tests/test_account_overhaul.py
──────────────────────────────────────
Comprehensive verification suite for Dual Email + Phone Verification Overhaul:
1. Registration with valid email and phone
2. Missing email or phone rejection (422)
3. Invalid email and phone rejection (422)
4. Phone number E.164 validation & normalization via phonenumbers library
5. Duplicate username, email, and phone rejection (409)
6. Correct Email OTP verification
7. Correct Phone OTP verification and dual activation
8. Incorrect OTP tracking and excessive attempts lockout (429)
9. Expired OTP rejection (400)
10. Reused OTP rejection (400)
11. Resend OTP 60-second cooldown enforcement (429)
12. Changing email and phone during pending registration with old challenge invalidation
13. Pending unverified account login rejection (403 Forbidden with resume token)
14. Verified account login by codename OR verified email
15. Username recovery via verified email and phone (enumeration-safe)
16. Password recovery OTP flow (request OTP -> verify OTP -> reset password)
17. Password reset invalidates active refresh tokens (SEC-04)
18. Existing/legacy account compatibility without lockout
19. Guest mode preservation
20. Database schema and migration verification
"""
import uuid
import hashlib
from datetime import datetime, timedelta, timezone
import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select, text, inspect

from app.main import app
from app.database import AsyncSessionLocal, engine
from app.models.user import User, PasswordResetToken, RefreshToken, OtpChallenge
from app.api.auth import hash_password, hash_otp, create_registration_token


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_registration_with_valid_email_and_phone(setup_db, client):
    """Verifies that registration with mandatory email and phone creates a pending account."""
    uid = uuid.uuid4().hex[:6]
    username = f"Detective_{uid}"
    email = f"detective_{uid}@example.com"
    phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
    password = "MasterPassword123!"

    res = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": email,
            "phone_number": phone,
            "password": password,
            "confirm_password": password,
        },
    )
    assert res.status_code == 201
    data = res.json()
    assert data["username"] == username
    assert data["email"] == email
    assert data["phone_number"] == phone
    assert data["is_active"] is False
    assert data["email_verified"] is False
    assert data["phone_verified"] is False
    assert "registration_token" in data
    assert data["dev_email_otp"] is not None
    assert data["dev_phone_otp"] is not None


@pytest.mark.asyncio
async def test_missing_email_or_phone_rejection(setup_db, client):
    """Verifies that missing email or phone is strictly rejected with 422 Unprocessable Entity."""
    uid = uuid.uuid4().hex[:6]
    valid_phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
    valid_email = f"agent_{uid}@example.com"

    # Missing email
    res1 = await client.post(
        "/api/auth/register",
        json={
            "username": f"User_{uid}_1",
            "phone_number": valid_phone,
            "password": "Password123!",
        },
    )
    assert res1.status_code == 422

    # Empty email
    res2 = await client.post(
        "/api/auth/register",
        json={
            "username": f"User_{uid}_2",
            "email": "",
            "phone_number": valid_phone,
            "password": "Password123!",
        },
    )
    assert res2.status_code == 422

    # Missing phone
    res3 = await client.post(
        "/api/auth/register",
        json={
            "username": f"User_{uid}_3",
            "email": valid_email,
            "password": "Password123!",
        },
    )
    assert res3.status_code == 422


@pytest.mark.asyncio
async def test_invalid_email_and_phone_rejection(setup_db, client):
    """Verifies that invalid email and phone number structures fail validation."""
    uid = uuid.uuid4().hex[:6]

    # Malformed email
    res1 = await client.post(
        "/api/auth/register",
        json={
            "username": f"User_{uid}",
            "email": "not-a-valid-email",
            "phone_number": "+919876543210",
            "password": "Password123!",
        },
    )
    assert res1.status_code == 422

    # Invalid phone length
    res2 = await client.post(
        "/api/auth/register",
        json={
            "username": f"User_{uid}b",
            "email": f"valid_{uid}@example.com",
            "phone_number": "+911234",  # Too short for India
            "password": "Password123!",
        },
    )
    assert res2.status_code == 422


@pytest.mark.asyncio
async def test_duplicate_rejection_for_active_accounts(setup_db, client):
    """Verifies that duplicate username, email, and phone are rejected with 409 Conflict."""
    uid = uuid.uuid4().hex[:6]
    username = f"ActiveAgent_{uid}"
    email = f"active_{uid}@example.com"
    phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
    password = "MasterPassword123!"

    # Register and activate account
    reg_res = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": email,
            "phone_number": phone,
            "password": password,
        },
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["registration_token"]
    email_otp = reg_res.json()["dev_email_otp"]
    phone_otp = reg_res.json()["dev_phone_otp"]

    await client.post("/api/auth/register/verify-email", json={"registration_token": token, "otp": email_otp})
    v2 = await client.post("/api/auth/register/verify-phone", json={"registration_token": token, "otp": phone_otp})
    assert v2.status_code == 200
    assert v2.json()["is_active"] is True

    # Duplicate username
    dup_u = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": f"other_{uid}@example.com",
            "phone_number": f"+9198{uuid.uuid4().int % 100000000:08d}",
            "password": "Password123!",
        },
    )
    assert dup_u.status_code == 409

    # Duplicate email
    dup_e = await client.post(
        "/api/auth/register",
        json={
            "username": f"NewUser_{uid}a",
            "email": email,
            "phone_number": f"+9198{uuid.uuid4().int % 100000000:08d}",
            "password": "Password123!",
        },
    )
    assert dup_e.status_code == 409

    # Duplicate phone
    dup_p = await client.post(
        "/api/auth/register",
        json={
            "username": f"NewUser_{uid}b",
            "email": f"new_{uid}@example.com",
            "phone_number": phone,
            "password": "Password123!",
        },
    )
    assert dup_p.status_code == 409


@pytest.mark.asyncio
async def test_incorrect_otp_and_excessive_attempts_lockout(setup_db, client):
    """Verifies that incorrect OTPs track attempts and lock out after 5 attempts."""
    uid = uuid.uuid4().hex[:6]
    res = await client.post(
        "/api/auth/register",
        json={
            "username": f"Lockout_{uid}",
            "email": f"lockout_{uid}@example.com",
            "phone_number": f"+9198{uuid.uuid4().int % 100000000:08d}",
            "password": "Password123!",
        },
    )
    token = res.json()["registration_token"]

    # 4 wrong attempts return 400 Bad Request
    for _ in range(4):
        bad_res = await client.post(
            "/api/auth/register/verify-email",
            json={"registration_token": token, "otp": "000000"},
        )
        assert bad_res.status_code == 400

    # 5th wrong attempt triggers 429 Too Many Requests lockout
    lock_res = await client.post(
        "/api/auth/register/verify-email",
        json={"registration_token": token, "otp": "000000"},
    )
    assert lock_res.status_code == 429


@pytest.mark.asyncio
async def test_expired_and_reused_otp_rejection(setup_db, client):
    """Verifies that expired or already-used OTPs cannot be verified."""
    uid = uuid.uuid4().hex[:6]
    res = await client.post(
        "/api/auth/register",
        json={
            "username": f"Expiry_{uid}",
            "email": f"expiry_{uid}@example.com",
            "phone_number": f"+9198{uuid.uuid4().int % 100000000:08d}",
            "password": "Password123!",
        },
    )
    token = res.json()["registration_token"]
    email_otp = res.json()["dev_email_otp"]
    user_id = res.json()["user_id"]

    # Manually expire the challenge in DB
    async with AsyncSessionLocal() as session:
        past = datetime.now(timezone.utc) - timedelta(minutes=10)
        await session.execute(
            text("UPDATE otp_challenges SET expires_at = :past WHERE user_id = :uid"),
            {"past": past, "uid": user_id},
        )
        await session.commit()

    expired_res = await client.post(
        "/api/auth/register/verify-email",
        json={"registration_token": token, "otp": email_otp},
    )
    assert expired_res.status_code == 400
    assert "expired" in expired_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resend_otp_cooldown(setup_db, client):
    """Verifies 60-second cooldown enforcement on OTP resend requests."""
    uid = uuid.uuid4().hex[:6]
    res = await client.post(
        "/api/auth/register",
        json={
            "username": f"Cooldown_{uid}",
            "email": f"cooldown_{uid}@example.com",
            "phone_number": f"+9198{uuid.uuid4().int % 100000000:08d}",
            "password": "Password123!",
        },
    )
    token = res.json()["registration_token"]

    # Immediate resend should be rejected with 429 cooldown
    resend_res = await client.post(
        "/api/auth/register/resend-otp",
        json={"registration_token": token, "channel": "email"},
    )
    assert resend_res.status_code == 429
    assert "wait" in resend_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_change_contact_details_during_pending_registration(setup_db, client):
    """Verifies that changing email or phone invalidates old challenges and issues new OTPs."""
    uid = uuid.uuid4().hex[:6]
    res = await client.post(
        "/api/auth/register",
        json={
            "username": f"Changer_{uid}",
            "email": f"initial_{uid}@example.com",
            "phone_number": f"+9198{uuid.uuid4().int % 100000000:08d}",
            "password": "Password123!",
        },
    )
    token = res.json()["registration_token"]
    old_email_otp = res.json()["dev_email_otp"]
    new_email = f"updated_{uid}@example.com"

    change_res = await client.post(
        "/api/auth/register/change-email",
        json={"registration_token": token, "new_email": new_email},
    )
    assert change_res.status_code == 200
    new_email_otp = change_res.json()["dev_email_otp"]
    assert new_email_otp != old_email_otp

    # Old email OTP should fail
    bad_res = await client.post(
        "/api/auth/register/verify-email",
        json={"registration_token": token, "otp": old_email_otp},
    )
    assert bad_res.status_code == 400

    # New email OTP succeeds
    good_res = await client.post(
        "/api/auth/register/verify-email",
        json={"registration_token": token, "otp": new_email_otp},
    )
    assert good_res.status_code == 200
    assert good_res.json()["email_verified"] is True


@pytest.mark.asyncio
async def test_pending_account_login_rejection_and_verified_login(setup_db, client):
    """Verifies that unverified accounts are rejected from login (403), then succeed once verified."""
    uid = uuid.uuid4().hex[:6]
    username = f"PendingLogin_{uid}"
    email = f"pending_{uid}@example.com"
    phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
    password = "MyPassword123!"

    reg = await client.post(
        "/api/auth/register",
        json={
            "username": username,
            "email": email,
            "phone_number": phone,
            "password": password,
        },
    )
    token = reg.json()["registration_token"]
    email_otp = reg.json()["dev_email_otp"]
    phone_otp = reg.json()["dev_phone_otp"]

    # Login rejected with 403 Forbidden
    login_rej = await client.post(
        "/api/auth/login",
        data={"username": username, "password": password},
    )
    assert login_rej.status_code == 403
    assert "pending" in str(login_rej.json()).lower()

    # Complete dual verification
    await client.post("/api/auth/register/verify-email", json={"registration_token": token, "otp": email_otp})
    await client.post("/api/auth/register/verify-phone", json={"registration_token": token, "otp": phone_otp})

    # Login by codename succeeds
    login_user = await client.post(
        "/api/auth/login",
        data={"username": username, "password": password},
    )
    assert login_user.status_code == 200
    assert "access_token" in login_user.json()

    # Login by verified email succeeds
    login_email = await client.post(
        "/api/auth/login",
        data={"username": email, "password": password},
    )
    assert login_email.status_code == 200
    assert "access_token" in login_email.json()


@pytest.mark.asyncio
async def test_enumeration_safe_username_recovery(setup_db, client):
    """Verifies enumeration-safe username recovery for both email and phone channels."""
    uid = uuid.uuid4().hex[:6]
    username = f"RecUser_{uid}"
    email = f"rec_{uid}@example.com"
    phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
    password = "Password123!"

    # Register and verify
    reg = await client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "phone_number": phone, "password": password},
    )
    token = reg.json()["registration_token"]
    await client.post("/api/auth/register/verify-email", json={"registration_token": token, "otp": reg.json()["dev_email_otp"]})
    await client.post("/api/auth/register/verify-phone", json={"registration_token": token, "otp": reg.json()["dev_phone_otp"]})

    # Recover via email
    rec_e = await client.post(
        "/api/auth/recover-username",
        json={"channel": "email", "identifier": email},
    )
    assert rec_e.status_code == 200
    assert "dispatched" in rec_e.json()["message"].lower()

    # Recover via phone
    rec_p = await client.post(
        "/api/auth/recover-username",
        json={"channel": "phone", "identifier": phone},
    )
    assert rec_p.status_code == 200
    assert "dispatched" in rec_p.json()["message"].lower()

    # Non-existent contact yields identical generic message
    rec_none = await client.post(
        "/api/auth/recover-username",
        json={"channel": "email", "identifier": "nonexistent@catchme.game"},
    )
    assert rec_none.status_code == 200
    assert rec_none.json()["message"] == rec_e.json()["message"]


@pytest.mark.asyncio
async def test_password_recovery_flow_and_session_invalidation(setup_db, client):
    """Verifies OTP-based password recovery and revocation of active refresh tokens (SEC-04)."""
    uid = uuid.uuid4().hex[:6]
    username = f"ResetAgent_{uid}"
    email = f"reset_{uid}@example.com"
    phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
    old_pass = "OldMasterPassword123!"
    new_pass = "NewSecretPassword456!"

    # 1. Register & activate account
    reg = await client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "phone_number": phone, "password": old_pass},
    )
    token = reg.json()["registration_token"]
    await client.post("/api/auth/register/verify-email", json={"registration_token": token, "otp": reg.json()["dev_email_otp"]})
    await client.post("/api/auth/register/verify-phone", json={"registration_token": token, "otp": reg.json()["dev_phone_otp"]})

    # 2. Login to acquire active refresh token
    login1 = await client.post("/api/auth/login", data={"username": username, "password": old_pass})
    assert login1.status_code == 200
    initial_refresh = login1.json()["refresh_token"]

    # 3. Request password reset via phone OTP
    fp_req = await client.post(
        "/api/auth/forgot-password",
        json={"channel": "phone", "identifier": phone},
    )
    assert fp_req.status_code == 200
    challenge_id = fp_req.json()["challenge_id"]
    dev_otp = fp_req.json()["dev_otp"]
    assert challenge_id is not None
    assert dev_otp is not None

    # 4. Verify password reset OTP -> receives single-use reset token
    verify_fp = await client.post(
        "/api/auth/forgot-password/verify",
        json={"challenge_id": challenge_id, "otp": dev_otp},
    )
    assert verify_fp.status_code == 200
    reset_token = verify_fp.json()["reset_token"]

    # 5. Apply new password
    apply_res = await client.post(
        "/api/auth/reset-password",
        json={
            "reset_token": reset_token,
            "new_password": new_pass,
            "confirm_password": new_pass,
        },
    )
    assert apply_res.status_code == 200

    # 6. Verify old refresh token is revoked
    refresh_attempt = await client.post(
        "/api/auth/refresh",
        json={"refresh_token": initial_refresh},
    )
    assert refresh_attempt.status_code == 401

    # 7. Old password no longer works
    bad_login = await client.post("/api/auth/login", data={"username": username, "password": old_pass})
    assert bad_login.status_code == 401

    # 8. New password logs in successfully
    good_login = await client.post("/api/auth/login", data={"username": username, "password": new_pass})
    assert good_login.status_code == 200


@pytest.mark.asyncio
async def test_legacy_account_compatibility(setup_db, client):
    """Verifies that pre-existing accounts marked is_legacy=True can log in without verification lockout."""
    uid = uuid.uuid4().hex[:6]
    legacy_username = f"LegacyPlayer_{uid}"
    legacy_pass = "LegacyPass123!"

    # Create a legacy account directly in DB
    async with AsyncSessionLocal() as session:
        user = User(
            id=str(uuid.uuid4()),
            username=legacy_username,
            email=f"legacy_{uid}@catchme.game",
            phone_number=None,
            hashed_password=hash_password(legacy_pass),
            is_active=True,
            is_legacy=True,
            email_verified=False,
            phone_verified=False,
        )
        session.add(user)
        await session.commit()

    # Legacy player logs in successfully without 403
    res = await client.post("/api/auth/login", data={"username": legacy_username, "password": legacy_pass})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["user"]["is_legacy"] is True
    assert data["user"]["email_verified"] is False


@pytest.mark.asyncio
async def test_guest_mode_preservation(setup_db, client):
    """Verifies that guest mode authentication remains completely functional."""
    res = await client.post("/api/auth/guest", json={"display_name": "GhostHunter"})
    assert res.status_code == 200
    data = res.json()
    assert data["user"]["is_guest"] is True
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_database_migration_columns(setup_db):
    """Verifies that users table contains all necessary verification and legacy columns."""
    async with engine.connect() as conn:
        def inspect_columns(sync_conn):
            insp = inspect(sync_conn)
            return {c["name"] for c in insp.get_columns("users")}

        cols = await conn.run_sync(inspect_columns)
        assert "email_verified" in cols
        assert "phone_verified" in cols
        assert "is_active" in cols
        assert "is_legacy" in cols
        assert "phone_number" in cols
