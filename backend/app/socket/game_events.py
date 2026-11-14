"""
app/socket/game_events.py
──────────────────────────
Socket.IO handlers for in-game real-time match events.
Implements the full lifecycle for online multiplayer:
1. game:start           -> Initialize match with SecretWordEngine, assign private roles/words
2. game:clue_submit     -> Validate player turn, authoritative 60s timer, semantic evaluation, advance turn
3. game:discussion      -> Transition from clue phase to discussion
4. game:vote_cast       -> Secret ballot vote collection
5. game:tally_votes     -> Calculate vote outcome, eliminate suspect, check if impostor caught
6. game:final_guess     -> Caught Impostor's last chance word guess
7. game:chat            -> In-game discussion chat & ML suspicion monitoring
"""
import time
import asyncio
import logging
from typing import Optional
from app.socket.server import sio
from app.game.room_manager import room_manager
from app.game.engine import secret_word_engine
from app.game.persistence import match_persistence
from app.game.progression import calculate_match_rewards, get_level_info, apply_authoritative_rewards
from app.api.auth import decode_access_token
from ml.word_intelligence import word_intelligence
from ml.player_behavior import player_behavior_model

logger = logging.getLogger(__name__)

# Active match state store: room_code -> match_dict
active_matches = {}

# Concurrency locks per room to prevent race conditions (late clue vs timer timeout)
_room_locks: dict[str, asyncio.Lock] = {}

# Active 60-second turn timers: room_code -> asyncio.Task
_active_turn_timers: dict[str, asyncio.Task] = {}


def _get_room_lock(room_code: str) -> asyncio.Lock:
    """Return the asyncio.Lock for a specific room."""
    if room_code not in _room_locks:
        _room_locks[room_code] = asyncio.Lock()
    return _room_locks[room_code]


def _cancel_turn_timer(room_code: str) -> None:
    """Cancel and remove the active clue timer task for a room."""
    task = _active_turn_timers.pop(room_code, None)
    if task and not task.done():
        task.cancel()
        logger.debug(f"[Timer] Cancelled turn timer for {room_code}")


# Active 20-second final-guess timers: room_code -> asyncio.Task
_active_final_guess_timers: dict[str, asyncio.Task] = {}


def _cancel_final_guess_timer(room_code: str) -> None:
    """Cancel and remove the active final-guess timer task for a room."""
    task = _active_final_guess_timers.pop(room_code, None)
    if task and not task.done():
        # Avoid cancelling the currently executing timeout task from inside itself
        if task is not asyncio.current_task():
            task.cancel()
        logger.debug(f"[Timer] Cancelled final-guess timer for {room_code}")


def cancel_all_game_timers() -> None:
    """Cancel all active turn timers and final-guess timers across all rooms during shutdown."""
    for room_code, task in list(_active_turn_timers.items()):
        if task and not task.done():
            task.cancel()
    _active_turn_timers.clear()

    for room_code, task in list(_active_final_guess_timers.items()):
        if task and not task.done():
            task.cancel()
    _active_final_guess_timers.clear()


def _start_final_guess_timer(
    room_code: str,
    expected_match_id: str,
    duration: float = 20.0
) -> Optional[asyncio.Task]:
    """
    Schedule an authoritative 20-second final-guess timeout task for the given room and match.
    Automatically cancels any prior final-guess timer for this room (only one per room).
    """
    _cancel_final_guess_timer(room_code)
    match_state = active_matches.get(room_code)
    if not match_state:
        return None

    now = time.time()
    match_state["final_guess_started_at"] = now
    match_state["final_guess_expires_at"] = now + duration
    match_state["final_guess_duration_seconds"] = duration

    async def _worker():
        try:
            await asyncio.sleep(duration)
        except asyncio.CancelledError:
            return

        async with _get_room_lock(room_code):
            # Clean up reference if this task is still the recorded one
            if _active_final_guess_timers.get(room_code) is asyncio.current_task():
                _active_final_guess_timers.pop(room_code, None)

            # 1. Recheck room exists and is active
            if room_code not in active_matches:
                return
            m_state = active_matches[room_code]

            # 2. Recheck match identity (prevent stale timeouts from older matches in same room)
            if m_state.get("match_id") != expected_match_id:
                logger.warning(
                    f"[FinalGuessTimer] Stale timer for match {expected_match_id} ignored (current match: {m_state.get('match_id')})"
                )
                return

            # 3. Recheck that phase is still final_guess
            if m_state.get("phase") != "final_guess":
                return

            # 4. Recheck that no valid guess has already been submitted
            if m_state.get("final_guess_submitted", False):
                return

            # 5. Recheck that match is not abandoned
            if m_state.get("abandoned", False):
                return

            logger.info(
                f"[FinalGuessTimer] Caught Impostor timed out in {room_code} for match {expected_match_id}. Finalizing with Innocents victory."
            )

            # Mark submitted before calling finalizer to block concurrent client submissions
            m_state["final_guess_submitted"] = True

            timeout_guess_data = {
                "guess": "[Timed Out]",
                "is_correct": False,
                "winner": "innocents",
                "win_reason": "The Impostor ran out of time to guess the secret word!",
                "timed_out": True,
            }

            try:
                await _finalize_match_core(
                    room_code,
                    winner="innocents",
                    win_reason="The Impostor ran out of time to guess the secret word!",
                    guess_data=timeout_guess_data,
                )
            except Exception as e:
                logger.error(
                    f"[FinalGuessTimer] Error finalizing match on timeout for {room_code}: {e}",
                    exc_info=True,
                )

    task = asyncio.create_task(_worker())
    _active_final_guess_timers[room_code] = task
    return task


