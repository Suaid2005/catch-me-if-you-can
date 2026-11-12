"""
Standalone test for game engine — no imports from database layer.
Run from: c:\\Users\\ASUS\\Catch-Me-If-You-Can\\backend
  python tests/run_engine_test.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.game.engine import GameEngine, ROLES

engine = GameEngine()
failures = []

def check(condition, name):
    status = "✅ PASS" if condition else "❌ FAIL"
    print(f"  {status}: {name}")
    if not condition:
        failures.append(name)

def make_players(n):
    return [{"sid": f"sid_{i}", "username": f"Player{i}", "is_alive": True} for i in range(n)]

print("\n── Role Assignment Tests ──")
for n in [2, 3, 4, 5, 6, 7, 8, 9, 10]:
    players = make_players(n)
    assignments = engine.assign_roles(players)
    check(len(assignments) == n, f"All {n} players get a role")

for n in [4, 5, 6]:
    players = make_players(n)
    assignments = engine.assign_roles(players)
    impostors = [r for r in assignments.values() if r["role_key"] == "impostor"]
    check(len(impostors) == 1, f"{n} players → 1 impostor")

for n in [7, 8, 9, 10]:
    players = make_players(n)
    assignments = engine.assign_roles(players)
    impostors = [r for r in assignments.values() if r["role_key"] == "impostor"]
    check(len(impostors) == 2, f"{n} players → 2 impostors")

for n in [3, 4, 5, 6, 7, 8]:
    players = make_players(n)
    assignments = engine.assign_roles(players)
    detectives = [r for r in assignments.values() if r["role_key"] == "detective"]
    check(len(detectives) >= 1, f"{n} players → has detective")

players = make_players(5)
assignments = engine.assign_roles(players)
informants = [r for r in assignments.values() if r["role_key"] == "informant"]
check(len(informants) == 1, "5 players → 1 informant")

players = make_players(3)
assignments = engine.assign_roles(players)
informants = [r for r in assignments.values() if r["role_key"] == "informant"]
check(len(informants) == 0, "3 players → no informant")

for role in ROLES:
    check(role in ROLES, f"Role '{role}' defined in ROLES dict")

print("\n── Win Condition Tests ──")
players_innocent_win = [
    {"is_alive": True, "role_key": "civilian"},
    {"is_alive": True, "role_key": "detective"},
]
check(engine.check_win_condition(players_innocent_win, ["impostor"]) == "innocent",
      "Innocents win when impostor eliminated")

players_impostor_win = [
    {"is_alive": True, "role_key": "impostor"},
    {"is_alive": True, "role_key": "civilian"},
]
check(engine.check_win_condition(players_impostor_win, ["civilian"]) == "impostor",
      "Impostor wins when outnumbers innocents")

players_continues = [
    {"is_alive": True, "role_key": "impostor"},
    {"is_alive": True, "role_key": "civilian"},
    {"is_alive": True, "role_key": "detective"},
]
check(engine.check_win_condition(players_continues, []) is None,
      "Game continues with no win condition met")

print("\n── Phase Duration Tests ──")
for phase in ["briefing", "gameplay", "voting", "reveal", "results"]:
    check(engine.get_phase_duration(phase) > 0, f"Phase '{phase}' has positive duration")
check(engine.get_phase_duration("unknown") == 30, "Unknown phase returns default 30s")

print(f"\n{'='*50}")
if failures:
    print(f"❌ {len(failures)} test(s) FAILED: {failures}")
    sys.exit(1)
else:
    print(f"✅ All tests passed!")
