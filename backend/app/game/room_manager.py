"""
app/game/room_manager.py
─────────────────────────
In-memory store for all active game rooms with:
1. Stable player identity (keyed by user_id or sid, preventing duplicate seats).
2. 75-second reconnection grace period before seat deletion.
3. Safe host migration on disconnect or voluntary departure.
4. Concurrency protection and room cleanup.

This is a singleton — one instance shared across the whole application.
"""
import random
import string
import logging
import time
import asyncio
from typing import Optional, Callable, Awaitable

logger = logging.getLogger(__name__)


class RoomManager:
    """
    Manages all active game rooms in memory with stable player identity
    and reconnection grace period tracking.
    """

    def __init__(self):
        # room_code -> room_dict
        self._rooms: dict[str, dict] = {}
        # sid -> room_code
        self._socket_to_room: dict[str, str] = {}
        # sid -> player_key (user_id or original sid)
        self._socket_to_player_key: dict[str, str] = {}
        # f"{room_code}:{player_key}" -> asyncio.Task
        self._disconnect_grace_tasks: dict[str, asyncio.Task] = {}

    # ── Room Creation ─────────────────────────────────────────────

    def create_room(
        self,
        host_sid: str = "pending",
        max_players: int = 8,
        allow_bots: bool = True,
        room_code: Optional[str] = None,
    ) -> str:
        """Create a new room (optionally using a given code) and return its code."""
        code = room_code.upper().strip() if room_code else self._generate_code()
        self._rooms[code] = {
            "host_sid": host_sid,
            "host_user_id": None,
            "max_players": max_players,
            "allow_bots": allow_bots,
            "players": {},
            "game_phase": "lobby",
            "created_at": time.time(),
        }
        logger.info(f"Room created in RoomManager: {code} (host_sid: {host_sid})")
        return code

    def _generate_code(self) -> str:
        """Generate a unique 6-character alphanumeric room code."""
        while True:
            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if code not in self._rooms:
                return code

    # ── Player Management & Stable Identity ────────────────────────

    def add_socket_to_room(
        self,
        room_code: str,
        sid: str,
        user_id: Optional[str] = None,
        username: str = "Player",
        avatar: str = "🧑",
        is_bot: bool = False,
    ) -> bool:
        """
        Register or reconnect a socket connection in the room.
        Keyed by stable player identity (user_id if present, else sid).
        Returns True on success, False if the room is full or not found.
        """
        code = room_code.upper().strip()
        if code not in self._rooms:
            # If room was created externally without room_manager sync, initialize it
            self.create_room(host_sid=sid, max_players=8, room_code=code)

        room = self._rooms[code]
        player_key = user_id or sid

        # Check if player is reconnecting to an existing seat
        existing_player = room["players"].get(player_key)
        if not existing_player and user_id:
            # Search by user_id if key was previously set by an older sid
            for k, p in list(room["players"].items()):
                if p.get("user_id") == user_id:
                    existing_player = p
                    player_key = k
                    break

        if existing_player:
            # Reconnection: cancel grace period task
            self.cancel_disconnect_grace(code, player_key)

            # Unmap old socket if different
            old_sid = existing_player.get("sid")
            if old_sid and old_sid != sid:
                self._socket_to_room.pop(old_sid, None)
                self._socket_to_player_key.pop(old_sid, None)

            # Update player with new socket and set connected
            existing_player["sid"] = sid
            existing_player["is_connected"] = True
            existing_player["disconnected_at"] = None
            if username and username != "Player":
                existing_player["username"] = username
            if avatar and avatar != "🧑":
                existing_player["avatar"] = avatar

            self._socket_to_room[sid] = code
            self._socket_to_player_key[sid] = player_key

            # If this player is the room host, ensure host_sid points to current sid
            if room.get("host_user_id") == user_id or room.get("host_sid") == old_sid:
                room["host_sid"] = sid
                room["host_user_id"] = user_id

            logger.info(f"[RoomManager] Player {existing_player.get('username')} reconnected in {code} (new sid: {sid})")
            return True

        # New player joining: check capacity
        if len(room["players"]) >= room["max_players"]:
            return False

        # If host is pending or empty, first joining player becomes host
        if room.get("host_sid") in ("pending", None, ""):
            room["host_sid"] = sid
            room["host_user_id"] = user_id

        room["players"][player_key] = {
            "sid": sid,
            "user_id": user_id,
            "username": username,
            "avatar": avatar,
            "is_ready": False,
            "is_bot": is_bot,
            "is_alive": True,
            "is_connected": True,
            "disconnected_at": None,
            "suspicion_score": 0.0,
        }

        self._socket_to_room[sid] = code
        self._socket_to_player_key[sid] = player_key
        return True

    def mark_player_disconnected(self, sid: str) -> Optional[tuple[str, dict, str]]:
        """
        Marks a player as disconnected without removing their seat immediately.
        Returns (room_code, player_dict, player_key) if found, else None.
        """
        room_code = self._socket_to_room.get(sid)
        player_key = self._socket_to_player_key.get(sid)
        if not room_code or not player_key:
            return None

        room = self._rooms.get(room_code)
        if not room:
            return None

        player = room["players"].get(player_key)
        if not player:
            return None

        player["is_connected"] = False
        player["disconnected_at"] = time.time()

        # Unmap disconnected socket address, but leave player entry intact
        self._socket_to_room.pop(sid, None)
        self._socket_to_player_key.pop(sid, None)

        logger.info(f"[RoomManager] Player {player.get('username')} ({sid}) marked disconnected in {room_code}")
        return room_code, player, player_key

    def schedule_disconnect_grace(
        self,
        room_code: str,
        player_key: str,
        duration: float,
        on_timeout: Callable[[], Awaitable[None]],
    ) -> None:
        """
        Schedules a 75-second grace period task before permanent seat removal.
        """
        self.cancel_disconnect_grace(room_code, player_key)
        task_key = f"{room_code}:{player_key}"

        async def _grace_worker():
            try:
                await asyncio.sleep(duration)
                await on_timeout()
            except asyncio.CancelledError:
                pass
            finally:
                self._disconnect_grace_tasks.pop(task_key, None)

        self._disconnect_grace_tasks[task_key] = asyncio.create_task(_grace_worker())
        logger.info(f"[RoomManager] Scheduled {duration}s grace period for {player_key} in {room_code}")

    def cancel_disconnect_grace(self, room_code: str, player_key: str) -> None:
        """Cancels any running disconnect grace timer for the given player."""
        task_key = f"{room_code}:{player_key}"
        task = self._disconnect_grace_tasks.pop(task_key, None)
        if task and not task.done():
            task.cancel()
            logger.info(f"[RoomManager] Cancelled disconnect grace period for {player_key} in {room_code}")

    def permanently_remove_player(self, room_code: str, player_key: str) -> Optional[dict]:
        """
        Permanently removes a player from the room (e.g. grace period expired or voluntary leave).
        Triggers host migration if the departing player was host.
        """
        self.cancel_disconnect_grace(room_code, player_key)
        room = self._rooms.get(room_code)
        if not room:
            return None

        player = room["players"].pop(player_key, None)
        if not player:
            return None

        # Clean up any residual socket mappings
        sid = player.get("sid")
        if sid:
            self._socket_to_room.pop(sid, None)
            self._socket_to_player_key.pop(sid, None)

        # If room is now empty of all human players, clean up room
        active_humans = [
            p for p in room["players"].values()
            if not p.get("is_bot", False)
        ]
        if not active_humans:
            self._rooms.pop(room_code, None)
            logger.info(f"[RoomManager] Room {room_code} cleaned up (no active human players left)")
            return player

        # If departing player was the host, migrate host
        if room.get("host_sid") == sid or room.get("host_user_id") == player.get("user_id"):
            self.migrate_host(room_code)

        return player

    def migrate_host(self, room_code: str) -> Optional[dict]:
        """
        Selects the next eligible connected human player as the new room host.
        Returns the new host player dict or None.
        """
        room = self._rooms.get(room_code)
        if not room or not room["players"]:
            return None

        # Prefer connected human players
        connected_humans = [
            p for p in room["players"].values()
            if p.get("is_connected", True) and not p.get("is_bot", False)
        ]
        candidates = connected_humans or [
            p for p in room["players"].values()
            if p.get("is_connected", True)
        ]

        if candidates:
            new_host = candidates[0]
            room["host_sid"] = new_host["sid"]
            room["host_user_id"] = new_host.get("user_id")
            logger.info(f"[RoomManager] Host migrated in {room_code} to {new_host.get('username')} ({new_host.get('sid')})")
            return new_host

        # If no connected players, leave pending
        room["host_sid"] = "pending"
        room["host_user_id"] = None
        return None

    def remove_socket_from_room(self, sid: str) -> None:
        """Voluntary leave: immediately removes player and migrates host if needed."""
        room_code = self._socket_to_room.get(sid)
        player_key = self._socket_to_player_key.get(sid)
        if room_code and player_key:
            self.permanently_remove_player(room_code, player_key)
        elif room_code and room_code in self._rooms:
            # Fallback legacy lookup
            self._rooms[room_code]["players"].pop(sid, None)
            self._socket_to_room.pop(sid, None)
            if not self._rooms[room_code]["players"]:
                del self._rooms[room_code]

    async def handle_disconnect(self, sid: str) -> None:
        """Legacy helper for backward compatibility."""
        self.mark_player_disconnected(sid)

    # ── Queries ───────────────────────────────────────────────────

    def get_room_for_socket(self, sid: str) -> Optional[str]:
        """Return the room code for a given socket ID, or None."""
        return self._socket_to_room.get(sid)

    def get_players(self, room_code: str) -> list[dict]:
        """Return a list of all players in a room (safe to send to clients)."""
        if room_code not in self._rooms:
            return []
        return list(self._rooms[room_code]["players"].values())

    def get_player(self, sid: str) -> Optional[dict]:
        """Return the player dict for a given socket ID."""
        room_code = self._socket_to_room.get(sid)
        player_key = self._socket_to_player_key.get(sid)
        if not room_code or not player_key:
            return None
        return self._rooms.get(room_code, {}).get("players", {}).get(player_key)

    def is_host(self, sid: str, room_code: str) -> bool:
        """Check if the given socket is the room host."""
        room = self._rooms.get(room_code)
        if not room:
            return False
        if room.get("host_sid") == sid:
            return True
        player = self.get_player(sid)
        if player and player.get("user_id") and player.get("user_id") == room.get("host_user_id"):
            return True
        return False

    def set_player_ready(self, sid: str, is_ready: bool) -> None:
        player = self.get_player(sid)
        if player:
            player["is_ready"] = is_ready

    def room_exists(self, room_code: str) -> bool:
        return room_code in self._rooms

    def get_room(self, room_code: str) -> Optional[dict]:
        return self._rooms.get(room_code)


# Singleton instance — imported and used everywhere in the socket layer
room_manager = RoomManager()
