"""
app/socket/lobby_events.py
───────────────────────────
Socket.IO events for the pre-game lobby.

Events handled here:
- lobby:join      → player joins the Socket.IO room with stable identity & token verification
- lobby:leave     → player leaves the lobby voluntarily
- lobby:ready     → player marks themselves as ready to start
- lobby:chat      → lobby chat (before game starts)
"""
import uuid
import logging
from app.socket.server import sio
from app.game.room_manager import room_manager
from app.game.persistence import match_persistence
from app.api.auth import decode_access_token

logger = logging.getLogger(__name__)


@sio.event
async def lobby_join(sid: str, data: dict):
    """
    Player connects their socket to a specific game room.
    Ensures stable player identity and authenticates reconnects via token.
    """
    room_code = data.get("room_code", "").upper().strip()
    user_id = data.get("user_id")
    username = data.get("username", "Unknown")
    avatar = data.get("avatar", "🧑")
    token = data.get("token")

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
                room_code=room_code,
            )
            # Restore previously saved player profiles
            for saved_p in r_data.get("players", []):
                p_uid = saved_p.get("user_id")
                p_sid = saved_p.get("sid", sid if p_uid == user_id else f"saved_{p_uid}")
                room_manager.add_socket_to_room(
                    room_code=room_code,
                    sid=p_sid,
                    user_id=p_uid,
                    username=saved_p.get("username", "Player"),
                    avatar=saved_p.get("avatar", "🧑"),
                    is_bot=saved_p.get("is_bot", False),
                )
                room_manager.set_player_ready(p_sid, saved_p.get("is_ready", False))
            logger.info(f"[Lobby] Successfully recovered room {room_code} from persistent storage")

    # Secure reconnect verification:
    # If a player is already registered under this user_id in the room,
    # verify that the caller provides a valid token belonging to user_id.
    existing_players = room_manager.get_players(room_code)
    target_existing = next((p for p in existing_players if p.get("user_id") == user_id), None)
    if target_existing and user_id:
        # Player is claiming an existing seat
        payload = decode_access_token(token) if token else None
        if not payload or payload.get("sub") != user_id:
            logger.warning(f"[Lobby] Unauthorized seat claim for user_id={user_id} in {room_code}")
            # Do NOT hijack the seat. Assign fresh unique identity.
            user_id = str(uuid.uuid4())

    # Add socket to the Socket.IO room
    await sio.enter_room(sid, room_code)

    # Register or reconnect in the in-memory room manager
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

    # Broadcast reconnection event if player was reconnecting
    await sio.emit(
        "player:status_changed",
        {
            "sid": sid,
            "user_id": user_id,
            "username": username,
            "status": "connected",
        },
        room=room_code,
    )

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
async def lobby_leave(sid: str, data: dict = None):
    """Player voluntarily leaves the lobby."""
    room_code = room_manager.get_room_for_socket(sid)
    if room_code:
        await sio.leave_room(sid, room_code)
        room_manager.remove_socket_from_room(sid)

        players = room_manager.get_players(room_code)
        room = room_manager.get_room(room_code)
        host_sid = room.get("host_sid") if room else None

        if room:
            await match_persistence.save_lobby_state(room_code, host_sid, players)
            await sio.emit(
                "lobby:state",
                {"players": players, "room_code": room_code, "host_sid": host_sid},
                room=room_code,
            )
            # Host migration broadcast if host changed
            await sio.emit(
                "room:host_changed",
                {"host_sid": host_sid, "host_username": room_manager.get_player(host_sid).get("username") if room_manager.get_player(host_sid) else "Host"},
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

    message = str(data.get("message", "")).strip()[:300]
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
