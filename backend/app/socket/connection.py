"""
app/socket/connection.py
─────────────────────────
Handles player connect and disconnect events.

When a player opens the game in their browser, Socket.IO fires 'connect'.
When they close the tab or lose internet, 'disconnect' fires.
"""
from app.socket.server import sio
from app.game.room_manager import room_manager
import logging

logger = logging.getLogger(__name__)


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None):
    """
    Called automatically when a player's browser connects.

    sid: Socket ID — a unique string identifying this connection.
         Think of it as a temporary player address.
    auth: Optional auth data sent by the client on connect (e.g. JWT token).
    """
    logger.info(f"Client connected: {sid}")
    # Acknowledge the connection
    await sio.emit("server:connected", {"sid": sid}, to=sid)


@sio.event
async def disconnect(sid: str):
    """
    Called when a player disconnects (closed tab, network drop, etc.).
    We notify their room so other players see them as 'offline'.
    """
    logger.info(f"Client disconnected: {sid}")

    # Find which room this player was in and notify others
    room_code = room_manager.get_room_for_socket(sid)
    if room_code:
        await room_manager.handle_disconnect(sid)
        await sio.emit(
            "player:disconnected",
            {"sid": sid},
            room=room_code,
            skip_sid=sid,
        )
