"""
app/game/room_manager.py
─────────────────────────
In-memory store for all active game rooms.

Why in-memory and not the database?
  During a game, state changes dozens of times per second (chat messages,
  timers, vote counts). Hitting the database for each update would be too slow.

  Instead, we keep live game state in a Python dict. When the game ends,
  we save the final result to the database (PostgreSQL).

This is a singleton — one instance shared across the whole application.
"""
import random
import string
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class RoomManager:
    """
    Manages all active game rooms in memory.

    Structure:
        _rooms = {
            "ABC123": {
                "host_sid": "socket_id_of_host",
                "players": {
                    "socket_id": {
                        "sid": "socket_id",
                        "user_id": "uuid or None for guests",
                        "username": "PlayerName",
                        "avatar": "🧑",
                        "is_ready": False,
                        "is_bot": False,
                        "is_alive": True,
                    },
                    ...
                }
            },
            ...
        }

        _socket_to_room = {
            "socket_id": "room_code",
            ...
        }
    """

    def __init__(self):
        self._rooms: dict[str, dict] = {}
        self._socket_to_room: dict[str, str] = {}

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
            "max_players": max_players,
            "allow_bots": allow_bots,
            "players": {},
            "game_phase": "lobby",
        }
        logger.info(f"Room created in RoomManager: {code} (host_sid: {host_sid})")
        return code

    def _generate_code(self) -> str:
        """Generate a unique 6-character alphanumeric room code."""
        while True:
            code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
            if code not in self._rooms:
                return code

    # ── Player Management ─────────────────────────────────────────

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
        Register a socket connection as a player in the room.
        Returns True on success, False if the room is full or not found.
        """
        code = room_code.upper().strip()
        if code not in self._rooms:
            # If room was created externally (e.g. REST) without room_manager sync, initialize it
            self.create_room(host_sid=sid, max_players=8, room_code=code)

        room = self._rooms[code]
        if len(room["players"]) >= room["max_players"]:
            return False

        # If host is pending or empty, first joining player becomes host
        if room.get("host_sid") in ("pending", None, ""):
            room["host_sid"] = sid

        room["players"][sid] = {
            "sid": sid,
            "user_id": user_id,
            "username": username,
            "avatar": avatar,
            "is_ready": False,
            "is_bot": is_bot,
            "is_alive": True,
            "suspicion_score": 0.0,
        }

        self._socket_to_room[sid] = code
        return True

    def remove_socket_from_room(self, sid: str) -> None:
        """Remove a player from their room (called on leave or disconnect)."""
        room_code = self._socket_to_room.pop(sid, None)
        if room_code and room_code in self._rooms:
            self._rooms[room_code]["players"].pop(sid, None)
            # If the room is now empty, clean it up
            if not self._rooms[room_code]["players"]:
                del self._rooms[room_code]
                logger.info(f"Room {room_code} cleaned up (empty)")
            # If the host left, assign a new host
            elif self._rooms[room_code]["host_sid"] == sid:
                remaining = list(self._rooms[room_code]["players"].keys())
                self._rooms[room_code]["host_sid"] = remaining[0]

    async def handle_disconnect(self, sid: str) -> None:
        """Mark a player as disconnected (they may reconnect)."""
        self.remove_socket_from_room(sid)

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
        if not room_code:
            return None
        return self._rooms[room_code]["players"].get(sid)

    def is_host(self, sid: str, room_code: str) -> bool:
        """Check if the given socket is the room host."""
        return self._rooms.get(room_code, {}).get("host_sid") == sid

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
