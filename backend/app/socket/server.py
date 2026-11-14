"""
app/socket/server.py
─────────────────────
Creates the Socket.IO async server and registers all event namespaces.

Socket.IO "events" are like custom message types. When a player does something
(e.g. sends a chat message), the frontend emits an event. This server listens
for it and broadcasts the result back to everyone in the room.

We use python-socketio's AsyncServer which works with FastAPI's async model.
"""
import re
import socketio

from app.config import get_settings

settings = get_settings()

# Known production frontend deployment for this application
KNOWN_PRODUCTION_FRONTEND = "https://catch-me-if-you-can-red.vercel.app"

# Local development regex matching standard local loopback and LAN development IPs (same as FastAPI CORS)
LOCAL_DEV_REGEX = re.compile(
    r"^https?://(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|0\.0\.0\.0)(?::\d+)?$"
)


def is_cors_origin_allowed(origin: str | None, environ: dict | None = None) -> bool:
    """
    Validates whether an incoming HTTP Origin header is permitted for Socket.IO / Engine.IO.

    Allowed:
    1. Explicit origins configured in settings.origins_list (from ALLOWED_ORIGINS & FRONTEND_URL).
    2. Known production frontend: https://catch-me-if-you-can-red.vercel.app.
    3. Local development loopback and LAN IPs (strictly active only in development mode).

    Rejected:
    - Arbitrary/unrelated Vercel projects (e.g. attacker-project.vercel.app, untrusted-site.vercel.app).
    - Unconfigured Vercel preview URLs (preview deployments must be explicitly added to settings.origins_list).
    - Subdomain deception attacks (e.g. evil-catch-me-if-you-can-red.vercel.app).
    - Suffix deception attacks (e.g. catch-me-if-you-can-red.vercel.app.attacker.com).
    - Insecure HTTP origins on remote domains.
    - Missing, empty, or malformed origin strings.
    """
    if not origin or not isinstance(origin, str):
        return False

    clean_origin = origin.strip().rstrip("/")
    if not clean_origin:
        return False

    # 1. Exact match against explicitly configured origins (highest priority)
    if clean_origin in settings.origins_list or origin in settings.origins_list:
        return True

    # 2. Known production frontend
    if clean_origin == KNOWN_PRODUCTION_FRONTEND:
        return True

    # 3. Local development loopback and LAN IPs (strictly in development mode)
    if settings.is_development and LOCAL_DEV_REGEX.match(clean_origin):
        return True

    return False


# AsyncServer: handles all WebSocket connections asynchronously.
# cors_allowed_origins restricted to explicitly configured trusted frontend origins and Vercel domains.
# ping_interval & ping_timeout keep Render WebSocket connections alive across proxy timeouts
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=is_cors_origin_allowed,
    ping_interval=20,
    ping_timeout=45,
    logger=settings.is_development,
    engineio_logger=False,
)

# Import event handlers AFTER creating sio to avoid circular imports.
# Each file registers its own event handlers using @sio.on(...)
from app.socket import connection, lobby_events, game_events  # noqa: E402, F401