def _sanitize_players_for_persistence(players: list[dict]) -> list[dict]:
    """
    Strips out runtime session progression (xp, coins, level) before saving to database.
    Guarantees that no progression is persisted in database JSON.
    """
    clean = []
    for p in players:
        clean_p = {k: v for k, v in p.items() if k != "progression"}
        clean.append(clean_p)
    return clean


async def _finalize_match_core(
    room_code: str,
    winner: str,
    win_reason: str,
    guess_data: Optional[dict] = None
) -> dict:
    """
    Core authoritative match finalizer.
    MUST be called by an event handler that already holds _get_room_lock(room_code).
    Guarantees:
    - Zero reentrancy deadlock.
    - Exactly-once reward calculation & in-memory progression update.
    - Independent, safe retry of broadcast delivery without recalculating rewards.
    - Safe role assignment resolution with strict exclusion of unverified players.
    - Excludes bots from progression.
    - Omission of progression data in persistence payload.
    """
    match_state = active_matches.get(room_code)
    if not match_state:
        return {}

    match_id = match_state.get("match_id", "match_unknown")
    _cancel_turn_timer(room_code)
    _cancel_final_guess_timer(room_code)

    # 1. Authoritative Reward Calculation (Runs Exactly Once)
    if not match_state.get("rewards_calculated"):
        winning_team = "innocent" if winner == "innocents" else "impostor"
        rewards_by_key = {}

        room = room_manager.get_room(room_code)
        players_map = room.get("players", {}) if room else {}

        verified_rewards: list[dict] = []
        authoritative_requests: list[dict] = []

        for stable_player_key, player in players_map.items():
            # Strictly exclude bots from progression
            if player.get("is_bot", False):
                continue

            # Safe lookup for role assignment
            assignment = None
            if stable_player_key in match_state.get("player_assignments", {}):
                assignment = match_state["player_assignments"][stable_player_key]
            elif player.get("sid") and player["sid"] in match_state.get("player_assignments", {}):
                assignment = match_state["player_assignments"][player["sid"]]
            elif player.get("user_id"):
                for a in match_state.get("player_assignments", {}).values():
                    if a.get("user_id") == player["user_id"]:
                        assignment = a
                        break

            # If human player's assignment cannot be verified, exclude from rewards safely
            if not assignment or not assignment.get("role") or not assignment.get("team"):
                logger.warning(
                    f"[Finalization] Unverified seat excluded from rewards: {player.get('username')} "
                    f"(key={stable_player_key}, sid={player.get('sid')}) in room {room_code}"
                )
                continue

            player_role = assignment["role"]
            player_team = assignment["team"]
            was_impostor = bool(assignment.get("is_impostor", False))
            won = (player_team == winning_team)
            guessed_word = bool(guess_data and guess_data.get("is_correct") and was_impostor)

            reward = calculate_match_rewards(
                won=won,
                role=player_role,
                was_impostor=was_impostor,
                guessed_word_correctly=guessed_word,
                rounds_survived=0  # Survival bonus omitted for Stage 2
            )

            verified_rewards.append({
                "stable_player_key": stable_player_key,
                "player": player,
                "reward": reward,
                "user_id": player.get("user_id"),
            })

            authoritative_requests.append({
                "user_id": player.get("user_id"),
                "is_bot": False,
                "xp_earned": reward["xp_earned"],
                "coins_earned": reward["coins_earned"],
            })

        # Match validity check for persistence
        is_valid_match = (
            bool(winner)
            and winner != "none"
            and not match_state.get("abandoned", False)
            and "abandoned" not in str(win_reason).lower()
            and not match_id.startswith("match_unknown")
        )

        persisted_updates = {}
        eligible_user_count = sum(1 for req in authoritative_requests if req.get("user_id"))

        # Authoritatively persist rewards to database accounts if match is valid and has eligible users
        if is_valid_match and eligible_user_count > 0:
            try:
                persisted_updates = await apply_authoritative_rewards(
                    match_id=match_id,
                    player_rewards=authoritative_requests,
                    is_valid_match=is_valid_match,
                )
            except Exception as e:
                logger.error(
                    f"[Finalization] Database persistence FAILED for match {match_id}: {e}",
                    exc_info=True,
                )
                # SEC-02: Do not mark rewards calculated or emit broadcast on DB failure. Re-raise for safe retry.
                raise

        for entry in verified_rewards:
            stable_player_key = entry["stable_player_key"]
            player = entry["player"]
            reward = entry["reward"]
            u_id = entry["user_id"]

            prog = player.setdefault("progression", {"xp": 0, "coins": 0, "level": 1})
            if u_id and u_id in persisted_updates:
                authoritative_info = persisted_updates[u_id]
                prog["xp"] = authoritative_info["new_total_xp"]
                prog["coins"] = authoritative_info["new_total_coins"]
                prog["level"] = authoritative_info["new_level"]
                lvl_info = get_level_info(prog["xp"])
            else:
                prog["xp"] += reward["xp_earned"]
                prog["coins"] += reward["coins_earned"]
                lvl_info = get_level_info(prog["xp"])
                prog["level"] = lvl_info["level"]

            reward_entry = {
                **reward,
                "match_id": match_id,
                "player_key": stable_player_key,
                "current_sid": player.get("sid"),
                "user_id": u_id,
                "new_total_xp": prog["xp"],
                "new_total_coins": prog["coins"],
                "level_info": lvl_info,
            }
            rewards_by_key[stable_player_key] = reward_entry
            if player.get("sid"):
                rewards_by_key[player["sid"]] = reward_entry

        # Commit match state flags atomically in-memory
        match_state["rewards_calculated"] = True
        match_state["phase"] = "results"
        match_state["winner"] = winner
        match_state["win_reason"] = win_reason
        match_state["cached_results"] = {
            "match_id": match_id,
            "winner": winner,
            "win_reason": win_reason,
            "secret_word": match_state.get("secret_word"),
            "undercover_word": match_state.get("undercover_word"),
            "player_assignments": match_state.get("player_assignments", {}),
            "rewards": rewards_by_key,
            "guess_data": guess_data
        }
        match_state["broadcast_emitted"] = False

        # Save match state with progression stripped out from serialized player JSON
        all_players = room_manager.get_players(room_code)
        clean_players = _sanitize_players_for_persistence(all_players)
        await match_persistence.save_match_state(room_code, match_state, clean_players)

    # 2. Independent Broadcast Delivery / Retry
    cached = match_state["cached_results"]
    if not match_state.get("broadcast_emitted"):
        try:
            await sio.emit("game:match_ended", cached, room=room_code)
            match_state["broadcast_emitted"] = True
            logger.info(f"[Finalization] Successfully emitted game:match_ended for match {match_id} in {room_code}")
        except Exception as e:
            logger.error(f"[Finalization] Broadcast failed for match {match_id} in {room_code}: {e}")
            match_state["broadcast_emitted"] = False

    return cached


