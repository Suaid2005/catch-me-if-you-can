"""
app/game/engine.py
───────────────────
Universal State Machine & Rules Engine for 'Catch Me If You Can?'.
Implements:
1. Secret-Word Impostor distribution
2. Support for 9 Game Modes:
   - classic, double_trouble, undercover, mr_white, ai_takeover,
     team_battle, mystery_twist, daily_challenge, practice_arena
3. Turn order generation & round tracking
4. Secret voting and tie-break logic
5. Impostor final word-guess opportunity
6. Multi-team score & reward calculation
"""
import random
import logging
import uuid
from typing import Dict, Any, List, Optional, Tuple

from ml.word_intelligence import word_intelligence
from app.game.chaos_cards import draw_chaos_card

logger = logging.getLogger(__name__)

ROLES = {
    "impostor": {
        "role_key": "impostor",
        "name": "The Impostor",
        "team": "impostor",
        "description": "Blend in, mislead players, and avoid detection."
    },
    "detective": {
        "role_key": "detective",
        "name": "Detective",
        "team": "innocent",
        "description": "Investigate clues and discover the impostor."
    },
    "informant": {
        "role_key": "informant",
        "name": "Informant",
        "team": "innocent",
        "description": "Help innocents identify the impostor."
    },
    "civilian": {
        "role_key": "civilian",
        "name": "Civilian",
        "team": "innocent",
        "description": "Participate in discussion and vote wisely."
    }
}


