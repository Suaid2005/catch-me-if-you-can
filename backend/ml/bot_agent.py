"""
ml/bot_agent.py
────────────────
Phase 1: Rule-based AI bot decision engine.
Upgraded to ML (PyTorch) in Milestone 10.

A bot is given:
- Its assigned role (impostor / civilian / detective)
- Its persona (talkative, quiet, aggressive, etc.)
- The current game phase and chat history

It returns a decision: what to say or do next.
"""
import random
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ── Bot Personas ──────────────────────────────────────────────────

PERSONAS = {
    "talkative": {
        "chat_frequency": 0.8,   # 80% chance to send a message each turn
        "response_delay": (1, 4), # seconds before replying
        "traits": ["friendly", "curious", "chatty"],
    },
    "quiet": {
        "chat_frequency": 0.2,
        "response_delay": (5, 12),
        "traits": ["reserved", "observant", "careful"],
    },
    "aggressive": {
        "chat_frequency": 0.6,
        "response_delay": (1, 3),
        "traits": ["accusatory", "bold", "confrontational"],
    },
    "analytical": {
        "chat_frequency": 0.5,
        "response_delay": (3, 8),
        "traits": ["logical", "methodical", "data-driven"],
    },
    "nervous": {
        "chat_frequency": 0.4,
        "response_delay": (2, 6),
        "traits": ["anxious", "defensive", "over-explains"],
    },
}

# ── Chat Templates by Role and Phase ─────────────────────────────

CHAT_TEMPLATES = {
    "civilian": {
        "gameplay": [
            "Has anyone noticed anything suspicious?",
            "I've been watching carefully. What do others think?",
            "Let's stay calm and think this through.",
            "I don't know who to trust right now...",
            "Anyone have a solid lead?",
            "I haven't seen anything weird yet.",
        ],
        "voting": [
            "I think we should vote for {target}.",
            "My gut says {target} is acting strange.",
            "Let's not rush this vote.",
            "I'm not sure, but {target} has been quiet...",
            "I'll vote whoever the group decides.",
        ],
    },
    "detective": {
        "gameplay": [
            "I've been paying close attention to the patterns here.",
            "Something doesn't add up. Can {target} explain their actions?",
            "The evidence points in an interesting direction.",
            "I need everyone to stay observant.",
            "I noticed something, but I need more time to be sure.",
        ],
        "voting": [
            "Based on what I've observed, {target} is suspicious.",
            "The timing of {target}'s responses is off.",
            "I have a strong feeling about this. Vote {target}.",
        ],
    },
    "impostor": {
        "gameplay": [
            "I've been watching too — nothing suspicious on my end.",
            "We should focus on {target}, they've been acting weird.",
            "I agree with {other_player}.",
            "Let's not panic and think logically.",
            "I'm innocent! Why would I say anything if I wasn't?",
            "Has anyone checked on {target}? They went quiet.",
        ],
        "voting": [
            "I'm voting {target}. Something's off about them.",
            "Think about it — {target} has the most to gain.",
            "I hate to say it but... {target}.",
            "Let's get this over with. {target}.",
        ],
    },
}


