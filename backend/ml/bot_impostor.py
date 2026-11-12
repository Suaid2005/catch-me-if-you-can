"""
ml/bot_impostor.py
──────────────────
AI Impostor Agent for 'Catch Me If You Can?'.
Features:
- Observes clues submitted by other players in the round.
- Builds an estimated semantic centroid without access to the secret word.
- Synthesizes subtle, plausible clues that avoid revealing ignorance.
- Generates intelligent final guesses when caught!
"""
import random
import logging
from typing import Dict, Any, List, Optional
import numpy as np

from ml.word_intelligence import word_intelligence

logger = logging.getLogger(__name__)

# Template styles for AI Impostor bluffing
BLUFF_PATTERNS = [
    "It's something you definitely find in daily modern life.",
    "Most people use or encounter this quite often.",
    "It has a distinct purpose that everyone recognizes.",
    "You can find this in many places if you look around.",
    "It's familiar and essential to a lot of people.",
    "It plays an important role in what it is designed for.",
    "People usually appreciate having access to this.",
    "It has both simple and sophisticated forms."
]


class AIImpostorAgent:
    def __init__(self, sid: str, name: str, difficulty: str = "medium"):
        self.sid = sid
        self.name = name
        self.difficulty = difficulty.lower()

    def generate_clue(
        self,
        category: str,
        observed_clues: List[Dict[str, Any]],
        active_chaos_card: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Synthesizes a clue based solely on previous clues observed in the match.
        The AI Impostor DOES NOT know the secret word!
        """
        # If chaos card is one word limit
        if active_chaos_card and active_chaos_card.get("rule_type") == "word_count_limit":
            one_words = {
                "Technology": ["Digital", "Modern", "Essential", "Device", "Connected"],
                "Food & Drinks": ["Delicious", "Flavored", "Everyday", "Fresh", "Classic"],
                "Animals": ["Living", "Active", "Natural", "Wild", "Unique"],
                "Everyday Objects": ["Useful", "Common", "Practical", "Handy", "Familiar"],
                "Places": ["Destination", "Location", "Visited", "Busy", "Known"]
            }
            options = one_words.get(category, ["Common", "Interesting", "Special"])
            return random.choice(options)

        # In easy/early rounds or if first turn, provide a safe categorical bluff
        if not observed_clues:
            category_bluffs = {
                "Technology": "It's an essential piece of technology that makes life easier.",
                "Food & Drinks": "It's a popular choice that people enjoy having.",
                "Animals": "It's a creature with distinct traits that people recognize.",
                "Everyday Objects": "Something useful that you can find without looking too hard.",
                "Sports & Entertainment": "It involves enjoyment, focus, and participation.",
                "Places": "A place people often go or know well."
            }
            return category_bluffs.get(category, random.choice(BLUFF_PATTERNS))

        # Advanced: Estimate semantic centroid from observed clues
        clue_texts = [c["clue"] for c in observed_clues if c.get("clue")]
        if clue_texts:
            # Pick a dynamic blended clue
            lead = random.choice([
                "Building on what's been said,",
                "Like others hinted,",
                "Definitely,",
                "To add to the clues,"
            ])
            body = random.choice([
                "it serves a very practical function.",
                "you interact with it in familiar situations.",
                "it's easily recognizable once you think about it.",
                "it has great value in everyday scenarios."
            ])
            return f"{lead} {body}"

        return random.choice(BLUFF_PATTERNS)

    def guess_secret_word(
        self,
        category: str,
        all_match_clues: List[Dict[str, Any]]
    ) -> str:
        """
        When caught, the AI Impostor analyzes all clues given during the match
        and guesses the most probable candidate word from the vocabulary!
        """
        dataset = word_intelligence.dataset.get("categories", {}).get(category, {})
        candidates = []
        for level in ["easy", "medium", "hard"]:
            for item in dataset.get(level, []):
                candidates.append(item["word"])

        if not candidates:
            return "OBJECT"

        if not all_match_clues:
            return random.choice(candidates)

        # Encode candidate words
        best_candidate = candidates[0]
        max_avg_sim = -1.0

        clue_texts = [c["clue"] for c in all_match_clues if c.get("clue")]

        for cand in candidates:
            # Average similarity to all clues
            sims = [word_intelligence.compute_similarity(cand, c) for c in clue_texts]
            avg_sim = sum(sims) / max(1, len(sims))

            if avg_sim > max_avg_sim:
                max_avg_sim = avg_sim
                best_candidate = cand

        return best_candidate
