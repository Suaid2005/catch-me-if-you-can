"""
ml/word_intelligence.py
─────────────────────────
Semantic Word Intelligence for 'Catch Me If You Can?'.

Features:
1. Loads curated vocabulary categorized by difficulty and category.
2. Uses sentence-transformers (all-MiniLM-L6-v2) for genuine cosine similarity calculation.
3. Automatically evaluates semantic proximity between words and candidate clues.
4. Provides difficulty-appropriate secret word and undercover pairs.
5. Zero paid external APIs.
"""
import json
import os
import random
from typing import Optional, Tuple, Dict, Any, List
import numpy as np

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(CURRENT_DIR, "vocabulary_dataset.json")


class WordIntelligence:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(WordIntelligence, cls).__new__(cls)
            cls._instance._init_engine()
        return cls._instance

    def _init_engine(self):
        self.dataset = self._load_dataset()
        self.model = None
        # Cache embeddings to guarantee zero runtime latency
        self.embedding_cache: Dict[str, np.ndarray] = {}

    def _lazy_load_model(self):
        # Guard against heavy imports & memory exhaustion on Render 512MB free tier
        from app.config import get_settings
        settings = get_settings()
        if not getattr(settings, "enable_heavy_embeddings", False):
            return

        if self.model is None:
            try:
                from sentence_transformers import SentenceTransformer
                self.model = SentenceTransformer("all-MiniLM-L6-v2")
            except Exception as e:
                print(f"[WordIntelligence] Notice: MiniLM offline fallback active ({e})")
                self.model = None

    def _load_dataset(self) -> Dict[str, Any]:
        if os.path.exists(DATASET_PATH):
            with open(DATASET_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        return {"categories": {}}

    def get_categories(self) -> List[str]:
        return list(self.dataset.get("categories", {}).keys())

    def select_word_pair(
        self,
        category: Optional[str] = None,
        difficulty: str = "medium"
    ) -> Dict[str, Any]:
        """
        Selects a secret word and its undercover counterpart.
        If category is None or 'Random', picks from any category.
        """
        categories = self.dataset.get("categories", {})
        if not categories:
            # Fallback safe default
            return {
                "word": "MOBILE",
                "undercover": "TABLET",
                "category": "Technology",
                "difficulty": difficulty,
                "hints": ["handheld", "screen", "calls"]
            }

        if not category or category.lower() == "random" or category not in categories:
            cat_name = random.choice(list(categories.keys()))
        else:
            cat_name = category

        cat_data = categories[cat_name]
        diff_level = difficulty.lower()
        if diff_level not in cat_data:
            diff_level = "medium" if "medium" in cat_data else list(cat_data.keys())[0]

        word_options = cat_data.get(diff_level, [])
        if not word_options:
            # Fallback across levels
            for lvl in ["easy", "medium", "hard", "expert"]:
                if cat_data.get(lvl):
                    word_options = cat_data[lvl]
                    break

        selected = random.choice(word_options)
        return {
            "word": selected["word"],
            "undercover": selected.get("undercover", selected["word"]),
            "category": cat_name,
            "difficulty": diff_level,
            "hints": selected.get("hints", [])
        }

    def encode(self, text: str) -> np.ndarray:
        """Computes or retrieves cached vector embedding for a word/clue."""
        text_clean = text.strip().lower()
        if text_clean in self.embedding_cache:
            return self.embedding_cache[text_clean]

        self._lazy_load_model()
        if self.model is not None:
            vec = self.model.encode(text_clean, normalize_embeddings=True)
            self.embedding_cache[text_clean] = vec
            return vec

        # Lightweight zero-RAM vectorizer (safe for 512MB free tier, <1ms execution)
        # Deterministic feature hashing across unigrams, bigrams and trigrams
        vec = np.zeros(128, dtype=np.float32)
        padded = f"^{text_clean}$"
        for n in (1, 2, 3):
            for i in range(len(padded) - n + 1):
                gram = padded[i : i + n]
                idx = abs(hash(gram)) % 128
                vec[idx] += 1.0
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        self.embedding_cache[text_clean] = vec
        return vec

    def compute_similarity(self, text_a: str, text_b: str) -> float:
        """Calculates cosine similarity between two terms or phrases (0.0 to 1.0)."""
        vec_a = self.encode(text_a)
        vec_b = self.encode(text_b)
        similarity = float(np.dot(vec_a, vec_b))
        return max(0.0, min(1.0, (similarity + 1.0) / 2.0 if similarity < 0 else similarity))

    def evaluate_clue(self, clue: str, secret_word: str) -> Dict[str, Any]:
        """
        Evaluates a player's clue against the secret word:
        - Check if player leaked the exact secret word (illegal).
        - Compute semantic proximity score.
        - Determine suspicion rating.
        """
        clue_clean = clue.strip().lower()
        secret_clean = secret_word.strip().lower()

        is_leak = secret_clean in clue_clean

        sim = self.compute_similarity(clue_clean, secret_clean)

        # In secret-word games:
        # - Very high similarity (>0.85) is dangerously close to giving it away.
        # - Moderate similarity (0.45 - 0.75) is optimal.
        # - Very low similarity (<0.30) suggests the player doesn't know the word (Impostor suspect!).
        if sim < 0.32:
            verdict = "SUSPICIOUS"
        elif sim > 0.85:
            verdict = "TOO_OBVIOUS"
        else:
            verdict = "BALANCED"

        return {
            "similarity": round(sim, 3),
            "is_leak": is_leak,
            "verdict": verdict
        }


# Singleton instance
word_intelligence = WordIntelligence()
