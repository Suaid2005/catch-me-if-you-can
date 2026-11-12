"""
Standalone test for ML components.
Run from: c:\\Users\\ASUS\\Catch-Me-If-You-Can\\backend
  python tests/run_ml_test.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ml.chat_analyzer import score_message, update_player_score
from ml.bot_agent import BotAgent, create_bot

failures = []

def check(condition, name):
    status = "✅ PASS" if condition else "❌ FAIL"
    print(f"  {status}: {name}")
    if not condition:
        failures.append(name)

print("\n── Chat Analyzer Tests ──")
score = score_message("I swear it wasn't me!")
check(score > 0.0, "Suspicious message scores above 0")

score = score_message("Good morning everyone!")
check(score == 0.0, "Normal message scores 0")

test_messages = [
    "I swear trust me believe me it wasn't me no idea",
    "Hello!",
    "They're lying! Blame them! I didn't do it!",
]
for msg in test_messages:
    s = score_message(msg)
    check(0.0 <= s <= 1.0, f"Score in [0,1] for: {msg[:40]!r}")

running = 0.0
for _ in range(10):
    running = update_player_score(running, 0.9)
check(running > 0.5, "Running average increases with repeated suspicious messages")

print("\n── Bot Agent Tests ──")
bot = BotAgent("bot_1", "Shadow", "civilian")
check(bot.username == "Shadow", "Bot username correct")
check(bot.role_key == "civilian", "Bot role correct")
check(bot.persona_key in ["talkative", "quiet", "aggressive", "analytical", "nervous"],
      "Bot persona is valid")

players = [
    {"username": "Alice", "is_alive": True, "suspicion_score": 0.3, "sid": "s1"},
    {"username": "Shadow", "is_alive": True, "suspicion_score": 0.1, "sid": "s2"},
]
impostor_bot = BotAgent("bot_2", "Raven", "impostor")
impostor_bot.persona["chat_frequency"] = 1.0  # Force it to always speak
msg = impostor_bot.generate_message("gameplay", players, [])
check(msg is None or isinstance(msg, str), "Impostor bot generates a message or None")

detective_bot = BotAgent("bot_3", "Cipher", "detective")
vote = detective_bot.decide_vote(players, [])
check(vote in ["Alice", "Shadow"] or vote is None, "Detective bot votes for a valid player")

bot_dict = create_bot("civilian", existing_names=[])
check("username" in bot_dict, "create_bot returns dict with username")
check("avatar" in bot_dict, "create_bot returns dict with avatar")
check(bot_dict["is_bot"] is True, "create_bot marks bot correctly")
check(bot_dict["is_alive"] is True, "create_bot marks bot as alive")

print(f"\n{'='*50}")
if failures:
    print(f"❌ {len(failures)} test(s) FAILED: {failures}")
    sys.exit(1)
else:
    print(f"✅ All tests passed!")
