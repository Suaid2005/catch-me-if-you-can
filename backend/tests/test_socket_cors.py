"""
backend/tests/test_socket_cors.py
─────────────────────────────────
Security test suite for Socket.IO / Engine.IO CORS origin verification.

Verifies:
1. The production frontend (https://catch-me-if-you-can-red.vercel.app) is accepted.
2. Explicitly configured preview URLs are accepted.
3. Unconfigured project-style preview URLs are strictly rejected.
4. Unrelated Vercel projects (attacker-project.vercel.app, untrusted-site.vercel.app) are rejected.
5. Suffix and subdomain deceptions (*.attacker.com, evil-*.vercel.app) are rejected.
6. Local development origins are accepted in development mode, but rejected in production.
7. Missing, empty, or malformed origin headers are handled safely without exceptions.
8. Socket.IO event handler registrations and authentication helpers remain intact.
"""
import os
import sys
import unittest.mock as mock

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.socket.server import (
    sio,
    is_cors_origin_allowed,
    KNOWN_PRODUCTION_FRONTEND,
    LOCAL_DEV_REGEX,
)
from app.config import get_settings

settings = get_settings()


def test_production_frontend_accepted():
    """Verify the known production frontend URL is accepted with correct CORS headers."""
    prod_url = KNOWN_PRODUCTION_FRONTEND
    assert prod_url == "https://catch-me-if-you-can-red.vercel.app"

    # 1. Direct validator
    assert is_cors_origin_allowed(prod_url) is True

    # 2. Engine.IO _cors_allowed_origins
    environ = {"HTTP_ORIGIN": prod_url, "REQUEST_METHOD": "GET"}
    allowed = sio.eio._cors_allowed_origins(environ)
    assert allowed == [prod_url]

    # 3. Engine.IO _cors_headers reflection
    headers = dict(sio.eio._cors_headers(environ))
    assert headers.get("Access-Control-Allow-Origin") == prod_url
    assert headers.get("Access-Control-Allow-Credentials") == "true"


def test_explicitly_configured_preview_url_accepted():
    """Verify an explicitly configured preview URL (added to settings.origins_list) is accepted."""
    preview_url = "https://catch-me-if-you-can-red-pr-42.vercel.app"

    # Simulate environment where preview URL is configured via allowed_origins
    with mock.patch.object(settings, "allowed_origins", f"{settings.allowed_origins},{preview_url}"):
        assert preview_url in settings.origins_list
        assert is_cors_origin_allowed(preview_url) is True

        environ = {"HTTP_ORIGIN": preview_url, "REQUEST_METHOD": "GET"}
        allowed = sio.eio._cors_allowed_origins(environ)
        assert allowed == [preview_url]

        headers = dict(sio.eio._cors_headers(environ))
        assert headers.get("Access-Control-Allow-Origin") == preview_url
        assert headers.get("Access-Control-Allow-Credentials") == "true"


def test_unconfigured_project_preview_url_rejected():
    """Verify unconfigured project-style preview URLs are rejected unless explicitly listed."""
    unconfigured_previews = [
        "https://catch-me-if-you-can-red-git-preview-branch.vercel.app",
        "https://catch-me-if-you-can-red-pr-42.vercel.app",
        "https://catch-me-if-you-can-red-feat-ui-upgrade.vercel.app",
        "https://catch-me-if-you-can-red-abc12345.vercel.app",
    ]

    for preview_url in unconfigured_previews:
        # Ensure it is not accidentally in settings.origins_list
        assert preview_url not in settings.origins_list

        assert is_cors_origin_allowed(preview_url) is False, (
            f"Unconfigured preview {preview_url} should be rejected"
        )
        environ = {"HTTP_ORIGIN": preview_url, "REQUEST_METHOD": "GET"}
        allowed = sio.eio._cors_allowed_origins(environ)
        assert allowed == []
        headers = dict(sio.eio._cors_headers(environ))
        assert "Access-Control-Allow-Origin" not in headers


