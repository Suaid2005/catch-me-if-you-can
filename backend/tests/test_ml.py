"""
tests/test_ml.py
─────────────────
Tests for the ML / AI components.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from ml.chat_analyzer import score_message, update_player_score
from ml.bot_agent import BotAgent, create_bot


class TestChatAnalyzer:

    def test_suspicious_message_scores_above_zero(self):
        score = score_message("I swear it wasn't me!")
        assert score > 0.0

    def test_normal_message_scores_zero(self):
        score = score_message("Good morning everyone, let's play!")
        assert score == 0.0

    def test_score_is_between_0_and_1(self):
        messages = [
            "I swear trust me believe me it wasn't me no idea",
            "Hello!",
            "They're lying! Blame them! I didn't do it!",
        ]
        for msg in messages:
            score = score_message(msg)
            assert 0.0 <= score <= 1.0, f"Score out of range for: {msg!r}"

    def test_running_average_converges(self):
        score = 0.0
        for _ in range(10):
            score = update_player_score(score, 0.9)
        # After many suspicious messages, score should be high
        assert score > 0.5


class TestBotAgent:

    def test_bot_creation(self):
        bot = BotAgent("bot_1", "Shadow", "civilian")
        assert bot.username == "Shadow"
        assert bot.role_key == "civilian"
        assert bot.persona_key in ["talkative", "quiet", "aggressive", "analytical", "nervous"]

    def test_impostor_bot_can_generate_message(self):
        bot = BotAgent("bot_1", "Raven", "impostor")
        players = [
            {"username": "Alice", "is_alive": True, "suspicion_score": 0.3},
            {"username": "Raven", "is_alive": True, "suspicion_score": 0.1},
        ]
        # Force speak by overriding persona
        bot.persona["chat_frequency"] = 1.0
        msg = bot.generate_message("gameplay", players, [])
        # Message might be None if template is empty, but shouldn't raise
        assert msg is None or isinstance(msg, str)

    def test_bot_vote_returns_a_player(self):
        bot = BotAgent("bot_1", "Cipher", "detective")
        players = [
            {"username": "Alice", "is_alive": True, "suspicion_score": 0.8},
            {"username": "Bob", "is_alive": True, "suspicion_score": 0.2},
        ]
        vote = bot.decide_vote(players, [])
        assert vote in ["Alice", "Bob"]

    def test_create_bot_returns_valid_dict(self):
        bot = create_bot("civilian", existing_names=[])
        assert "username" in bot
        assert "avatar" in bot
        assert bot["is_bot"] is True
        assert bot["is_alive"] is True
