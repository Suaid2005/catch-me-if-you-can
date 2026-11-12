"""
tests/test_game_engine.py
──────────────────────────
Unit tests for the core game engine.
Run with: pytest tests/ -v
"""
import pytest
from app.game.engine import GameEngine, ROLES


@pytest.fixture
def engine():
    return GameEngine()


def _make_players(n: int) -> list[dict]:
    return [{"sid": f"sid_{i}", "username": f"Player{i}", "is_alive": True} for i in range(n)]


class TestRoleAssignment:

    def test_assigns_one_impostor_for_small_game(self, engine):
        players = _make_players(4)
        assignments = engine.assign_roles(players)
        impostors = [r for r in assignments.values() if r["role_key"] == "impostor"]
        assert len(impostors) == 1

    def test_assigns_two_impostors_for_large_game(self, engine):
        players = _make_players(8)
        assignments = engine.assign_roles(players)
        impostors = [r for r in assignments.values() if r["role_key"] == "impostor"]
        assert len(impostors) == 2

    def test_always_includes_detective_for_3plus_players(self, engine):
        for n in [3, 4, 5, 6, 7, 8]:
            players = _make_players(n)
            assignments = engine.assign_roles(players)
            detectives = [r for r in assignments.values() if r["role_key"] == "detective"]
            assert len(detectives) >= 1, f"No detective for {n} players"

    def test_includes_informant_for_5plus_players(self, engine):
        players = _make_players(5)
        assignments = engine.assign_roles(players)
        informants = [r for r in assignments.values() if r["role_key"] == "informant"]
        assert len(informants) == 1

    def test_no_informant_for_small_games(self, engine):
        players = _make_players(3)
        assignments = engine.assign_roles(players)
        informants = [r for r in assignments.values() if r["role_key"] == "informant"]
        assert len(informants) == 0

    def test_every_player_gets_a_role(self, engine):
        for n in [2, 3, 4, 5, 6, 7, 8, 9, 10]:
            players = _make_players(n)
            assignments = engine.assign_roles(players)
            assert len(assignments) == n, f"Not all players assigned for n={n}"

    def test_all_roles_are_valid(self, engine):
        players = _make_players(8)
        assignments = engine.assign_roles(players)
        for role in assignments.values():
            assert role["role_key"] in ROLES


class TestWinConditions:

    def test_innocent_win_when_impostor_eliminated(self, engine):
        players = [
            {"is_alive": True, "role_key": "civilian"},
            {"is_alive": True, "role_key": "detective"},
        ]
        result = engine.check_win_condition(players, eliminated_roles=["impostor"])
        assert result == "innocent"

    def test_impostor_wins_when_outnumbers_innocents(self, engine):
        players = [
            {"is_alive": True, "role_key": "impostor"},
            {"is_alive": True, "role_key": "civilian"},
        ]
        result = engine.check_win_condition(players, eliminated_roles=["civilian"])
        assert result == "impostor"

    def test_game_continues_when_no_condition_met(self, engine):
        players = [
            {"is_alive": True, "role_key": "impostor"},
            {"is_alive": True, "role_key": "civilian"},
            {"is_alive": True, "role_key": "detective"},
        ]
        result = engine.check_win_condition(players, eliminated_roles=[])
        assert result is None


class TestPhaseDurations:

    def test_all_phases_have_positive_duration(self, engine):
        for phase in ["briefing", "gameplay", "voting", "reveal", "results"]:
            assert engine.get_phase_duration(phase) > 0

    def test_unknown_phase_returns_default(self, engine):
        assert engine.get_phase_duration("unknown_phase") == 30
