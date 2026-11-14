"""
Integration tests for authentication endpoints using in-process ASGI AsyncClient.
Tests complete dual email + phone verification registration lifecycle.
"""
import uuid
import sys
import os
import pytest
import httpx

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app


@pytest.mark.asyncio
async def test_registration_and_login(setup_db):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        unique_user = f"Agent_{uuid.uuid4().hex[:6]}"
        password = "SecretPassword123!"
        phone = f"+9198{uuid.uuid4().int % 100000000:08d}"
        email = f"{unique_user.lower()}@test.com"

        # 1. Register new user (returns 201 Created with pending verification status)
        reg_res = await client.post(
            "/api/auth/register",
            json={
                "username": unique_user,
                "password": password,
                "email": email,
                "phone_number": phone,
            }
        )
        assert reg_res.status_code == 201
        reg_body = reg_res.json()
        assert reg_body["username"] == unique_user
        assert reg_body["is_active"] is False
        assert reg_body["email_verified"] is False
        assert reg_body["phone_verified"] is False
        assert "registration_token" in reg_body
        reg_token = reg_body["registration_token"]
        dev_email_otp = reg_body.get("dev_email_otp")
        dev_phone_otp = reg_body.get("dev_phone_otp")
        assert dev_email_otp is not None
        assert dev_phone_otp is not None

        # 2. Attempting to log in before verification must be rejected with 403 Forbidden
        early_login_res = await client.post(
            "/api/auth/login",
            data={"username": unique_user, "password": password}
        )
        assert early_login_res.status_code == 403

        # 3. Verify Email OTP
        v_email_res = await client.post(
            "/api/auth/register/verify-email",
            json={"registration_token": reg_token, "otp": dev_email_otp}
        )
        assert v_email_res.status_code == 200
        v_email_body = v_email_res.json()
        assert v_email_body["email_verified"] is True
        assert v_email_body["phone_verified"] is False
        assert v_email_body["is_active"] is False

        # 4. Verify Phone OTP (completing dual verification activates the account)
        v_phone_res = await client.post(
            "/api/auth/register/verify-phone",
            json={"registration_token": reg_token, "otp": dev_phone_otp}
        )
        assert v_phone_res.status_code == 200
        v_phone_body = v_phone_res.json()
        assert v_phone_body["email_verified"] is True
        assert v_phone_body["phone_verified"] is True
        assert v_phone_body["is_active"] is True
        assert v_phone_body["tokens"] is not None
        assert "access_token" in v_phone_body["tokens"]

        # 5. Login with codename + password now succeeds (OAuth2 form-encoded)
        login_res = await client.post(
            "/api/auth/login",
            data={"username": unique_user, "password": password}
        )
        assert login_res.status_code == 200
        login_body = login_res.json()
        assert "access_token" in login_body
        assert login_body["user"]["username"] == unique_user

        # 6. Login with verified email + password also succeeds!
        email_login_res = await client.post(
            "/api/auth/login",
            data={"username": email, "password": password}
        )
        assert email_login_res.status_code == 200
        assert "access_token" in email_login_res.json()

        # 7. Duplicate registration should return 409 Conflict
        dup_res = await client.post(
            "/api/auth/register",
            json={
                "username": unique_user,
                "password": password,
                "email": email,
                "phone_number": phone,
            }
        )
        assert dup_res.status_code == 409

        # 8. Wrong password should return 401 Unauthorized
        wrong_res = await client.post(
            "/api/auth/login",
            data={"username": unique_user, "password": "WrongPassword!"}
        )
        assert wrong_res.status_code == 401

        # 9. Guest login continues to function
        guest_res = await client.post(
            "/api/auth/guest",
            json={"display_name": "GhostHunter"}
        )
        assert guest_res.status_code == 200
        guest_body = guest_res.json()
        assert guest_body["user"]["is_guest"] is True
        assert guest_body["user"]["username"] == "GhostHunter"