class BotAgent:
    """
    Phase 1 rule-based bot. Upgraded to PyTorch in Milestone 10.
    """

    def __init__(self, bot_id: str, username: str, role_key: str):
        self.bot_id = bot_id
        self.username = username
        self.role_key = role_key
        self.persona_key = random.choice(list(PERSONAS.keys()))
        self.persona = PERSONAS[self.persona_key]
        logger.info(f"Bot {username} created with role={role_key}, persona={self.persona_key}")

    def should_speak(self) -> bool:
        """Decide if the bot should say something this turn."""
        return random.random() < self.persona["chat_frequency"]

    def get_response_delay(self) -> float:
        """Return a human-like delay in seconds before the bot responds."""
        lo, hi = self.persona["response_delay"]
        return random.uniform(lo, hi)

    def generate_message(
        self,
        phase: str,
        players: list[dict],
        chat_history: list[dict],
    ) -> Optional[str]:
        """
        Generate a contextual chat message.

        Returns the message string, or None if the bot decides to stay silent.
        """
        if not self.should_speak():
            return None

        # Pick a template for this role and phase
        templates = CHAT_TEMPLATES.get(self.role_key, {}).get(phase, [])
        if not templates:
            templates = CHAT_TEMPLATES["civilian"].get(phase, ["..."])

        template = random.choice(templates)

        # Fill in placeholders
        other_players = [p for p in players if p.get("username") != self.username]
        target = random.choice(other_players)["username"] if other_players else "someone"
        other_player = random.choice(other_players)["username"] if other_players else "them"

        message = template.format(target=target, other_player=other_player)
        return message

    def decide_vote(self, players: list[dict], chat_history: list[dict]) -> Optional[str]:
        """
        Decide who to vote for.

        Returns the username of the target, or None to abstain.

        Phase 1 logic (rule-based):
        - Impostor: vote the most suspicious-looking innocent
        - Detective: vote based on highest suspicion score
        - Civilian/Informant: vote randomly or follow the crowd
        """
        alive_others = [
            p for p in players
            if p.get("username") != self.username and p.get("is_alive", True)
        ]
        if not alive_others:
            return None

        if self.role_key == "impostor":
            # Avoid voting for other impostors (they don't know each other in this version)
            # Simple: vote the player with the loudest/most accusatory chat
            return self._vote_most_suspicious(alive_others, chat_history)
        elif self.role_key == "detective":
            # Vote whoever has the highest suspicion_score
            ranked = sorted(alive_others, key=lambda p: p.get("suspicion_score", 0), reverse=True)
            return ranked[0]["username"] if ranked else None
        else:
            # Civilian: follow the crowd or vote randomly
            if random.random() < 0.5 and chat_history:
                # Try to find the most accused player in recent chat
                return self._follow_crowd(alive_others, chat_history)
            return random.choice(alive_others)["username"]

    def _vote_most_suspicious(self, players: list[dict], chat_history: list[dict]) -> str:
        """Pick the player mentioned most in the chat as suspicious."""
        mention_counts: dict[str, int] = {}
        for entry in chat_history[-20:]:  # Look at last 20 messages
            msg = entry.get("message", "").lower()
            for p in players:
                name = p["username"].lower()
                if name in msg:
                    mention_counts[p["username"]] = mention_counts.get(p["username"], 0) + 1

        if mention_counts:
            return max(mention_counts, key=mention_counts.get)
        return random.choice(players)["username"]

    def _follow_crowd(self, players: list[dict], chat_history: list[dict]) -> str:
        """Vote whoever the crowd seems to be pointing at."""
        return self._vote_most_suspicious(players, chat_history)


# ── Bot Factory ───────────────────────────────────────────────────

BOT_NAMES = [
    "Shadow", "Cipher", "Nexus", "Volt", "Raven", "Echo",
    "Specter", "Nova", "Flux", "Wraith", "Pulse", "Glitch",
]

BOT_AVATARS = ["🤖", "👾", "🦾", "🧠", "⚡", "🌀", "🔮", "💀"]


def create_bot(role_key: str, existing_names: list[str]) -> dict:
    """Create a bot player dict ready to add to a game room."""
    name = random.choice([n for n in BOT_NAMES if n not in existing_names] or BOT_NAMES)
    avatar = random.choice(BOT_AVATARS)
    import uuid
    bot_id = f"bot_{uuid.uuid4().hex[:8]}"

    agent = BotAgent(bot_id=bot_id, username=name, role_key=role_key)

    return {
        "sid": bot_id,
        "user_id": None,
        "username": name,
        "avatar": avatar,
        "is_ready": True,
        "is_bot": True,
        "is_alive": True,
        "suspicion_score": 0.0,
        "agent": agent,  # The logic engine (not sent to clients)
    }