def _start_turn_timer(room_code: str, expected_sid: str, expected_round: int, duration: float = 60.0) -> None:
    """
    Schedule an authoritative 60-second turn timeout task for the given room and turn.
    Automatically cancels any prior timer for this room.
    """
    _cancel_turn_timer(room_code)
    _cancel_final_guess_timer(room_code)
    match_state = active_matches.get(room_code)
    if not match_state:
        return

    now = time.time()
    match_state["turn_started_at"] = now
    match_state["turn_expires_at"] = now + duration
    match_state["turn_duration_seconds"] = duration

    async def _worker():
        try:
            await asyncio.sleep(duration)
        except asyncio.CancelledError:
            return

        async with _get_room_lock(room_code):
            if room_code not in active_matches:
                return
            m_state = active_matches[room_code]
            if m_state.get("phase") != "clues":
                return
            if m_state.get("current_round") != expected_round:
                return
            current_idx = m_state.get("current_turn_index", 0)
            turn_order = m_state.get("turn_order", [])
            if current_idx >= len(turn_order) or turn_order[current_idx] != expected_sid:
                return

            logger.info(f"[TurnTimer] Turn timed out for {expected_sid} in {room_code} (round {expected_round}). Auto-advancing.")
            result = secret_word_engine.submit_clue(m_state, expected_sid, "[Timed Out]")
            if not result.get("success"):
                logger.error(f"[TurnTimer] Failed to auto-submit timeout clue: {result.get('error')}")
                return

            player = room_manager.get_player(expected_sid)
            player_name = player["username"] if player else "Unknown"

            # Broadcast timeout clue indicator to room
            await sio.emit("game:clue_broadcast", {
                "sid": expected_sid,
                "username": player_name,
                "clue": "[Timed Out - Skipped]",
                "round": expected_round,
                "evaluation": result["clue_entry"]["evaluation"],
                "timed_out": True
            }, room=room_code)

            await match_persistence.save_match_state(room_code, m_state, room_manager.get_players(room_code))

            if result["next_phase"] == "discussion":
                _cancel_turn_timer(room_code)
                _cancel_final_guess_timer(room_code)
                await sio.emit("game:phase_changed", {
                    "phase": "discussion",
                    "duration_seconds": 45,
                    "all_clues": m_state["clues"]
                }, room=room_code)
            else:
                next_sid = result["next_turn_sid"]
                _start_turn_timer(room_code, next_sid, m_state["current_round"], 60.0)
                await sio.emit("game:turn_advanced", {
                    "current_turn_sid": next_sid,
                    "current_round": m_state["current_round"],
                    "duration_seconds": 60,
                    "turn_started_at": m_state["turn_started_at"],
                    "turn_expires_at": m_state["turn_expires_at"]
                }, room=room_code)

    _active_turn_timers[room_code] = asyncio.create_task(_worker())
    logger.info(f"[Timer] Started 60s clue timer for {expected_sid} in {room_code}")


