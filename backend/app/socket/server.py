"""
app/socket/server.py
─────────────────────
Creates the Socket.IO async server and registers all event namespaces.

Socket.IO "events" are like custom message types. When a player does something
(e.g. sends a chat message), the frontend emits an event. This server listens
for it and broadcasts the result back to everyone in the room.

We use python-socketio's AsyncServer which works with FastAPI's async model.
"""
import socketio

from app.config import get_settings

settings = get_settings()

# AsyncServer: handles all WebSocket connections asynchronously.
# cors_allowed_origins="*" allows connection from deployed frontend (Vercel)
# ping_interval & ping_timeout keep Render WebSocket connections alive across proxy timeouts
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_interval=20,
    ping_timeout=45,
    logger=settings.is_development,
    engineio_logger=False,
)

# Import event handlers AFTER creating sio to avoid circular imports.
# Each file registers its own event handlers using @sio.on(...)
from app.socket import connection, lobby_events, game_events  # noqa: E402, F401
