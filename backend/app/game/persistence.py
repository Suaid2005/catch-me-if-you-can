"""
app/game/persistence.py
───────────────────────
Asynchronous database persistence layer for Catch Me If You Can.
Safely syncs room codes, player sessions, match configuration,
phases, clues, votes, and results to PostgreSQL / SQLite.

Guarantees full match survivability across server restarts,
cold starts, or temporary disconnects without leaking secrets.
"""
import logging
from typing import Optional, Dict, Any, List
from sqlalchemy import select, update
from app.database import AsyncSessionLocal
from app.models.match_state import MatchStateModel

logger = logging.getLogger(__name__)


class MatchPersistence:
    @staticmethod
    async def save_lobby_state(
        room_code: str,
        host_sid: Optional[str],
        players: List[Dict[str, Any]],
        config: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Saves or updates lobby state in the database.
        """
        code = room_code.upper().strip()
        config = config or {}
        try:
            async with AsyncSessionLocal() as session:
                stmt = select(MatchStateModel).where(MatchStateModel.room_code == code)
                result = await session.execute(stmt)
                record = result.scalar_one_or_none()

                if not record:
                    record = MatchStateModel(
                        room_code=code,
                        host_sid=host_sid,
                        phase="lobby",
                        players=players,
                        mode=config.get("mode", "classic"),
                        category=config.get("category", "Random"),
                        difficulty=config.get("difficulty", "medium"),
                        total_rounds=int(config.get("clue_rounds", 2)),
                    )
                    session.add(record)
                else:
                    record.host_sid = host_sid
                    record.phase = record.phase if record.phase != "ended" else "lobby"
                    record.players = players
                    if config:
                        record.mode = config.get("mode", record.mode)
                        record.category = config.get("category", record.category)
                        record.difficulty = config.get("difficulty", record.difficulty)
                        record.total_rounds = int(config.get("clue_rounds", record.total_rounds))

                await session.commit()
                logger.info(f"[Persistence] Saved lobby state for room {code} ({len(players)} players)")
        except Exception as e:
            logger.error(f"[Persistence] Error saving lobby state for {code}: {e}")

    @staticmethod
    async def save_match_state(
        room_code: str,
        match_state: Dict[str, Any],
        players: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """
        Persists authoritative in-game match state to PostgreSQL.
        Includes clues, turn order, round, phase, votes, and protected secrets.
        """
        code = room_code.upper().strip()
        try:
            async with AsyncSessionLocal() as session:
                stmt = select(MatchStateModel).where(MatchStateModel.room_code == code)
                result = await session.execute(stmt)
                record = result.scalar_one_or_none()

                # Clean role_acks if it's a set
                acks = list(match_state.get("role_acks", []))

                turn_order = match_state.get("turn_order", [])
                turn_idx = match_state.get("current_turn_index", 0)
                current_turn_sid = turn_order[turn_idx] if turn_order and turn_idx < len(turn_order) else None

                if not record:
                    record = MatchStateModel(
                        room_code=code,
                        phase=match_state.get("phase", "role_reveal"),
                        mode=match_state.get("mode", "classic"),
                        category=match_state.get("category", "Random"),
                        difficulty=match_state.get("difficulty", "medium"),
                        impostor_count=match_state.get("impostor_count"),
                        total_rounds=match_state.get("total_rounds", 2),
                        current_round=match_state.get("current_round", 1),
                        current_turn_sid=current_turn_sid,
                        current_turn_index=turn_idx,
                        players=players or [],
                        turn_order=turn_order,
                        clues=match_state.get("clues", []),
                        votes=match_state.get("votes", {}),
                        role_acks=acks,
                        chaos_card=match_state.get("active_chaos_card"),
                        winner=match_state.get("winner"),
                        secret_word=match_state.get("secret_word"),
                        undercover_word=match_state.get("undercover_word"),
                        player_assignments=match_state.get("player_assignments", {}),
                    )
                    session.add(record)
                else:
                    record.phase = match_state.get("phase", record.phase)
                    record.mode = match_state.get("mode", record.mode)
                    record.category = match_state.get("category", record.category)
                    record.difficulty = match_state.get("difficulty", record.difficulty)
                    record.impostor_count = match_state.get("impostor_count", record.impostor_count)
                    record.total_rounds = match_state.get("total_rounds", record.total_rounds)
                    record.current_round = match_state.get("current_round", record.current_round)
                    record.current_turn_sid = current_turn_sid
                    record.current_turn_index = turn_idx
                    if players is not None:
                        record.players = players
                    record.turn_order = turn_order
                    record.clues = match_state.get("clues", [])
                    record.votes = match_state.get("votes", {})
                    record.role_acks = acks
                    record.chaos_card = match_state.get("active_chaos_card")
                    record.winner = match_state.get("winner")
                    record.secret_word = match_state.get("secret_word", record.secret_word)
                    record.undercover_word = match_state.get("undercover_word", record.undercover_word)
                    record.player_assignments = match_state.get("player_assignments", record.player_assignments)

                await session.commit()
                logger.info(f"[Persistence] Saved match state for room {code} (phase: {record.phase})")
        except Exception as e:
            logger.error(f"[Persistence] Error saving match state for {code}: {e}")

    @staticmethod
    async def load_match_state(room_code: str) -> Optional[Dict[str, Any]]:
        """
        Loads saved room and match state from the database.
        Returns a dict containing 'room_data' and 'match_state' or None.
        """
        code = room_code.upper().strip()
        try:
            async with AsyncSessionLocal() as session:
                stmt = select(MatchStateModel).where(MatchStateModel.room_code == code)
                result = await session.execute(stmt)
                record = result.scalar_one_or_none()

                if not record:
                    return None

                # Reconstruct in-memory match_state dict
                match_state = {
                    "mode": record.mode,
                    "category": record.category,
                    "difficulty": record.difficulty,
                    "impostor_count": record.impostor_count,
                    "total_rounds": record.total_rounds,
                    "current_round": record.current_round,
                    "current_turn_index": record.current_turn_index,
                    "turn_order": record.turn_order or [],
                    "clues": record.clues or [],
                    "votes": record.votes or {},
                    "role_acks": set(record.role_acks or []),
                    "active_chaos_card": record.chaos_card,
                    "phase": record.phase,
                    "winner": record.winner,
                    "secret_word": record.secret_word,
                    "undercover_word": record.undercover_word,
                    "player_assignments": record.player_assignments or {},
                }

                room_data = {
                    "room_code": record.room_code,
                    "host_sid": record.host_sid,
                    "phase": record.phase,
                    "players": record.players or [],
                    "max_players": 12,
                    "allow_bots": True,
                }

                return {
                    "room_data": room_data,
                    "match_state": match_state,
                }
        except Exception as e:
            logger.error(f"[Persistence] Error loading match state for {code}: {e}")
            return None

    @staticmethod
    async def remove_match_state(room_code: str) -> None:
        """
        Marks room as ended in database upon closure.
        """
        code = room_code.upper().strip()
        try:
            async with AsyncSessionLocal() as session:
                stmt = (
                    update(MatchStateModel)
                    .where(MatchStateModel.room_code == code)
                    .values(phase="ended")
                )
                await session.execute(stmt)
                await session.commit()
                logger.info(f"[Persistence] Marked room {code} as ended")
        except Exception as e:
            logger.error(f"[Persistence] Error marking room {code} as ended: {e}")


match_persistence = MatchPersistence()