@sio.event
async def game_start(sid: str, data: dict):
    """
    Host triggers game start from lobby.
    Initializes match state with SecretWordEngine.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code:
        await sio.emit("error", {"message": "You are not in a room"}, to=sid)
        return

    if not room_manager.is_host(sid, room_code):
        await sio.emit("error", {"message": "Only the host can start the game"}, to=sid)
        return

    players = room_manager.get_players(room_code)
    if len(players) < 2:
        await sio.emit("error", {"message": "Need at least 2 players to start"}, to=sid)
        return

    # Extract match settings from host or room config
    mode = data.get("mode", "classic")
    category = data.get("category", "Random")
    difficulty = data.get("difficulty", "medium")
    impostor_count = data.get("impostor_count")
    if impostor_count is not None:
        try:
            impostor_count = int(impostor_count)
        except (ValueError, TypeError):
            impostor_count = None
    clue_rounds = int(data.get("clue_rounds", 2))
    enable_chaos = bool(data.get("enable_chaos", False))

    # Initialize authoritative match state
    match_state = secret_word_engine.setup_match(
        players=players,
        mode=mode,
        category=category,
        difficulty=difficulty,
        impostor_count=impostor_count,
        clue_rounds=clue_rounds,
        enable_chaos=enable_chaos
    )
    match_state["role_acks"] = set()
    active_matches[room_code] = match_state

    # 1. Privately distribute secret words and roles (NEVER broadcast to whole room!)
    for player in players:
        p_sid = player["sid"]
        assignment = match_state["player_assignments"].get(p_sid, {})
        await sio.emit("game:role_assigned", {
            "role": assignment.get("role", "civilian"),
            "card_title": assignment.get("card_title", "Citizen"),
            "secret_word": assignment.get("secret_word"),
            "description": assignment.get("description", ""),
            "is_impostor": assignment.get("is_impostor", False)
        }, to=p_sid)

    # 2. Persist authoritative match state to PostgreSQL
    await match_persistence.save_match_state(room_code, match_state, players)

    # 3. Broadcast public match start info to the room
    await sio.emit("game:match_started", {
        "mode": match_state["mode"],
        "category": match_state["category"],
        "total_rounds": match_state["total_rounds"],
        "current_round": match_state["current_round"],
        "turn_order": match_state["turn_order"],
        "current_turn_sid": match_state["turn_order"][0],
        "chaos_card": match_state.get("active_chaos_card"),
        "phase": "role_reveal",
        "duration_seconds": 12,
        "players": players,
    }, room=room_code)

    logger.info(f"Match started in room {room_code} (Mode: {mode}, Secret Word generated)")


@sio.event
async def game_request_sync(sid: str, data: dict = None):
    """
    Syncs private role and current match state upon page load or reconnection.
    Authenticates reconnects using token to ensure seats cannot be spoofed.
    """
    data = data or {}
    room_code = room_manager.get_room_for_socket(sid) or data.get("room_code", "").upper().strip()
    user_id = data.get("user_id")
    username = data.get("username")
    token = data.get("token")

    if not room_code:
        await sio.emit("game:session_invalid", {"message": "No room specified"}, to=sid)
        return

    # If active match is not in memory, attempt restoration from persistent PostgreSQL
    if room_code not in active_matches:
        recovered = await match_persistence.load_match_state(room_code)
        if recovered and recovered.get("match_state") and recovered["match_state"].get("phase") not in ("ended", "finished"):
            active_matches[room_code] = recovered["match_state"]
            r_data = recovered["room_data"]
            if not room_manager.room_exists(room_code):
                room_manager.create_room(
                    host_sid=r_data.get("host_sid", sid),
                    room_code=room_code
                )
            for p in r_data.get("players", []):
                p_uid = p.get("user_id")
                old_sid = p.get("sid", f"saved_{p_uid}")
                room_manager.add_socket_to_room(
                    room_code=room_code,
                    sid=old_sid,
                    user_id=p_uid,
                    username=p.get("username", "Player"),
                    avatar=p.get("avatar", "🧑"),
                    is_bot=p.get("is_bot", False),
                )
            logger.info(f"[MatchSync] Reconstituted active match {room_code} from persistent storage")
        else:
            await sio.emit("game:session_invalid", {"message": "Game session expired or concluded."}, to=sid)
            return

    match_state = active_matches[room_code]

    # Ensure this socket is part of the Socket.IO room
    await sio.enter_room(sid, room_code)

    # Secure reconnect verification:
    # If claiming a seat with user_id, ensure valid token matching sub
    if user_id and token:
        payload = decode_access_token(token)
        if not payload or payload.get("sub") != user_id:
            logger.warning(f"[MatchSync] Token mismatch for user_id={user_id} in {room_code}")
            user_id = None  # Invalidate seat claim

    players = room_manager.get_players(room_code)

    # Locate player's assignment: match by sid or user_id (not display name alone!)
    assignment = match_state["player_assignments"].get(sid)
    old_matching_sid = None

    if not assignment and user_id:
        for p_sid, a in list(match_state["player_assignments"].items()):
            if a.get("user_id") == user_id or any(p.get("sid") == p_sid and p.get("user_id") == user_id for p in players):
                assignment = a
                old_matching_sid = p_sid
                break

        if assignment:
            # Map new socket ID to this assignment
            match_state["player_assignments"][sid] = assignment
            if old_matching_sid and old_matching_sid in match_state.get("turn_order", []):
                match_state["turn_order"] = [sid if x == old_matching_sid else x for x in match_state["turn_order"]]

            # Update player entry in room_manager
            room_manager.add_socket_to_room(
                room_code=room_code,
                sid=sid,
                user_id=user_id,
                username=assignment.get("username", username or "Player"),
            )

            clean_players = _sanitize_players_for_persistence(room_manager.get_players(room_code))
            await match_persistence.save_match_state(room_code, match_state, clean_players)

    # Privately emit role to this player only
    if assignment:
        await sio.emit("game:role_assigned", {
            "role": assignment.get("role", "civilian"),
            "card_title": assignment.get("card_title", "Citizen"),
            "secret_word": assignment.get("secret_word"),
            "description": assignment.get("description", ""),
            "is_impostor": assignment.get("is_impostor", False)
        }, to=sid)

    turn_idx = match_state.get("current_turn_index", 0)
    current_sid = match_state["turn_order"][turn_idx] if match_state["turn_order"] and turn_idx < len(match_state["turn_order"]) else None

    # Calculate remaining timer duration if in clues phase
    turn_expires_at = match_state.get("turn_expires_at")
    remaining_sec = max(0, int(turn_expires_at - time.time())) if turn_expires_at else 60

    # Emit public HUD and match state to the syncing player
    await sio.emit("game:match_started", {
        "mode": match_state["mode"],
        "category": match_state["category"],
        "total_rounds": match_state["total_rounds"],
        "current_round": match_state["current_round"],
        "turn_order": match_state["turn_order"],
        "current_turn_sid": current_sid,
        "chaos_card": match_state.get("active_chaos_card"),
        "phase": match_state.get("phase", "role_reveal"),
        "duration_seconds": 60 if match_state.get("phase") == "clues" else 12,
        "remaining_seconds": remaining_sec,
        "turn_started_at": match_state.get("turn_started_at"),
        "turn_expires_at": turn_expires_at,
        "players": room_manager.get_players(room_code),
        "clues": match_state.get("clues", []),
    }, to=sid)

    # If the match has concluded and results are cached, unicast game:match_ended to the syncing player
    if match_state.get("phase") == "results" and match_state.get("cached_results"):
        await sio.emit("game:match_ended", match_state["cached_results"], to=sid)


@sio.event
async def game_role_acknowledged(sid: str, data: dict = None):
    """
    Player acknowledges their private role reveal card.
    Once all players acknowledge, transitions directly to 60-second Clue phase.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code or room_code not in active_matches:
        return

    match_state = active_matches[room_code]
    if "role_acks" not in match_state:
        match_state["role_acks"] = set()
    match_state["role_acks"].add(sid)

    players = room_manager.get_players(room_code)
    # Broadcast acknowledgment progress
    await sio.emit("game:role_ack_progress", {
        "acks": len(match_state["role_acks"]),
        "total": len(players)
    }, room=room_code)

    if len(match_state["role_acks"]) >= len(players):
        match_state["phase"] = "clues"
        first_turn_sid = match_state["turn_order"][0]

        # Start authoritative 60s timer for the first player
        _start_turn_timer(room_code, first_turn_sid, match_state["current_round"], duration=60.0)

        await match_persistence.save_match_state(room_code, match_state, players)
        await sio.emit("game:phase_changed", {
            "phase": "clues",
            "current_turn_sid": first_turn_sid,
            "current_round": match_state["current_round"],
            "total_rounds": match_state["total_rounds"],
            "duration_seconds": 60,
            "turn_started_at": match_state.get("turn_started_at"),
            "turn_expires_at": match_state.get("turn_expires_at"),
        }, room=room_code)


