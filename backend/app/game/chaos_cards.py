"""
app/game/chaos_cards.py
───────────────────────
Chaos Cards modifiers for 'Mystery Twist' mode or when Chaos toggle is ON.
Special modifiers activated randomly during matches to shake up gameplay.
"""
import random
from typing import Dict, Any, List

CHAOS_CARDS = [
    {
        "id": "one_word",
        "name": "One-Word Wonder",
        "emoji": "☝️",
        "description": "Players can only submit a clue containing exactly ONE word this round!",
        "rule_type": "word_count_limit",
        "max_words": 1
    },
    {
        "id": "reverse_order",
        "name": "Time Warp",
        "emoji": "🔄",
        "description": "Turn order is reversed! Last becomes first.",
        "rule_type": "reverse_turns"
    },
    {
        "id": "rhyme_time",
        "name": "Rhyme Time",
        "emoji": "🎵",
        "description": "Your clue must rhyme with the previous player's clue!",
        "rule_type": "rhyme_constraint"
    },
    {
        "id": "double_speed",
        "name": "Speed Blitz",
        "emoji": "⚡",
        "description": "Clue timer cut in half! Think fast or pass.",
        "rule_type": "half_timer"
    },
    {
        "id": "impostor_peek",
        "name": "Shadow Whisper",
        "emoji": "👁️",
        "description": "The Impostor receives a subtle, single-word hint category!",
        "rule_type": "impostor_hint"
    },
    {
        "id": "no_nouns",
        "name": "Abstract Thoughts",
        "emoji": "🎨",
        "description": "Describe using feelings, verbs, or colors only — no physical objects!",
        "rule_type": "style_constraint"
    }
]

def draw_chaos_card() -> Dict[str, Any]:
    """Draws a random chaos card."""
    return random.choice(CHAOS_CARDS)

def get_all_chaos_cards() -> List[Dict[str, Any]]:
    return CHAOS_CARDS
