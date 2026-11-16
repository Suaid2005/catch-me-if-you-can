"""
app/game/code_utils.py
──────────────────────
Room code generation, canonicalization, and visual ambiguity resolution.

To prevent players from entering incorrect codes due to visually similar
characters across different monospace and sans-serif fonts:
- Generated codes strictly exclude '0', 'O', '1', 'I'.
- Ambiguity resolver checks permutations ('1' <-> 'I' <-> 'L', '0' <-> 'O',
  '8' <-> 'B', '5' <-> 'S', '2' <-> 'Z') so players who manually read or
  type codes with visual character confusion are still successfully matched.
"""
import random
from typing import List

# Unambiguous alphabet: 32 characters, strictly avoiding 0, O, 1, I
UNAMBIGUOUS_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

AMBIGUOUS_SUBSTITUTIONS = {
    "1": ["I", "L"],
    "I": ["1", "L"],
    "L": ["1", "I"],
    "0": ["O"],
    "O": ["0"],
    "8": ["B"],
    "B": ["8"],
    "5": ["S"],
    "S": ["5"],
    "2": ["Z"],
    "Z": ["2"],
}


def generate_unambiguous_code(length: int = 6) -> str:
    """Generate a clean alphanumeric code without confusing characters (0, O, 1, I)."""
    return "".join(random.choices(UNAMBIGUOUS_ALPHABET, k=length))


def get_code_candidates(code: str, max_candidates: int = 32) -> List[str]:
    """
    Returns a list of candidate room codes starting with the exact code,
    followed by visually ambiguous character substitutions.
    """
    clean = code.upper().strip()
    if not clean:
        return []

    candidates = [clean]
    for i, ch in enumerate(clean):
        if ch in AMBIGUOUS_SUBSTITUTIONS:
            new_variants = []
            for cand in list(candidates):
                if i < len(cand):
                    for alt in AMBIGUOUS_SUBSTITUTIONS.get(cand[i], []):
                        v = cand[:i] + alt + cand[i+1:]
                        if v not in candidates and v not in new_variants:
                            new_variants.append(v)
            candidates.extend(new_variants)
            if len(candidates) >= max_candidates:
                break

    return candidates[:max_candidates]