@sio.event
async def game_typing(sid: str, data: dict):
    """
    Live typing indicator broadcast without revealing private draft text.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code:
        return

    player = room_manager.get_player(sid)
    username = player["username"] if player else "Player"
    is_typing = bool(data.get("is_typing", True))

    await sio.emit("game:player_typing", {
        "sid": sid,
        "username": username,
        "is_typing": is_typing
    }, room=room_code, skip_sid=sid)


@sio.event
async def game_clue_submit(sid: str, data: dict):
    """
    Player submits a clue on their turn.
    Protected by per-room lock to prevent duplicate turn advances if timer fires simultaneously.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code or room_code not in active_matches:
        await sio.emit("error", {"message": "No active match found"}, to=sid)
        return

    async with _get_room_lock(room_code):
        match_state = active_matches.get(room_code)
        if not match_state:
            return

        clue_text = str(data.get("clue", "")).strip()
        if not clue_text:
            await sio.emit("error", {"message": "Clue cannot be empty"}, to=sid)
            return

        # Attempt to record clue in engine
        result = secret_word_engine.submit_clue(match_state, sid, clue_text)
        if not result.get("success"):
            await sio.emit("error", {"message": result.get("error", "Invalid clue submission")}, to=sid)
            return

        # Turn successfully advanced by clue submission: cancel current timer
        _cancel_turn_timer(room_code)
        _cancel_final_guess_timer(room_code)

        player = room_manager.get_player(sid)
        player_name = player["username"] if player else "Unknown"

        # Broadcast the new clue to all players in the room
        await sio.emit("game:clue_broadcast", {
            "sid": sid,
            "username": player_name,
            "clue": clue_text,
            "round": match_state["current_round"],
            "evaluation": result["clue_entry"]["evaluation"]
        }, room=room_code)

        # Persist updated match state with latest clue
        await match_persistence.save_match_state(room_code, match_state, room_manager.get_players(room_code))

        # Check next phase
        if result["next_phase"] == "discussion":
            await sio.emit("game:phase_changed", {
                "phase": "discussion",
                "duration_seconds": 45,
                "all_clues": match_state["clues"]
            }, room=room_code)
        else:
            next_turn_sid = result["next_turn_sid"]
            # Start authoritative 60-second timer for the next turn
            _start_turn_timer(room_code, next_turn_sid, match_state["current_round"], duration=60.0)

            await sio.emit("game:turn_advanced", {
                "current_turn_sid": next_turn_sid,
                "current_round": match_state["current_round"],
                "duration_seconds": 60,
                "turn_started_at": match_state.get("turn_started_at"),
                "turn_expires_at": match_state.get("turn_expires_at")
            }, room=room_code)


