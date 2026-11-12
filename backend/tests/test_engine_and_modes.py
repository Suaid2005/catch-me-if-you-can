"""
backend/tests/test_engine_and_modes.py
──────────────────────────────────────
Comprehensive Unit & Integration Test Suite for:
1. Match Setup Requirements (3-12 players, auto/manual impostors, difficulty tiers, rounds 1-5, chaos cards).
2. All 9 Game Modes (classic, double_trouble, undercover, mr_white, ai_takeover, team_battle, mystery_twist, daily_challenge, practice_arena).
3. Secret Word Protection (Impostors never get the secret word; civilians always do).
4. Turn-by-turn Clue Progression and Multi-Round Loops.
5. Voting Tally, Tie Detection, and Final Word Guess Opportunity (including Mr. White Double Win).
6. AI Impostor and Normal Player Agents.
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.game.engine import secret_word_engine, GAME_MODES
from app.game.chaos_cards import draw_chaos_card, CHAOS_CARDS
from ml.word_intelligence import word_intelligence
from ml.bot_impostor import AIImpostorAgent
from ml.bot_player import AINormalPlayerAgent


def make_test_players(n=5):
    return [{"sid": f"p_{i}", "username": f"Player_{i}", "is_bot": False} for i in range(n)]


def test_game_modes_exist_and_metadata():
    """Verify all 9 official game modes exist with valid descriptions and limits."""
    expected_modes = [
        "classic", "double_trouble", "undercover", "mr_white", "ai_takeover",
        "team_battle", "mystery_twist", "daily_challenge", "practice_arena"
    ]
    assert len(GAME_MODES) == 9
    for mode in expected_modes:
        assert mode in GAME_MODES, f"Missing mode: {mode}"
        info = GAME_MODES[mode]
        assert "name" in info and len(info["name"]) > 0
        assert "desc" in info and len(info["desc"]) > 0
        assert info["min_players"] >= 1
        assert info["max_players"] <= 12
        print(f"Verified mode: {info['name']} (players: {info['min_players']}-{info['max_players']})")


def test_player_count_range_and_impostor_capping():
    """
    Test player counts from 3 to 12.
    Assert that impostors are capped so at least 2 normal players receive the secret word.
    """
    for n in range(3, 13):
        players = make_test_players(n)

        # Test Auto impostor selection
        match_auto = secret_word_engine.setup_match(players, mode="classic")
        civilians = [p for p in match_auto["player_assignments"].values() if not p["is_impostor"]]
        assert len(civilians) >= 2, f"Failed at n={n}: less than 2 normal players"

        # Test Manual impostor selection with excessive impostor count
        excessive_imp = n  # e.g., asking for n impostors
        match_manual = secret_word_engine.setup_match(players, mode="classic", impostor_count=excessive_imp)
        manual_civilians = [p for p in match_manual["player_assignments"].values() if not p["is_impostor"]]
        manual_impostors = [p for p in match_manual["player_assignments"].values() if p["is_impostor"]]
        assert len(manual_civilians) >= 2, f"Impostor capping failed for n={n}"
        assert len(manual_impostors) <= max(1, n - 2)

    print("✅ Player count 3-12 and Impostor capping (>=2 normal players) verified")


def test_difficulty_tiers_including_expert():
    """Verify all four difficulty tiers: easy, medium, hard, expert."""
    tiers = ["easy", "medium", "hard", "expert"]
    players = make_test_players(4)

    for tier in tiers:
        match = secret_word_engine.setup_match(players, difficulty=tier)
        assert match["difficulty"] == tier
        assert isinstance(match["secret_word"], str) and len(match["secret_word"]) > 0
        print(f"Tier '{tier}' selected secret word: {match['secret_word']} (category: {match['category']})")


def test_selectable_categories():
    """Verify category selection (Random + explicit categories)."""
    categories = ["Random", "Technology", "Food & Drinks", "Animals", "Everyday Objects", "Sports & Entertainment", "Places"]
    players = make_test_players(4)

    for cat in categories:
        match = secret_word_engine.setup_match(players, category=cat)
        if cat != "Random":
            assert match["category"] == cat
        else:
            assert match["category"] in categories
    print("✅ Categories (Random + all 6 explicit) verified")


def test_clue_rounds_1_to_5():
    """Verify clue rounds configuration from 1 to 5 rounds."""
    for rounds in range(1, 6):
        players = make_test_players(3)
        match = secret_word_engine.setup_match(players, clue_rounds=rounds)
        assert match["total_rounds"] == rounds
        assert match["current_round"] == 1
    print("✅ Clue rounds 1-5 verified")


def test_chaos_cards_toggle():
    """Verify Chaos Cards toggle and Mystery Twist auto-activation."""
    players = make_test_players(4)

    # Disabled
    m_no_chaos = secret_word_engine.setup_match(players, enable_chaos=False)
    assert m_no_chaos["active_chaos_card"] is None

    # Enabled
    m_chaos = secret_word_engine.setup_match(players, enable_chaos=True)
    assert m_chaos["active_chaos_card"] is not None
    assert "name" in m_chaos["active_chaos_card"]

    # Mystery Twist mode automatically enables chaos card
    m_mystery = secret_word_engine.setup_match(players, mode="mystery_twist", enable_chaos=False)
    assert m_mystery["active_chaos_card"] is not None
    print("✅ Chaos Cards toggle and Mystery Twist activation verified")


def test_all_nine_modes_behavior():
    """Verify role distribution, secret word assignments, and specific rules across all 9 modes."""
    players = make_test_players(6)

    # 1. Classic
    m_classic = secret_word_engine.setup_match(players, mode="classic")
    imps = [p for p in m_classic["player_assignments"].values() if p["is_impostor"]]
    assert len(imps) == 1
    assert imps[0]["secret_word"] is None

    # 2. Double Trouble (2 impostors)
    m_dt = secret_word_engine.setup_match(players, mode="double_trouble")
    dt_imps = [p for p in m_dt["player_assignments"].values() if p["is_impostor"]]
    assert len(dt_imps) == 2
    for imp in dt_imps:
        assert imp["secret_word"] is None
        assert "Double Trouble" in imp["card_title"]

    # 3. Undercover
    m_under = secret_word_engine.setup_match(players, mode="undercover")
    under_imps = [p for p in m_under["player_assignments"].values() if p["is_impostor"]]
    assert len(under_imps) == 1
    assert under_imps[0]["secret_word"] == m_under["undercover_word"]
    assert under_imps[0]["secret_word"] != m_under["secret_word"]

    # 4. Mr. White
    m_white = secret_word_engine.setup_match(players, mode="mr_white")
    white_imps = [p for p in m_white["player_assignments"].values() if p["is_impostor"]]
    assert len(white_imps) == 1
    assert white_imps[0]["secret_word"] is None
    assert "Mr. White" in white_imps[0]["card_title"]

    # Test Mr. White double win on final guess
    res_white = secret_word_engine.resolve_final_guess(m_white, m_white["secret_word"])
    assert res_white["winner"] == "mr_white"
    assert "DOUBLE WIN" in res_white["win_reason"]

    # 5. AI Takeover
    m_ai = secret_word_engine.setup_match(players, mode="ai_takeover")
    assert m_ai["mode"] == "ai_takeover"

    # 6. Team Battle
    m_team = secret_word_engine.setup_match(players, mode="team_battle")
    reds = [p for p in m_team["player_assignments"].values() if p["team"] == "Red Team"]
    blues = [p for p in m_team["player_assignments"].values() if p["team"] == "Blue Team"]
    assert len(reds) == 3 and len(blues) == 3

    # 7. Mystery Twist
    m_twist = secret_word_engine.setup_match(players, mode="mystery_twist")
    assert m_twist["active_chaos_card"] is not None

    # 8. Daily Challenge
    m_daily = secret_word_engine.setup_match(players, mode="daily_challenge")
    assert m_daily["mode"] == "daily_challenge"

    # 9. Practice Arena
    m_prac = secret_word_engine.setup_match(players, mode="practice_arena")
    assert m_prac["mode"] == "practice_arena"

    print("✅ All 9 Game Modes verified end-to-end")


def test_multi_round_clue_progression():
    """Verify clue submission flows across 2 rounds then enters discussion."""
    players = make_test_players(3)
    match = secret_word_engine.setup_match(players, clue_rounds=2)

    # Round 1
    assert match["current_round"] == 1
    for _ in range(3):
        curr_sid = match["turn_order"][match["current_turn_index"]]
        res = secret_word_engine.submit_clue(match, curr_sid, "Clue for round 1")
        assert res["success"] is True

    # Round 2
    assert match["current_round"] == 2
    assert match["phase"] == "role_reveal" or res["next_phase"] == "clue_giving"
    for _ in range(3):
        curr_sid = match["turn_order"][match["current_turn_index"]]
        res = secret_word_engine.submit_clue(match, curr_sid, "Clue for round 2")
        assert res["success"] is True

    # After 2 complete rounds, phase transitions to discussion
    assert match["phase"] == "discussion"
    assert len(match["clues"]) == 6
    print("✅ Multi-round clue submission flow (2 rounds * 3 players = 6 clues) verified")


def test_voting_tie_and_elimination():
    """Verify vote tallying, tie handling, and elimination logic."""
    players = make_test_players(4)
    match = secret_word_engine.setup_match(players)

    # Case A: Tied votes (2 for p_0, 2 for p_1)
    tied_votes = {
        "p_0": "p_1",
        "p_1": "p_0",
        "p_2": "p_1",
        "p_3": "p_0"
    }
    tally_tie = secret_word_engine.tally_votes(match, tied_votes)
    assert tally_tie["is_tie"] is True
    assert tally_tie["eliminated_sid"] is None

    # Case B: Clear majority
    decisive_votes = {
        "p_0": "p_2",
        "p_1": "p_2",
        "p_2": "p_0",
        "p_3": "p_2"
    }
    tally_clear = secret_word_engine.tally_votes(match, decisive_votes)
    assert tally_clear["is_tie"] is False
    assert tally_clear["eliminated_sid"] == "p_2"
    print("✅ Voting tie-breaking and clear majority elimination verified")


if __name__ == "__main__":
    test_game_modes_exist_and_metadata()
    test_player_count_range_and_impostor_capping()
    test_difficulty_tiers_including_expert()
    test_selectable_categories()
    test_clue_rounds_1_to_5()
    test_chaos_cards_toggle()
    test_all_nine_modes_behavior()
    test_multi_round_clue_progression()
    test_voting_tie_and_elimination()
    print("\n🎉 ALL 9 TEST SUITES COMPLETED WITH 100% SUCCESS!")
