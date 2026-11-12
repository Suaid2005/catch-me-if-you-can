"""
app/socket/lobby_events.py
───────────────────────────
Socket.IO events for the pre-game lobby.

Events handled here:
- lobby:join      → player joins the Socket.IO room (not the same as joining the DB room)
- lobby:leave     → player leaves the lobby
- lobby:ready     → player marks themselves as ready to start
- lobby:chat      → lobby chat (before game starts)
"""
from app.socket.server import sio
from app.game.room_manager import room_manager
from app.game.persistence import match_persistence
import logging

logger = logging.getLogger(__name__)


@sio.event
async def lobby_join(sid: str, data: dict):
    """
    Player connects their socket to a specific game room.

    Expected data: {"room_code": "ABC123", "user_id": "...", "username": "..."}

    After this, the socket is added to a Socket.IO "room" so we can broadcast
    to everyone in that game with sio.emit(..., room=room_code).
    """
    room_code = data.get("room_code", "").upper().strip()
    user_id = data.get("user_id")
    username = data.get("username", "Unknown")
    avatar = data.get("avatar", "🧑")

    if not room_code:
        await sio.emit("error", {"message": "Room code is required"}, to=sid)
        return

    # If server just restarted and room isn't in memory, attempt DB recovery
    if not room_manager.room_exists(room_code):
        recovered = await match_persistence.load_match_state(room_code)
        if recovered:
            r_data = recovered["room_data"]
            room_manager.create_room(
                host_sid=r_data.get("host_sid", sid),
                max_players=r_data.get("max_players", 12),
                allow_bots=r_data.get("allow_bots", True),
                room_code=room_code
            )
            # Restore previously saved player profiles
            for saved_p in r_data.get("players", []):
                old_sid = saved_p.get("sid", "restored_" + str(saved_p.get("user_id", "")))
                room_manager.add_socket_to_room(
                    room_code=room_code,
                    sid=old_sid,
                    user_id=saved_p.get("user_id"),
                    username=saved_p.get("username", "Player"),
                    avatar=saved_p.get("avatar", "🧑"),
                    is_bot=saved_p.get("is_bot", False),
                )
                room_manager.set_player_ready(old_sid, saved_p.get("is_ready", False))
            logger.info(f"[Lobby] Successfully recovered room {room_code} from persistent PostgreSQL storage")

    # Add socket to the Socket.IO room
    await sio.enter_room(sid, room_code)

    # Register in the in-memory room manager
    success = room_manager.add_socket_to_room(
        room_code=room_code,
        sid=sid,
        user_id=user_id,
        username=username,
        avatar=avatar,
    )

    if not success:
        await sio.emit("error", {"message": "Room not found or full"}, to=sid)
        return

    # Get updated player list and broadcast to everyone in the room
    players = room_manager.get_players(room_code)
    room = room_manager.get_room(room_code)
    host_sid = room.get("host_sid") if room else None

    # Asynchronously persist updated lobby state
    await match_persistence.save_lobby_state(room_code, host_sid, players)

    await sio.emit(
        "lobby:state",
        {"players": players, "room_code": room_code, "host_sid": host_sid},
        room=room_code,
    )
    logger.info(f"{username} ({sid}) joined lobby {room_code} (host: {host_sid})")


@sio.event
async def lobby_leave(sid: str, data: dict):
    """Player voluntarily leaves the lobby."""
    room_code = room_manager.get_room_for_socket(sid)
    if room_code:
        await sio.leave_room(sid, room_code)
        room_manager.remove_socket_from_room(sid)
        players = room_manager.get_players(room_code)
        room = room_manager.get_room(room_code)
        host_sid = room.get("host_sid") if room else None

        await match_persistence.save_lobby_state(room_code, host_sid, players)

        await sio.emit(
            "lobby:state",
            {"players": players, "room_code": room_code, "host_sid": host_sid},
            room=room_code,
        )


@sio.event
async def lobby_ready(sid: str, data: dict):
    """Player toggles their ready status."""
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code:
        return

    is_ready = data.get("ready", True)
    room_manager.set_player_ready(sid, is_ready)

    players = room_manager.get_players(room_code)
    room = room_manager.get_room(room_code)
    host_sid = room.get("host_sid") if room else None

    await match_persistence.save_lobby_state(room_code, host_sid, players)

    await sio.emit(
        "lobby:state",
        {"players": players, "room_code": room_code, "host_sid": host_sid},
        room=room_code,
    )


@sio.event
async def lobby_chat(sid: str, data: dict):
    """Broadcast a lobby chat message to all players in the room."""
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code:
        return

    player = room_manager.get_player(sid)
    if not player:
        return

    message = str(data.get("message", "")).strip()[:300]  # limit to 300 chars
    if not message:
        return

    await sio.emit(
        "lobby:chat_message",
        {
            "username": player["username"],
            "avatar": player["avatar"],
            "message": message,
        },
        room=room_code,
    )