@sio.event
async def game_start_vote(sid: str, data: dict):
    """
    Transition room to voting phase.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code or room_code not in active_matches:
        return

    _cancel_turn_timer(room_code)
    _cancel_final_guess_timer(room_code)
    match_state = active_matches[room_code]
    match_state["phase"] = "voting"
    match_state["votes"] = {}

    await match_persistence.save_match_state(room_code, match_state, room_manager.get_players(room_code))

    await sio.emit("game:phase_changed", {
        "phase": "voting",
        "duration_seconds": 30
    }, room=room_code)


@sio.event
async def game_vote_cast(sid: str, data: dict):
    """
    A player secretly casts their vote for a suspected impostor.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code or room_code not in active_matches:
        return

    match_state = active_matches[room_code]
    target_sid = data.get("target_sid")

    if not target_sid or target_sid == sid:
        return

    # Record secret vote
    match_state["votes"][sid] = target_sid
    await match_persistence.save_match_state(room_code, match_state, room_manager.get_players(room_code))

    # Acknowledge to voter
    await sio.emit("game:vote_recorded", {"target_sid": target_sid}, to=sid)

    players = room_manager.get_players(room_code)
    alive_players = [p for p in players if match_state["player_assignments"].get(p["sid"], {}).get("is_alive", True)]

    # Notify room of voting progress (WITHOUT revealing who voted for whom)
    await sio.emit("game:vote_progress", {
        "total_votes_cast": len(match_state["votes"]),
        "total_voters_needed": len(alive_players)
    }, room=room_code)

    # If all alive players voted, automatically tally
    if len(match_state["votes"]) >= len(alive_players):
        await _resolve_vote_tally(room_code)


