"""
app/socket/connection.py
─────────────────────────
Handles player connect and disconnect events.

When a player disconnects, enters a 75-second reconnection grace period:
- Does NOT instantly delete their seat or role.
- Broadcasts 'player:status_changed' (status: 'reconnecting', grace_period_seconds: 75).
- If the player reconnects within 75s, cancels the grace timer and restores seat.
- If 75s expires, permanently removes player and safely migrates host.
"""
import logging
from app.socket.server import sio
from app.game.room_manager import room_manager

logger = logging.getLogger(__name__)


@sio.event
async def connect(sid: str, environ: dict, auth: dict | None = None):
    """
    Called automatically when a player's browser connects.
    """
    logger.info(f"Client connected: {sid}")
    await sio.emit("server:connected", {"sid": sid}, to=sid)


@sio.event
async def disconnect(sid: str):
    """
    Called when a player disconnects (closed tab, network drop, etc.).
    Initiates 75-second reconnection grace period instead of instant ejection.
    """
    logger.info(f"Client disconnected: {sid}")

    disc_info = room_manager.mark_player_disconnected(sid)
    if not disc_info:
        return

    room_code, player, player_key = disc_info

    # 1. Broadcast reconnecting status to room
    await sio.emit(
        "player:status_changed",
        {
            "sid": sid,
            "user_id": player.get("user_id"),
            "username": player.get("username"),
            "status": "reconnecting",
            "grace_period_seconds": 75,
            "disconnected_at": player.get("disconnected_at"),
        },
        room=room_code,
    )

    # 2. Maintain backward-compatible legacy event
    await sio.emit(
        "player:disconnected",
        {"sid": sid},
        room=room_code,
        skip_sid=sid,
    )

    # 3. Schedule 75-second grace period callback
    async def _on_grace_timeout():
        logger.info(f"[GraceTimeout] 75s grace period expired for {player_key} in {room_code}")
        removed = room_manager.permanently_remove_player(room_code, player_key)
        if not removed:
            return

        # Broadcast permanent departure
        await sio.emit(
            "player:left",
            {
                "sid": sid,
                "user_id": removed.get("user_id"),
                "username": removed.get("username"),
                "reason": "reconnection_timeout",
            },
            room=room_code,
        )

        room = room_manager.get_room(room_code)
        if room:
            new_host_sid = room.get("host_sid")
            if new_host_sid and new_host_sid != "pending":
                new_host_p = room_manager.get_player(new_host_sid)
                await sio.emit(
                    "room:host_changed",
                    {
                        "host_sid": new_host_sid,
                        "host_username": new_host_p.get("username") if new_host_p else "Host",
                    },
                    room=room_code,
                )

            players = room_manager.get_players(room_code)
            await sio.emit(
                "lobby:state",
                {
                    "players": players,
                    "room_code": room_code,
                    "host_sid": room.get("host_sid"),
                },
                room=room_code,
            )

        # Notify in-game handler if active match exists
        try:
            from app.socket.game_events import handle_player_dropped_in_game
            await handle_player_dropped_in_game(room_code, sid, player_key)
        except Exception as e:
            logger.error(f"[GraceTimeout] Error handling in-game player drop: {e}")

    room_manager.schedule_disconnect_grace(room_code, player_key, 75.0, _on_grace_timeout)
