/**
 * components/game/GameModesExplorer.tsx
 * ──────────────────────────────────────
 * Interactive Game Modes Explorer.
 * Displays all 9 functional game modes with:
 * - Distinct visual identity & color scheme
 * - Short, plain-language description
 * - "How It Works" expandable preview with clear visual examples
 * - Direct "Play This Mode" action
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sound } from "@/lib/sound";

export interface GameModeDetail {
  id: string;
  name: string;
  badge: string;
  emoji: string;
  tagline: string;
  accentColor: string;
  borderColor: string;
  bgGradient: string;
  players: string;
  howItWorks: string[];
  example: {
    secretWord: string;
    impostorKnows: string;
    whatHappens: string;
  };
  supportedIn: "both" | "local" | "online" | "solo";
}

export const OFFICIAL_GAME_MODES: GameModeDetail[] = [
  {
    id: "classic",
    name: "Classic Impostor",
    badge: "Party Favorite",
    emoji: "🕵️",
    tagline: "The original secret-word deception game.",
    accentColor: "text-game-accent",
    borderColor: "border-game-accent/50",
    bgGradient: "from-red-950/40 via-purple-950/30 to-game-card",
    players: "3–12 Players",
    howItWorks: [
      "Everyone receives the secret word except 1 Impostor.",
      "Players take turns describing the word with subtle clues.",
      "The Impostor listens, bluffs, and tries to blend in.",
      "Vote to catch the Impostor. If caught, they get one final guess to steal the win!"
    ],
    example: {
      secretWord: "SMARTPHONE",
      impostorKnows: "NO WORD (Must fake clues)",
      whatHappens: "Innocents say 'pocket sized' and 'has apps'. Impostor bluffs 'has a screen' to avoid suspicion!"
    },
    supportedIn: "both"
  },
  {
    id: "double_trouble",
    name: "Double Trouble",
    badge: "2 Impostors",
    emoji: "👯",
    tagline: "Two impostors who do not know each other's identity!",
    accentColor: "text-pink-400",
    borderColor: "border-pink-500/50",
    bgGradient: "from-pink-950/40 via-purple-950/30 to-game-card",
    players: "6–12 Players",
    howItWorks: [
      "Two players are randomly assigned as Impostors.",
      "Neither impostor knows who their partner is!",
      "Impostors might accidentally vote against each other.",
      "Innocents must catch both to secure total victory."
    ],
    example: {
      secretWord: "PIZZA",
      impostorKnows: "NO WORD (Both impostors blind)",
      whatHappens: "Impostor A suspects Impostor B, not realizing they are on the same side!"
    },
    supportedIn: "both"
  },
  {
    id: "undercover",
    name: "Undercover",
    badge: "Mind-Bending",
    emoji: "👥",
    tagline: "The Impostor gets a similar word and thinks they are innocent!",
    accentColor: "text-cyan-400",
    borderColor: "border-cyan-500/50",
    bgGradient: "from-cyan-950/40 via-purple-950/30 to-game-card",
    players: "4–12 Players",
    howItWorks: [
      "Civilians get one word; the Undercover player gets a closely related word.",
      "The Undercover player honestly thinks they are an Innocent Citizen!",
      "Subtle differences in clues spark hilarious arguments and confusion.",
      "Watch for clues that describe a slightly different item!"
    ],
    example: {
      secretWord: "PIZZA (Civilians)",
      impostorKnows: "BURGER (Undercover Word)",
      whatHappens: "Civilian says 'baked in an oven'. Undercover says 'grilled on a stove'. Debate erupts!"
    },
    supportedIn: "both"
  },
  {
    id: "mr_white",
    name: "Mr. White (The Ghost)",
    badge: "High Stakes",
    emoji: "👻",
    tagline: "Zero clues. Guess the word if caught for an instant Double Win!",
    accentColor: "text-game-gold",
    borderColor: "border-game-gold/50",
    bgGradient: "from-amber-950/40 via-purple-950/30 to-game-card",
    players: "4–12 Players",
    howItWorks: [
      "Mr. White receives absolutely zero word or category information.",
      "They must give completely neutral clues to stay under the radar.",
      "If voted out, Mr. White can immediately guess the exact secret word.",
      "A correct guess awards a rare and triumphant DOUBLE WIN!"
    ],
    example: {
      secretWord: "AIRPORT",
      impostorKnows: "ABSOLUTELY NOTHING",
      whatHappens: "Mr. White is caught, but deduces 'AIRPORT' from flight clues and steals the match!"
    },
    supportedIn: "both"
  },
  {
    id: "ai_takeover",
    name: "AI Takeover",
    badge: "ML-Powered",
    emoji: "🤖",
    tagline: "Humans vs Neural AI Bots that learn semantics in real-time.",
    accentColor: "text-emerald-400",
    borderColor: "border-emerald-500/50",
    bgGradient: "from-emerald-950/40 via-purple-950/30 to-game-card",
    players: "3–8 Players",
    howItWorks: [
      "AI Bots join the match using miniLM semantic neural embeddings.",
      "AI Impostors analyze human clues to narrow down the secret word.",
      "AI Civilians craft subtle hints with vocabulary distance checks.",
      "Can humans out-bluff artificial intelligence?"
    ],
    example: {
      secretWord: "GUITAR",
      impostorKnows: "AI Neural Semantic Model",
      whatHappens: "CipherBot computes high cosine similarity to 'instruments' and submits a convincing clue!"
    },
    supportedIn: "both"
  },
  {
    id: "team_battle",
    name: "Team Battle",
    badge: "Squad Clash",
    emoji: "⚔️",
    tagline: "Red vs Blue squad clash with undercover Infiltrators.",
    accentColor: "text-indigo-400",
    borderColor: "border-indigo-500/50",
    bgGradient: "from-indigo-950/40 via-purple-950/30 to-game-card",
    players: "6–12 Players",
    howItWorks: [
      "Players are split into Red Squad and Blue Squad.",
      "Each squad has an undercover Infiltrator sabotaging clues.",
      "Teams compete to protect their word while identifying the spy in their midst.",
      "Highest surviving squad score takes the match."
    ],
    example: {
      secretWord: "TELESCOPE",
      impostorKnows: "Infiltrator sabotaging Red Team",
      whatHappens: "Red Infiltrator gives a misleading clue that points suspicion toward an innocent teammate!"
    },
    supportedIn: "both"
  },
  {
    id: "mystery_twist",
    name: "Mystery Twist",
    badge: "Chaos Mode",
    emoji: "🌀",
    tagline: "Wild Chaos Cards shake up communication rules every round!",
    accentColor: "text-purple-400",
    borderColor: "border-purple-500/50",
    bgGradient: "from-fuchsia-950/40 via-purple-950/30 to-game-card",
    players: "3–12 Players",
    howItWorks: [
      "A random Chaos Card activates at the start of every clue round.",
      "Modifiers include: One-Word Clues Only, Rhyme Time, Reverse Turns, or Speed Blitz.",
      "Forces players to think creatively and makes bluffing even wilder.",
      "Unexpected rules test true mastery of word association."
    ],
    example: {
      secretWord: "CHOCOLATE",
      impostorKnows: "Active Chaos: One-Word Only",
      whatHappens: "Everyone can only say ONE word! Impostor must guess the vibe in a single syllable."
    },
    supportedIn: "both"
  },
  {
    id: "daily_challenge",
    name: "Daily Challenge",
    badge: "Global Puzzle",
    emoji: "📅",
    tagline: "Global daily secret word puzzle with leaderboard scoring.",
    accentColor: "text-amber-300",
    borderColor: "border-amber-500/50",
    bgGradient: "from-yellow-950/40 via-purple-950/30 to-game-card",
    players: "1–6 Players",
    howItWorks: [
      "One new curated secret word challenge refreshes globally every 24 hours.",
      "Solve the puzzle with minimum clues to maximize daily leaderboard points.",
      "Compare your deduction streak and score with friends worldwide.",
      "Earn exclusive daily cosmetic badges."
    ],
    example: {
      secretWord: "Daily Secret #42",
      impostorKnows: "Global leaderboard seed",
      whatHappens: "Complete the deduction in 1 clue round to score maximum 1000 daily points!"
    },
    supportedIn: "both"
  },
  {
    id: "practice_arena",
    name: "Practice Arena",
    badge: "Solo Training",
    emoji: "🎯",
    tagline: "Train clue subtlety against AI with live semantic feedback.",
    accentColor: "text-teal-400",
    borderColor: "border-teal-500/50",
    bgGradient: "from-teal-950/40 via-purple-950/30 to-game-card",
    players: "Solo Mode",
    howItWorks: [
      "Practice alone at your own pace against neural AI bots.",
      "Get instant semantic feedback on every clue: Is it Too Obvious? Balanced? Or Too Vague?",
      "Learn how neural models infer associations from subtle clues.",
      "Perfect warm-up before joining friends in live party matches."
    ],
    example: {
      secretWord: "MICROSCOPE",
      impostorKnows: "Solo Sandbox",
      whatHappens: "Enter 'lab tool' -> AI rates similarity 0.42 (BALANCED: Perfect subtle clue!)."
    },
    supportedIn: "solo"
  }
];

export default function GameModesExplorer() {
  const router = useRouter();
  const [selectedMode, setSelectedMode] = useState<GameModeDetail | null>(null);

  const openMode = (mode: GameModeDetail) => {
    sound.playClick();
    setSelectedMode(mode);
  };

  const closeModal = () => {
    sound.playClick();
    setSelectedMode(null);
  };

  const handlePlayMode = (mode: GameModeDetail) => {
    sound.playClick();
    setSelectedMode(null);
    router.push("/pass-and-play");
  };

  return (
    <section className="w-full max-w-5xl mx-auto my-12 px-4 text-left">
      {/* Section Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-6 gap-2">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-game-gold flex items-center gap-1.5">
            <span>🎮</span> Explore Gameplay
          </span>
          <h2 className="text-2xl md:text-3xl font-black text-white mt-1">
            9 Playable Game Modes
          </h2>
          <p className="text-xs md:text-sm text-gray-400 mt-1 max-w-xl">
            From classic deception to mind-bending undercover twists and high-stakes ghost matches.
            Tap any mode to see how it works!
          </p>
        </div>
      </div>

      {/* Grid of 9 Modes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {OFFICIAL_GAME_MODES.map((mode) => (
          <div
            key={mode.id}
            onClick={() => openMode(mode)}
            className={`group p-4 rounded-2xl border ${mode.borderColor} bg-gradient-to-br ${mode.bgGradient}
                       hover:scale-[1.02] hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col justify-between`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-3xl group-hover:scale-110 transition-transform">{mode.emoji}</span>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-purple-900/60 text-purple-200 border border-purple-700/50">
                  {mode.badge}
                </span>
              </div>
              <h3 className={`font-black text-base text-white group-hover:${mode.accentColor} transition-colors`}>
                {mode.name}
              </h3>
              <p className="text-xs text-gray-300 mt-1 leading-snug">
                {mode.tagline}
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-800/60 flex items-center justify-between text-[11px]">
              <span className="text-gray-400 font-medium">{mode.players}</span>
              <span className={`${mode.accentColor} font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform`}>
                How it works →
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Detail / How It Works Modal */}
      {selectedMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-lg bg-game-card border border-purple-700/50 rounded-3xl p-6 shadow-2xl text-white space-y-5 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-gray-800 pb-4">
              <div className="flex items-center gap-3">
                <span className="text-4xl p-2 rounded-2xl bg-purple-950/60 border border-purple-800/40">
                  {selectedMode.emoji}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black text-white">{selectedMode.name}</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-200 border border-purple-700/50">
                      {selectedMode.badge}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedMode.players}</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="w-8 h-8 rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Tagline */}
            <p className="text-sm font-semibold text-game-gold italic">
              "{selectedMode.tagline}"
            </p>

            {/* How It Works List */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-2.5 flex items-center gap-1.5">
                <span>📖</span> Rule Breakdown
              </h4>
              <ul className="space-y-2">
                {selectedMode.howItWorks.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 text-xs text-gray-200">
                    <span className="w-5 h-5 rounded-full bg-purple-900/80 text-purple-300 font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Example Scenario Card */}
            <div className="p-4 rounded-2xl bg-game-dark/80 border border-gray-800 space-y-2 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block mb-1">
                💡 Match Example
              </span>
              <div className="flex justify-between border-b border-gray-800/80 pb-1">
                <span className="text-gray-400">Secret Word:</span>
                <span className="font-bold text-white">{selectedMode.example.secretWord}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800/80 pb-1">
                <span className="text-gray-400">Impostor Info:</span>
                <span className="font-bold text-rose-400">{selectedMode.example.impostorKnows}</span>
              </div>
              <div className="pt-1 text-gray-300 leading-snug">
                <span className="font-semibold text-game-gold">What happens:</span> {selectedMode.example.whatHappens}
              </div>
            </div>

            {/* Action Bar */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={closeModal}
                className="btn-secondary flex-1 py-3 text-xs font-bold"
              >
                Close
              </button>
              <button
                onClick={() => handlePlayMode(selectedMode)}
                className="btn-primary flex-1 py-3 text-xs font-bold shadow-lg shadow-game-accent/30"
              >
                🎮 Play {selectedMode.name} →
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
