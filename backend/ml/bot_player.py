"""
ml/bot_player.py
────────────────
AI Normal Player Agent for 'Catch Me If You Can?'.
Features:
- Given the secret word (or undercover word).
- Generates natural, subtle clues that describe the word without naming it directly.
- Participates in discussions and votes.
"""
import random
from typing import Dict, Any, List, Optional

from ml.word_intelligence import word_intelligence


class AINormalPlayerAgent:
    def __init__(self, sid: str, name: str, difficulty: str = "medium"):
        self.sid = sid
        self.name = name
        self.difficulty = difficulty.lower()

    def generate_clue(
        self,
        secret_word: str,
        category: str,
        active_chaos_card: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generates a descriptive clue for the secret word.
        Must not leak the exact word!
        """
        # Find hints in dataset if available
        cat_data = word_intelligence.dataset.get("categories", {}).get(category, {})
        hints = []
        for level in ["easy", "medium", "hard"]:
            for item in cat_data.get(level, []):
                if item["word"].upper() == secret_word.upper():
                    hints = item.get("hints", [])
                    break

        # Check for one-word chaos constraint
        if active_chaos_card and active_chaos_card.get("rule_type") == "word_count_limit":
            if hints:
                first_word = hints[0].split()[0]
                return first_word.capitalize()
            return "Essential"

        if hints:
            selected_hint = random.choice(hints)
            prefixes = [
                f"Think of something with {selected_hint}.",
                f"You'll know it by its {selected_hint}.",
                f"It's notable for being {selected_hint}.",
                f"It often involves {selected_hint}."
            ]
            return random.choice(prefixes)

        # Fallback contextual clue
        return f"A classic example of {category} that people readily recognize."

    def cast_vote(
        self,
        players: List[Dict[str, Any]],
        clues: List[Dict[str, Any]]
    ) -> Optional[str]:
        """
        Analyzes clues from other players to vote for the most suspicious one.
        Evaluates clue semantic similarity.
        """
        candidates = [p["sid"] for p in players if p["sid"] != self.sid and p.get("is_alive", True)]
        if not candidates:
            return None

        # Score clues given by other players
        suspicion_map: Dict[str, float] = {}
        for entry in clues:
            sid = entry["sid"]
            if sid in candidates:
                eval_res = entry.get("evaluation", {})
                sim = eval_res.get("similarity", 0.5)
                # Lower similarity or "SUSPICIOUS" verdict increases suspicion
                if eval_res.get("verdict") == "SUSPICIOUS":
                    suspicion_map[sid] = suspicion_map.get(sid, 0) + 2.0
                elif sim < 0.35:
                    suspicion_map[sid] = suspicion_map.get(sid, 0) + 1.0

        if suspicion_map:
            # Pick highest suspicion
            sorted_sus = sorted(suspicion_map.items(), key=lambda x: x[1], reverse=True)
            return sorted_sus[0][0]

        # Random vote among candidates if no clear suspicion
        return random.choice(candidates)
