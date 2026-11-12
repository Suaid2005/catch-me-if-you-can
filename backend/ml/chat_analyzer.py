"""
ml/chat_analyzer.py
────────────────────
Milestone 8 stub: chat-based suspicion scorer.

Phase 1: simple keyword heuristics (no ML yet)
Phase 2 (Milestone 8): sentence-transformer embeddings + classifier

The suspicion score is a float from 0.0 (completely normal) to 1.0 (very suspicious).
"""
import re
import logging

logger = logging.getLogger(__name__)

# Phrases that might indicate deceptive behaviour (very simple Phase 1 heuristic)
SUSPICIOUS_PATTERNS = [
    r"\bi didn't\b", r"\bwasn't me\b", r"\bnot me\b", r"\bi swear\b",
    r"\btrust me\b", r"\bbelieve me\b", r"\bno idea\b", r"\bwhy would i\b",
    r"\bthey're lying\b", r"\bblame\b", r"\baccusing\b",
]

COMPILED = [re.compile(p, re.IGNORECASE) for p in SUSPICIOUS_PATTERNS]


def score_message(message: str) -> float:
    """
    Return a suspicion score (0.0–1.0) for a single chat message.

    Phase 1: pattern-matching heuristic.
    Phase 2: will be replaced by sentence-transformer + classifier.
    """
    hits = sum(1 for pattern in COMPILED if pattern.search(message))
    # Normalise to 0–1 range, cap at 1.0
    score = min(hits / max(len(COMPILED) * 0.3, 1), 1.0)
    return round(score, 3)


def update_player_score(current_score: float, new_message_score: float) -> float:
    """
    Exponential moving average: blend the new message score into the
    running total. This prevents one suspicious message from permanently
    branding a player.

    alpha controls how quickly the score reacts to new messages.
    """
    alpha = 0.3  # Weight for the new message
    updated = alpha * new_message_score + (1 - alpha) * current_score
    return round(updated, 3)