async def _resolve_vote_tally(room_code: str):
    """
    Tallies votes and broadcasts elimination results.
    Protected by room lock.
    """
    async with _get_room_lock(room_code):
        if room_code not in active_matches:
            return

        _cancel_turn_timer(room_code)
        _cancel_final_guess_timer(room_code)
        match_state = active_matches[room_code]
        tally = secret_word_engine.tally_votes(match_state, match_state["votes"])

        eliminated_sid = tally["eliminated_sid"]

        if eliminated_sid and eliminated_sid in match_state.get("player_assignments", {}):
            match_state["player_assignments"][eliminated_sid]["is_alive"] = False

        await sio.emit("game:vote_reveal", {
            "eliminated_sid": eliminated_sid,
            "is_tie": tally.get("is_tie", False),
            "was_impostor": tally.get("was_impostor", False),
            "allow_final_guess": tally.get("allow_final_guess", False),
            "counts": tally.get("counts", {})
        }, room=room_code)

        if tally.get("allow_final_guess"):
            # Impostor caught! Give them 20 seconds for the final guess
            match_state["phase"] = "final_guess"
            match_state["caught_impostor_sid"] = eliminated_sid
            match_state["final_guess_submitted"] = False
            all_players = room_manager.get_players(room_code)
            clean_players = _sanitize_players_for_persistence(all_players)
            await match_persistence.save_match_state(room_code, match_state, clean_players)

            # Start authoritative 20-second final-guess timeout
            _start_final_guess_timer(
                room_code=room_code,
                expected_match_id=match_state.get("match_id", "unknown"),
                duration=20.0,
            )

            await sio.emit("game:phase_changed", {
                "phase": "final_guess",
                "impostor_sid": eliminated_sid,
                "duration_seconds": 20
            }, room=room_code)
        else:
            # Innocents eliminated or no final guess
            winner = "impostor" if not tally.get("was_impostor") else "innocents"
            win_reason = (
                "The Impostor was identified and eliminated!"
                if tally.get("was_impostor")
                else "Innocent citizens were eliminated by misvote!"
            )
            await _finalize_match_core(room_code, winner=winner, win_reason=win_reason)


@sio.event
async def game_final_guess(sid: str, data: dict):
    """
    Caught Impostor submits their last-chance word guess.
    Protected by room lock and strict phase & role validation (SEC-01).
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code or room_code not in active_matches:
        return

    async with _get_room_lock(room_code):
        match_state = active_matches[room_code]

        # 1. Require the match to be in the exact final_guess phase
        if match_state.get("phase") != "final_guess":
            logger.warning(
                f"[Security] Rejected out-of-phase final guess from {sid} in room {room_code} "
                f"(current phase: {match_state.get('phase')})"
            )
            await sio.emit("error", {"message": "Final guess is only allowed during the final guess phase"}, to=sid)
            return

        # 2. Reject duplicate submissions
        if match_state.get("final_guess_submitted"):
            logger.warning(
                f"[Security] Rejected repeated final guess from {sid} in room {room_code}"
            )
            return

        # 3. Verify requesting socket belongs to the caught/eliminated Impostor
        caught_sid = match_state.get("caught_impostor_sid")
        calling_player = room_manager.get_player(sid)

        assignment = match_state.get("player_assignments", {}).get(sid)
        if not assignment and calling_player and calling_player.get("user_id"):
            for a in match_state.get("player_assignments", {}).values():
                if a.get("user_id") == calling_player["user_id"]:
                    assignment = a
                    break

        is_impostor = bool(assignment and (assignment.get("role") == "impostor" or assignment.get("is_impostor")))
        is_authorized = (sid == caught_sid) or (caught_sid is None and is_impostor and not assignment.get("is_alive", True))

        if not is_impostor or not is_authorized:
            logger.warning(
                f"[Security] Rejected unauthorized final guess from {sid} in room {room_code} "
                f"(is_impostor={is_impostor}, caught_sid={caught_sid})"
            )
            await sio.emit("error", {"message": "Only the eliminated impostor can submit the final guess"}, to=sid)
            return

        # Authorized final guess: mark submitted and cancel timer
        match_state["final_guess_submitted"] = True
        _cancel_turn_timer(room_code)
        _cancel_final_guess_timer(room_code)

        guess = str(data.get("guess", "")).strip()
        result = secret_word_engine.resolve_final_guess(match_state, guess)

        # Finalize match and distribute rewards
        await _finalize_match_core(
            room_code,
            winner=result["winner"],
            win_reason=result["win_reason"],
            guess_data=result
        )


@sio.event
async def game_chat(sid: str, data: dict):
    """
    In-game discussion chat with ML Suspicion Score evaluation.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code:
        return

    player = room_manager.get_player(sid)
    if not player:
        return

    message = str(data.get("message", "")).strip()[:300]
    if not message:
        return

    match_state = active_matches.get(room_code)
    suspicion_delta = 0.0

    if match_state:
        sim = word_intelligence.compute_similarity(message, match_state["secret_word"])
        suspicion_delta = player_behavior_model.predict_suspicion_score(
            avg_semantic_similarity=sim,
            avg_latency_sec=15.0,
            voted_with_majority=True,
            accusation_rate=0.3
        )
        player["suspicion_score"] = suspicion_delta

    await sio.emit("game:chat_message", {
        "sid": sid,
        "username": player["username"],
        "avatar": player["avatar"],
        "message": message,
        "suspicion_score": suspicion_delta
    }, room=room_code)


