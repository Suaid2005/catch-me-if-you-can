"""
app/socket/game_events.py
──────────────────────────
Socket.IO handlers for in-game real-time match events.
Implements the full lifecycle for online multiplayer:
1. game:start           -> Initialize match with SecretWordEngine, assign private roles/words
2. game:clue_submit     -> Validate player turn, record clue, semantic evaluation, advance turn
3. game:discussion      -> Transition from clue phase to discussion
4. game:vote_cast       -> Secret ballot vote collection
5. game:tally_votes     -> Calculate vote outcome, eliminate suspect, check if impostor caught
6. game:final_guess     -> Caught Impostor's last chance word guess
7. game:chat            -> In-game discussion chat & ML suspicion monitoring
"""
import logging
from app.socket.server import sio
from app.game.room_manager import room_manager
from app.game.engine import secret_word_engine
from app.game.persistence import match_persistence
from ml.word_intelligence import word_intelligence
from ml.player_behavior import player_behavior_model

logger = logging.getLogger(__name__)

# Active match state store: room_code -> match_dict
active_matches = {}

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
    if len(players) < 3:
        # For testing allow 2, otherwise 3
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
            "secret_word": assignment.get("secret_word"), # None for Impostor!
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
    Supports complete state recovery across server restarts / Render dyno cold-starts.
    """
    data = data or {}
    room_code = room_manager.get_room_for_socket(sid) or data.get("room_code", "").upper().strip()
    user_id = data.get("user_id")
    username = data.get("username")

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
                old_sid = p.get("sid", "saved_" + str(p.get("user_id", "")))
                room_manager.add_socket_to_room(
                    room_code=room_code,
                    sid=old_sid,
                    user_id=p.get("user_id"),
                    username=p.get("username", "Player"),
                    avatar=p.get("avatar", "🧑"),
                    is_bot=p.get("is_bot", False),
                )
            logger.info(f"[MatchSync] Reconstituted active match {room_code} from persistent PostgreSQL")
        else:
            await sio.emit("game:session_invalid", {"message": "Game session expired or concluded."}, to=sid)
            return

    match_state = active_matches[room_code]

    # Ensure this socket is part of the Socket.IO room
    await sio.enter_room(sid, room_code)
    room_manager._socket_to_room[sid] = room_code

    players = room_manager.get_players(room_code)
    player = room_manager.get_player(sid)

    # Locate player's assignment: match by sid, user_id, or username
    assignment = match_state["player_assignments"].get(sid)
    old_matching_sid = None

    if not assignment:
        for p_sid, a in list(match_state["player_assignments"].items()):
            # Check by user_id
            if user_id and (a.get("user_id") == user_id or any(p.get("sid") == p_sid and p.get("user_id") == user_id for p in players)):
                assignment = a
                old_matching_sid = p_sid
                break
            # Check by username fallback
            if username and any(p.get("sid") == p_sid and p.get("username") == username for p in players):
                assignment = a
                old_matching_sid = p_sid
                break

        if assignment:
            # Map new socket ID to this assignment
            match_state["player_assignments"][sid] = assignment
            # Update turn order with new sid
            if old_matching_sid and old_matching_sid in match_state.get("turn_order", []):
                match_state["turn_order"] = [sid if x == old_matching_sid else x for x in match_state["turn_order"]]
            # Update player entry in room_manager
            room_manager.add_socket_to_room(
                room_code=room_code,
                sid=sid,
                user_id=user_id or assignment.get("user_id"),
                username=username or assignment.get("username", "Player"),
                avatar=player.get("avatar", "🧑") if player else "🧑",
            )
            # Remove stale socket reference if replaced
            if old_matching_sid and old_matching_sid != sid:
                room_manager.remove_socket_from_room(old_matching_sid)

            # Persist updated socket association
            await match_persistence.save_match_state(room_code, match_state, room_manager.get_players(room_code))

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

    # Emit public HUD and match state
    await sio.emit("game:match_started", {
        "mode": match_state["mode"],
        "category": match_state["category"],
        "total_rounds": match_state["total_rounds"],
        "current_round": match_state["current_round"],
        "turn_order": match_state["turn_order"],
        "current_turn_sid": current_sid,
        "chaos_card": match_state.get("active_chaos_card"),
        "phase": match_state.get("phase", "role_reveal"),
        "duration_seconds": 12,
        "players": room_manager.get_players(room_code),
        "clues": match_state.get("clues", []),
    }, to=sid)


@sio.event
async def game_role_acknowledged(sid: str, data: dict = None):
    """
    Player acknowledges their private role reveal card.
    Once all players acknowledge, transitions the room directly to Clue phase.
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
        await match_persistence.save_match_state(room_code, match_state, players)
        await sio.emit("game:phase_changed", {
            "phase": "clues",
            "current_turn_sid": match_state["turn_order"][0],
            "current_round": match_state["current_round"],
            "total_rounds": match_state["total_rounds"],
            "duration_seconds": 30
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
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code or room_code not in active_matches:
        await sio.emit("error", {"message": "No active match found"}, to=sid)
        return

    match_state = active_matches[room_code]
    clue_text = str(data.get("clue", "")).strip()

    if not clue_text:
        await sio.emit("error", {"message": "Clue cannot be empty"}, to=sid)
        return

    result = secret_word_engine.submit_clue(match_state, sid, clue_text)
    if not result.get("success"):
        await sio.emit("error", {"message": result.get("error", "Invalid clue submission")}, to=sid)
        return

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

    # Next turn or next phase
    if result["next_phase"] == "discussion":
        await sio.emit("game:phase_changed", {
            "phase": "discussion",
            "duration_seconds": 45,
            "all_clues": match_state["clues"]
        }, room=room_code)
    else:
        await sio.emit("game:turn_advanced", {
            "current_turn_sid": result["next_turn_sid"],
            "current_round": match_state["current_round"]
        }, room=room_code)


@sio.event
async def game_start_vote(sid: str, data: dict):
    """
    Transition room to voting phase.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code or room_code not in active_matches:
        return

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
        # Cannot vote for self or empty target
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
    """
    if room_code not in active_matches:
        return

    match_state = active_matches[room_code]
    tally = secret_word_engine.tally_votes(match_state, match_state["votes"])

    eliminated_sid = tally["eliminated_sid"]

    if eliminated_sid:
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
        await match_persistence.save_match_state(room_code, match_state, room_manager.get_players(room_code))
        await sio.emit("game:phase_changed", {
            "phase": "final_guess",
            "impostor_sid": eliminated_sid,
            "duration_seconds": 20
        }, room=room_code)
    else:
        # Innocents eliminated or no final guess
        winner = "impostor" if not tally.get("was_impostor") else "innocents"
        match_state["winner"] = winner
        match_state["phase"] = "results"
        await match_persistence.save_match_state(room_code, match_state, room_manager.get_players(room_code))

        await sio.emit("game:match_ended", {
            "winner": winner,
            "secret_word": match_state["secret_word"],
            "undercover_word": match_state.get("undercover_word"),
            "player_assignments": match_state["player_assignments"]
        }, room=room_code)


@sio.event
async def game_final_guess(sid: str, data: dict):
    """
    Caught Impostor submits their last-chance word guess.
    """
    room_code = room_manager.get_room_for_socket(sid)
    if not room_code or room_code not in active_matches:
        return

    match_state = active_matches[room_code]
    guess = str(data.get("guess", "")).strip()

    result = secret_word_engine.resolve_final_guess(match_state, guess)
    await match_persistence.save_match_state(room_code, match_state, room_manager.get_players(room_code))

    await sio.emit("game:final_guess_result", {
        "winner": result["winner"],
        "guessed_word": result["guessed_word"],
        "secret_word": result["secret_word"],
        "is_correct": result["is_correct"],
        "win_reason": result["win_reason"],
        "player_assignments": match_state["player_assignments"]
    }, room=room_code)


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
        # Calculate semantic similarity to secret word
        sim = word_intelligence.compute_similarity(message, match_state["secret_word"])
        # Evaluate suspicion probability using ML behavior model
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

    # Reset player ready flags
    players = room_manager.get_players(room_code)
    for p in players:
        p["is_ready"] = False
        p["is_alive"] = True
        p["suspicion_score"] = 0.0

    active_matches.pop(room_code, None)
    room = room_manager.get_room(room_code)
    host_sid = room.get("host_sid") if room else None
    await match_persistence.save_lobby_state(room_code, host_sid, players)
    await sio.emit("game:returned_to_lobby", {"room_code": room_code}, room=room_code)