def test_unrelated_vercel_projects_and_deceptions_rejected():
    """Verify arbitrary Vercel projects, attacker domains, and suffix deceptions are rejected."""
    rejected_origins = [
        # Unrelated Vercel projects
        "https://attacker-project.vercel.app",
        "https://untrusted-site.vercel.app",
        "https://random-app.vercel.app",
        "https://my-other-project.vercel.app",
        # Subdomain / prefix deception
        "https://evil-catch-me-if-you-can-red.vercel.app",
        "https://not-catch-me-if-you-can-red.vercel.app",
        # Suffix / domain confusion deception
        "https://catch-me-if-you-can-red.vercel.app.attacker.com",
        "https://catch-me-if-you-can-red.vercel.app.evil.org",
        # Insecure HTTP for Vercel
        "http://catch-me-if-you-can-red.vercel.app",
        # External untrusted domains
        "https://evil.com",
        "https://hacker.io",
        "http://evil-localhost:3000",
    ]

    for origin in rejected_origins:
        assert is_cors_origin_allowed(origin) is False, f"Origin {origin} should have been rejected"

        environ = {"HTTP_ORIGIN": origin, "REQUEST_METHOD": "GET"}
        allowed = sio.eio._cors_allowed_origins(environ)
        assert allowed == [], f"Engine.IO allowed origin should be empty for {origin}"

        headers = dict(sio.eio._cors_headers(environ))
        assert "Access-Control-Allow-Origin" not in headers, f"Access-Control-Allow-Origin present for {origin}"


def test_configured_local_origins_accepted_in_dev_mode():
    """Verify configured origins and development loopback/LAN origins are accepted in dev mode."""
    assert len(settings.origins_list) > 0
    for origin in settings.origins_list:
        assert is_cors_origin_allowed(origin) is True
        environ = {"HTTP_ORIGIN": origin, "REQUEST_METHOD": "GET"}
        headers = dict(sio.eio._cors_headers(environ))
        assert headers.get("Access-Control-Allow-Origin") == origin

    dev_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://192.168.1.50:3000",
        "http://10.0.0.12:3000",
    ]
    for origin in dev_origins:
        assert is_cors_origin_allowed(origin) is True
        environ = {"HTTP_ORIGIN": origin, "REQUEST_METHOD": "GET"}
        headers = dict(sio.eio._cors_headers(environ))
        assert headers.get("Access-Control-Allow-Origin") == origin


def test_local_dev_origins_rejected_in_production():
    """Verify that unlisted local LAN IPs are rejected when in production mode."""
    unlisted_lan = "http://192.168.1.99:3000"

    with mock.patch.object(settings, "app_env", "production"):
        assert settings.is_development is False
        # Unlisted LAN IP rejected in production
        assert is_cors_origin_allowed(unlisted_lan) is False

        # Production frontend still accepted
        assert is_cors_origin_allowed(KNOWN_PRODUCTION_FRONTEND) is True


def test_missing_and_malformed_origins_handled_safely():
    """Verify missing, empty, whitespace, and malformed origins do not crash."""
    malformed_origins = [
        None,
        "",
        "   ",
        "not-a-valid-origin",
        "javascript:alert(1)",
        "data:text/html;base64,PHNjcmlwdD4=",
        "http://",
        "https://",
    ]

    for bad_origin in malformed_origins:
        assert is_cors_origin_allowed(bad_origin) is False

        environ = {"REQUEST_METHOD": "GET"}
        if bad_origin is not None:
            environ["HTTP_ORIGIN"] = bad_origin

        allowed = sio.eio._cors_allowed_origins(environ)
        assert allowed == [] or allowed is None

        headers = dict(sio.eio._cors_headers(environ))
        assert "Access-Control-Allow-Origin" not in headers


def test_socketio_event_handlers_registered():
    """Verify that Socket.IO server has registered all core event namespaces without regression."""
    import inspect

    assert "/" in sio.handlers
    root_handlers = sio.handlers["/"]

    expected_events = [
        "connect",
        "disconnect",
        "lobby_join",
        "lobby_leave",
        "game_start",
        "game_clue_submit",
        "game_vote_cast",
    ]
    for event_name in expected_events:
        assert event_name in root_handlers, f"Handler for '{event_name}' missing from sio.handlers['/']"
        handler = root_handlers[event_name]
        assert callable(handler), f"Handler for '{event_name}' is not callable"
        assert inspect.iscoroutinefunction(handler), f"Handler for '{event_name}' is not an async coroutine"


def test_authentication_and_security_intact():
    """Verify authentication helpers, password hashing, and JWT token issuance remain intact."""
    from app.api.auth import hash_password, verify_password, create_access_token, router as auth_router
    from jose import jwt

    # 1. Password hashing and verification
    plain = "Secr3t_P@ssw0rd!"
    hashed = hash_password(plain)
    assert verify_password(plain, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False

    # 2. JWT token creation and decoding
    test_user_id = "test-uuid-456"
    token = create_access_token({"sub": test_user_id})
    payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    assert payload.get("sub") == test_user_id
    assert "exp" in payload

    # 3. Auth router route endpoints registered
    routes = [r.path for r in auth_router.routes]
    assert "/register" in routes
    assert "/login" in routes
    assert "/guest" in routes
    assert "/me" in routes