class GameEngine:
    """Legacy interface support for deduction room tests."""

    def assign_roles(self, players: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        n = len(players)
        assignments = {}
        shuffled = list(players)
        random.shuffle(shuffled)

        num_impostors = 2 if n >= 7 else 1
        num_detectives = 1 if n >= 3 else 0
        num_informants = 1 if n >= 5 else 0

        roles_pool = (
            ["impostor"] * num_impostors +
            ["detective"] * num_detectives +
            ["informant"] * num_informants
        )
        while len(roles_pool) < n:
            roles_pool.append("civilian")
        roles_pool = roles_pool[:n]

        for i, p in enumerate(shuffled):
            role_key = roles_pool[i]
            assignments[p["sid"]] = dict(ROLES[role_key])

        return assignments

    def check_win_condition(
        self,
        players: List[Dict[str, Any]],
        eliminated_roles: Optional[List[str]] = None
    ) -> Optional[str]:
        if eliminated_roles and "impostor" in eliminated_roles:
            return "innocent"

        impostors = [p for p in players if p.get("role_key") == "impostor" and p.get("is_alive", True)]
        innocents = [p for p in players if p.get("role_key") != "impostor" and p.get("is_alive", True)]

        if len(impostors) >= len(innocents) and len(impostors) > 0:
            return "impostor"
        return None

    def get_phase_duration(self, phase: str) -> int:
        durations = {
            "briefing": 10,
            "gameplay": 60,
            "voting": 30,
            "reveal": 10,
            "results": 15
        }
        return durations.get(phase, 30)


GAME_MODES = {
    "classic": {
        "name": "Classic Impostor",
        "desc": "Original experience. Impostor does not know the word. Catch them before they guess it!",
        "min_players": 3,
        "max_players": 12,
    },
    "double_trouble": {
        "name": "Double Trouble",
        "desc": "Two impostors who do not know each other's identity!",
        "min_players": 6,
        "max_players": 12,
    },
    "undercover": {
        "name": "Undercover",
        "desc": "Impostor receives a subtly different related word! They think they are innocent.",
        "min_players": 4,
        "max_players": 12,
    },
    "mr_white": {
        "name": "Mr. White",
        "desc": "Impostor knows nothing, but guessing the exact word if caught scores Double Win!",
        "min_players": 4,
        "max_players": 12,
    },
    "ai_takeover": {
        "name": "AI Takeover",
        "desc": "Humans vs ML Bots, or 1 Human against multiple adaptive AI agents.",
        "min_players": 3,
        "max_players": 8,
    },
    "team_battle": {
        "name": "Team Battle",
        "desc": "Red Team vs Blue Team with an Infiltrator sabotaging clues in each squad.",
        "min_players": 6,
        "max_players": 12,
    },
    "mystery_twist": {
        "name": "Mystery Twist",
        "desc": "Chaos Cards activate every round with strange clue modifiers!",
        "min_players": 3,
        "max_players": 12,
    },
    "daily_challenge": {
        "name": "Daily Challenge",
        "desc": "Global daily word puzzle with competitive leaderboard scoring.",
        "min_players": 1,
        "max_players": 6,
    },
    "practice_arena": {
        "name": "Practice Arena",
        "desc": "Solo training vs AI bots with live semantic similarity feedback.",
        "min_players": 1,
        "max_players": 5,
    }
}


class SecretWordEngine:
    """
    Authoritative game engine for Secret-Word Impostor Matches.
    """

    def setup_match(
        self,
        players: List[Dict[str, Any]],
        mode: str = "classic",
        category: Optional[str] = "Random",
        difficulty: str = "easy",
        impostor_count: Optional[int] = None,
        clue_rounds: int = 2,
        enable_chaos: bool = False
    ) -> Dict[str, Any]:
        """
        Initializes match state, assigns roles and distributes secret words.
        """
        if mode not in GAME_MODES:
            mode = "classic"

        n = len(players)
        match_id = uuid.uuid4().hex

        # Determine number of impostors
        if impostor_count is None or impostor_count < 1:
            if mode == "double_trouble":
                actual_impostors = 2
            elif n >= 8:
                actual_impostors = 2
            else:
                actual_impostors = 1
        else:
            # Ensure at least 2 normal players remain
            max_allowed = max(1, n - 2)
            actual_impostors = min(impostor_count, max_allowed)

        # Select Secret Words
        word_data = word_intelligence.select_word_pair(category=category, difficulty=difficulty)
        secret_word = word_data["word"]
        undercover_word = word_data["undercover"]

        # Assign Roles & Modes
        shuffled_players = list(players)
        random.shuffle(shuffled_players)

        player_assignments: Dict[str, Dict[str, Any]] = {}

        impostor_sids = set()
        for i in range(actual_impostors):
            impostor_sids.add(shuffled_players[i]["sid"])

        for idx, p in enumerate(players):
            sid = p["sid"]
            is_impostor = sid in impostor_sids

            team = None
            if mode == "team_battle":
                team = "Red Team" if (idx % 2 == 0) else "Blue Team"

            if is_impostor:
                if mode == "undercover":
                    role = "undercover"
                    assigned_word = undercover_word
                    card_title = "Undercover Citizen"
                    description = f"Your secret word is: {undercover_word}. Describe it carefully!"
                elif mode == "mr_white":
                    role = "mr_white"
                    assigned_word = None
                    card_title = "Mr. White (Ghost)"
                    description = "You have NO word. Blend in! Guess the word if caught for a DOUBLE WIN!"
                elif mode == "double_trouble":
                    role = "impostor"
                    assigned_word = None
                    card_title = "Double Trouble Impostor"
                    description = "You are ONE of TWO Impostors! You do NOT know who your partner is. Blend in!"
                elif mode == "team_battle":
                    role = "infiltrator"
                    assigned_word = None
                    card_title = f"{team} Infiltrator"
                    description = f"You are an Infiltrator secretly undermining the {team}! Blend in and sabotage!"
                else:
                    role = "impostor"
                    assigned_word = None
                    card_title = "The Impostor"
                    description = "You DO NOT know the word! Listen to clues, bluff, and blend in!"
            else:
                role = "civilian"
                assigned_word = secret_word
                card_title = f"{team} Citizen" if team else "Innocent Citizen"
                description = f"Your secret word is: {secret_word}. Describe it without giving it away!"

            player_assignments[sid] = {
                "match_id": match_id,
                "role": role,
                "team": team,
                "is_impostor": is_impostor,
                "secret_word": assigned_word,
                "card_title": card_title,
                "description": description,
                "is_alive": True,
                "score": 0,
                "user_id": p.get("user_id"),
                "player_key": p.get("user_id") or sid
            }

        # Determine turn order for clues
        turn_order = [p["sid"] for p in shuffled_players]

        chaos_card = draw_chaos_card() if (enable_chaos or mode == "mystery_twist") else None

        return {
            "match_id": match_id,
            "mode": mode,
            "category": word_data["category"],
            "difficulty": difficulty,
            "secret_word": secret_word,
            "undercover_word": undercover_word,
            "player_assignments": player_assignments,
            "turn_order": turn_order,
            "current_turn_index": 0,
            "current_round": 1,
            "total_rounds": clue_rounds,
            "phase": "role_reveal",
            "active_chaos_card": chaos_card,
            "clues": [],
            "votes": {},
            "status": "in_progress"
        }

    def submit_clue(
        self,
        match_state: Dict[str, Any],
        player_sid: str,
        clue_text: str
    ) -> Dict[str, Any]:
        """
        Validates and records a player's clue in turn order.
        """
        turn_order = match_state["turn_order"]
        current_idx = match_state["current_turn_index"]

        if current_idx >= len(turn_order):
            return {"success": False, "error": "Round already finished"}

        expected_sid = turn_order[current_idx]
        if expected_sid != player_sid:
            return {"success": False, "error": "Not your turn"}

        secret_word = match_state["secret_word"]
        eval_result = word_intelligence.evaluate_clue(clue_text, secret_word)

        clue_entry = {
            "round": match_state["current_round"],
            "sid": player_sid,
            "clue": clue_text.strip(),
            "evaluation": eval_result
        }
        match_state["clues"].append(clue_entry)

        # Advance turn
        match_state["current_turn_index"] += 1

        # Check if round completed
        if match_state["current_turn_index"] >= len(turn_order):
            if match_state["current_round"] < match_state["total_rounds"]:
                # Next round
                match_state["current_round"] += 1
                match_state["current_turn_index"] = 0
                # Shuffle turn order for next round or reverse if chaos card active
                chaos_card = match_state.get("active_chaos_card") or {}
                if chaos_card.get("rule_type") == "reverse_turns":
                    match_state["turn_order"].reverse()
                else:
                    random.shuffle(match_state["turn_order"])
                phase_transition = "clue_giving"
            else:
                # Proceed to discussion and voting
                match_state["phase"] = "discussion"
                phase_transition = "discussion"
        else:
            phase_transition = "clue_giving"

        return {
            "success": True,
            "clue_entry": clue_entry,
            "next_phase": phase_transition,
            "next_turn_sid": match_state["turn_order"][match_state["current_turn_index"]] if match_state["current_turn_index"] < len(turn_order) else None
        }

    def tally_votes(
        self,
        match_state: Dict[str, Any],
        votes: Dict[str, str] # voter_sid -> target_sid
    ) -> Dict[str, Any]:
        """
        Tallies votes, detects ties, identifies the eliminated player,
        and checks if the Impostor is caught.
        """
        vote_counts: Dict[str, int] = {}
        for target in votes.values():
            if target:
                vote_counts[target] = vote_counts.get(target, 0) + 1

        if not vote_counts:
            # No votes cast, skip elimination
            return {"eliminated_sid": None, "is_tie": True, "counts": {}}

        # Find max votes
        max_votes = max(vote_counts.values())
        top_candidates = [sid for sid, c in vote_counts.items() if c == max_votes]

        if len(top_candidates) > 1:
            # Tie: no elimination or random tie-break based on match rule
            return {
                "eliminated_sid": None,
                "is_tie": True,
                "tied_candidates": top_candidates,
                "counts": vote_counts
            }

        eliminated_sid = top_candidates[0]
        player_info = match_state["player_assignments"].get(eliminated_sid, {})
        is_impostor = player_info.get("is_impostor", False)

        return {
            "eliminated_sid": eliminated_sid,
            "is_tie": False,
            "counts": vote_counts,
            "was_impostor": is_impostor,
            "role": player_info.get("role", "civilian"),
            "allow_final_guess": is_impostor # Caught impostor gets one final word guess!
        }

    def resolve_final_guess(
        self,
        match_state: Dict[str, Any],
        guessed_word: str
    ) -> Dict[str, Any]:
        """
        Evaluates the caught Impostor's last chance guess.
        If correct, the Impostor steals the win!
        """
        secret_word = match_state["secret_word"].strip().upper()
        clean_guess = guessed_word.strip().upper()

        is_exact = clean_guess == secret_word
        # High similarity (>0.85) semantic tolerance
        sim = word_intelligence.compute_similarity(clean_guess, secret_word)
        is_close = is_exact or (sim >= 0.88)

        if is_close:
            if match_state.get("mode") == "mr_white":
                winner = "mr_white"
                win_reason = f"Mr. White correctly guessed the secret word ({secret_word}) and achieved a DOUBLE WIN!"
            else:
                winner = "impostor"
                win_reason = f"The Impostor correctly guessed the secret word ({secret_word})!"
        else:
            winner = "innocents"
            win_reason = f"The Impostor guessed '{clean_guess}', but the secret word was '{secret_word}'."

        match_state["phase"] = "results"
        match_state["winner"] = winner
        match_state["win_reason"] = win_reason

        return {
            "winner": winner,
            "guessed_word": clean_guess,
            "secret_word": secret_word,
            "is_correct": is_close,
            "win_reason": win_reason
        }


# Singleton engine instance
secret_word_engine = SecretWordEngine()
game_engine = secret_word_engine  # Alias for backward compatibility
