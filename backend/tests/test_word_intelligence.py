"""
Tests for WordIntelligence and Semantic Dataset.
"""
import sys
import os

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from ml.word_intelligence import word_intelligence

def test_categories_loaded():
    cats = word_intelligence.get_categories()
    print(f"Categories loaded: {cats}")
    assert len(cats) >= 5
    assert "Technology" in cats
    assert "Food & Drinks" in cats

def test_select_word_pair():
    pair = word_intelligence.select_word_pair(category="Technology", difficulty="easy")
    print(f"Sample pair: {pair}")
    assert "word" in pair
    assert "undercover" in pair
    assert pair["category"] == "Technology"
    assert len(pair["word"]) > 1

def test_semantic_similarity():
    sim_close = word_intelligence.compute_similarity("smartphone", "phone")
    sim_far = word_intelligence.compute_similarity("smartphone", "elephant")
    print(f"Similarity (smartphone vs phone): {sim_close}")
    print(f"Similarity (smartphone vs elephant): {sim_far}")
    assert sim_close > sim_far

def test_clue_evaluation():
    eval_leak = word_intelligence.evaluate_clue("It is a blue smartphone with 5G", "smartphone")
    assert eval_leak["is_leak"] is True

    eval_good = word_intelligence.evaluate_clue("You carry it in your pocket to call people", "smartphone")
    assert eval_good["is_leak"] is False
    print(f"Clue evaluation result: {eval_good}")

if __name__ == "__main__":
    test_categories_loaded()
    test_select_word_pair()
    test_semantic_similarity()
    test_clue_evaluation()
    print("✅ All Milestone 1 Semantic Word Intelligence tests passed!")