@sio.event
async def game_return_to_lobby(sid: str, data: dict = None):
    """
    Host triggers return from match results back to the pre-game lobby.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code:
        return

    _cancel_turn_timer(room_code)
    _cancel_final_guess_timer(room_code)

    # Reset player ready flags
    players = room_manager.get_players(room_code)
    for p in players:
        p["is_ready"] = False
        p["is_alive"] = True
        p["suspicion_score"] = 0.0

    active_matches.pop(room_code, None)
    room = room_manager.get_room(room_code)
    host_sid = room.get("host_sid") if room else None
    await match_persistence.save_lobby_state(room_code, host_sid, _sanitize_players_for_persistence(players))
    await sio.emit("game:returned_to_lobby", {"room_code": room_code}, room=room_code)


async def handle_player_dropped_in_game(room_code: str, sid: str, player_key: str) -> None:
    """
    Called when a player's 75s reconnection grace period expires during an active match.
    Marks the player dead and advances turn if it was their turn.
    """
    async with _get_room_lock(room_code):
        if room_code not in active_matches:
            return

        match_state = active_matches[room_code]
        # Mark player eliminated in assignments
        if sid in match_state.get("player_assignments", {}):
            match_state["player_assignments"][sid]["is_alive"] = False

        # Check team survival
        assignments = match_state.get("player_assignments", {})
        impostors_alive = any(
            a.get("role") == "impostor" and a.get("is_alive", True)
            for a in assignments.values()
        )
        innocents_alive = any(
            a.get("role") == "innocent" and a.get("is_alive", True)
            for a in assignments.values()
        )

        if not impostors_alive and innocents_alive:
            logger.info(f"[InGameDrop] All impostors eliminated/disconnected in {room_code}. Innocents win.")
            await _finalize_match_core(room_code, winner="innocents", win_reason="All impostors disconnected.")
            return
        elif not innocents_alive and impostors_alive:
            logger.info(f"[InGameDrop] All innocents eliminated/disconnected in {room_code}. Impostors win.")
            await _finalize_match_core(room_code, winner="impostor", win_reason="All innocents disconnected.")
            return

        # If it is currently this player's turn to speak in clues phase, auto-advance
        if match_state.get("phase") == "clues":
            current_idx = match_state.get("current_turn_index", 0)
            turn_order = match_state.get("turn_order", [])
            if current_idx < len(turn_order) and turn_order[current_idx] == sid:
                logger.info(f"[InGameDrop] Dropped player {sid} was on active turn. Auto-advancing.")
                _cancel_turn_timer(room_code)
                _cancel_final_guess_timer(room_code)
                result = secret_word_engine.submit_clue(match_state, sid, "[Disconnected]")
                if result.get("success"):
                    await sio.emit("game:clue_broadcast", {
                        "sid": sid,
                        "username": "Disconnected Player",
                        "clue": "[Disconnected - Turn Skipped]",
                        "round": match_state["current_round"],
                        "evaluation": result["clue_entry"]["evaluation"],
                        "timed_out": True
                    }, room=room_code)

                    if result["next_phase"] == "discussion":
                        await sio.emit("game:phase_changed", {
                            "phase": "discussion",
                            "duration_seconds": 45,
                            "all_clues": match_state["clues"]
                        }, room=room_code)
                    else:
                        next_turn_sid = result["next_turn_sid"]
                        _start_turn_timer(room_code, next_turn_sid, match_state["current_round"], 60.0)
                        await sio.emit("game:turn_advanced", {
                            "current_turn_sid": next_turn_sid,
                            "current_round": match_state["current_round"],
                            "duration_seconds": 60,
                            "turn_started_at": match_state.get("turn_started_at"),
                            "turn_expires_at": match_state.get("turn_expires_at")
                        }, room=room_code)

        # Save match state with sanitized players
        raw_players = room_manager.get_players(room_code)
        await match_persistence.save_match_state(room_code, match_state, _sanitize_players_for_persistence(raw_players))
