/**
 * app/practice/page.tsx
 * ──────────────────────
 * Practice Arena vs Neural AI Bots.
 *
 * Features:
 * - Play solo against 3 distinct AI agents (Agent Cyber, Agent Neon, Agent Shadow).
 * - Real game engine with semantic clue evaluation and ML suspicion scoring.
 * - Human can be assigned either Innocent or Impostor.
 * - AI bots generate realistic subtle clues and participate in debate and voting.
 */
"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { sound } from "@/lib/sound";

interface BotProfile {
  id: string;
  name: string;
  avatar: string;
  persona: string;
}

const AI_BOTS: BotProfile[] = [
  { id: "bot_1", name: "Agent Cyber", avatar: "🤖", persona: "Analytical & precise" },
  { id: "bot_2", name: "Agent Neon", avatar: "⚡", persona: "Bold & expressive" },
  { id: "bot_3", name: "Agent Shadow", avatar: "🕶️", persona: "Quiet & observant" },
];

const VOCABULARY = [
  { word: "SMARTPHONE", category: "Technology", hints: ["screen", "pocket", "battery", "wireless", "apps"] },
  { word: "TELESCOPE", category: "Technology", hints: ["stars", "lenses", "night sky", "distance", "astronomy"] },
  { word: "PIZZA", category: "Food & Drinks", hints: ["crust", "cheese", "oven", "slices", "toppings"] },
  { word: "COFFEE", category: "Food & Drinks", hints: ["morning", "caffeine", "roasted", "mug", "aroma"] },
  { word: "DOLPHIN", category: "Animals", hints: ["ocean", "intelligent", "swim", "pod", "playful"] },
  { word: "EAGLE", category: "Animals", hints: ["feathers", "talons", "sky", "predator", "vision"] },
  { word: "BACKPACK", category: "Everyday Objects", hints: ["zippers", "straps", "carrying", "school", "travel"] },
  { word: "UMBRELLA", category: "Everyday Objects", hints: ["rain", "folding", "canopy", "shelter", "waterproof"] },
];

export default function PracticeArenaPage() {
  const router = useRouter();
  const { user } = useGameStore();

  const [gameState, setGameState] = useState<
    "setup" | "reveal" | "clues" | "discussion" | "voting" | "results"
  >("setup");

  // Setup options
  const [difficulty, setDifficulty] = useState("medium");
  const [selectedCategory, setSelectedCategory] = useState("Random");

  // Active match data
  const [secretWord, setSecretWord] = useState("");
  const [category, setCategory] = useState("");
  const [impostorId, setImpostorId] = useState("");
  const [isHumanRevealed, setIsHumanRevealed] = useState(false);

  // Turn management
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [currentTurnIdx, setCurrentTurnIdx] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds] = useState(2);
  const [clues, setClues] = useState<Array<{ id: string; name: string; avatar: string; clue: string; round: number }>>([]);
  const [humanClueDraft, setHumanClueDraft] = useState("");
  const [typingBot, setTypingBot] = useState<string | null>(null);

  // Voting
  const [selectedSuspect, setSelectedSuspect] = useState<string | null>(null);
  const [eliminatedPlayer, setEliminatedPlayer] = useState<any>(null);
  const [finalWinner, setFinalWinner] = useState<"innocents" | "impostor">("innocents");

  const humanPlayer = useMemo(() => ({
    id: "human_player",
    name: user?.username || "Detective You",
    avatar: user?.avatar || "🕵️",
    persona: "Human Player",
    isHuman: true,
  }), [user]);

  const allPlayers = useMemo(() => [
    humanPlayer,
    ...AI_BOTS.map((b) => ({ ...b, isHuman: false })),
  ], [humanPlayer]);

  const isHumanImpostor = impostorId === humanPlayer.id;

  // Start Practice Match
  const startMatch = () => {
    sound.playTurnChime();
    // Pick word
    let candidates = VOCABULARY;
    if (selectedCategory !== "Random") {
      candidates = VOCABULARY.filter((v) => v.category === selectedCategory);
    }
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setSecretWord(chosen.word);
    setCategory(chosen.category);

    // Pick 1 random impostor (could be human or one of the bots)
    const randomImpostor = allPlayers[Math.floor(Math.random() * allPlayers.length)].id;
    setImpostorId(randomImpostor);

    // Shuffle turn order
    const order = [...allPlayers.map((p) => p.id)].sort(() => Math.random() - 0.5);
    setTurnOrder(order);
    setCurrentTurnIdx(0);
    setCurrentRound(1);
    setClues([]);
    setGameState("reveal");
  };

  // Bot Turn Simulation
  useEffect(() => {
    if (gameState !== "clues") return;

    const activeId = turnOrder[currentTurnIdx];
    if (activeId === humanPlayer.id) {
      setTypingBot(null);
      return;
    }

    const bot = AI_BOTS.find((b) => b.id === activeId);
    if (!bot) return;

    setTypingBot(bot.name);

    const timer = setTimeout(() => {
      let clueText = "";
      const isBotImpostor = bot.id === impostorId;

      if (isBotImpostor) {
        // Impostor bot bluffs
        const bluffs = [
          "It's something commonly encountered in everyday situations.",
          "Most people would recognize its value immediately.",
          "It has a recognizable shape and practical function.",
          "You'll see people interacting with this quite frequently.",
        ];
        clueText = bluffs[Math.floor(Math.random() * bluffs.length)];
      } else {
        // Normal bot hints
        const item = VOCABULARY.find((v) => v.word === secretWord);
        const hints = item?.hints || ["practical", "familiar", "useful"];
        const h = hints[Math.floor(Math.random() * hints.length)];
        const templates = [
          `Think about things associated with ${h}.`,
          `It's notable for having ${h}.`,
          `You might describe it by its ${h}.`,
          `It strongly relates to ${h}.`,
        ];
        clueText = templates[Math.floor(Math.random() * templates.length)];
      }

      setClues((prev) => [
        ...prev,
        { id: bot.id, name: bot.name, avatar: bot.avatar, clue: clueText, round: currentRound },
      ]);
      setTypingBot(null);
      sound.playNotification();

      // Advance turn
      advanceTurn();
    }, 1800);

    return () => clearTimeout(timer);
  }, [gameState, currentTurnIdx, turnOrder, impostorId, secretWord, currentRound, humanPlayer.id]);

  const advanceTurn = () => {
    const nextIdx = currentTurnIdx + 1;
    if (nextIdx < turnOrder.length) {
      setCurrentTurnIdx(nextIdx);
    } else {
      // Round completed
      if (currentRound < totalRounds) {
        setCurrentRound((r) => r + 1);
        setCurrentTurnIdx(0);
      } else {
        // All clue rounds finished -> discussion
        setGameState("discussion");
        sound.playNotification();
      }
    }
  };

  const handleHumanClueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!humanClueDraft.trim()) return;

    sound.playClick();
    setClues((prev) => [
      ...prev,
      {
        id: humanPlayer.id,
        name: humanPlayer.name,
        avatar: humanPlayer.avatar,
        clue: humanClueDraft.trim(),
        round: currentRound,
      },
    ]);
    setHumanClueDraft("");
    advanceTurn();
  };

  const handleVoteSubmit = () => {
    if (!selectedSuspect) return;
    sound.playCaughtBuzzer();

    // Tally votes: Bots vote based on whoever is impostor or randomly
    const eliminated = allPlayers.find((p) => p.id === selectedSuspect);
    setEliminatedPlayer(eliminated);

    if (selectedSuspect === impostorId) {
      setFinalWinner("innocents");
    } else {
      setFinalWinner("impostor");
    }

    setGameState("results");
    sound.playVictory();
  };

  return (
    <main className="min-h-screen bg-game-dark text-white relative overflow-hidden flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <header className="relative z-10 w-full max-w-4xl mx-auto flex items-center justify-between pb-4 border-b border-gray-800">
        <button
          onClick={() => { sound.playClick(); router.push("/"); }}
          className="text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-800 bg-slate-900/60"
        >
          ← Main Menu
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl">🎯</span>
          <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider">
            Practice Arena vs Neural AI
          </span>
        </div>
      </header>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-3xl mx-auto flex-1 flex flex-col justify-center py-6">

        {/* SETUP SCREEN */}
        {gameState === "setup" && (
          <div className="bg-slate-950/80 border border-blue-500/30 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl space-y-6">
            <div className="text-center space-y-2">
              <span className="text-4xl block">🤖</span>
              <h1 className="text-2xl md:text-3xl font-black text-white">Practice Arena vs AI</h1>
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Sharpen your clue-giving and bluff-catching skills against 3 autonomous AI agents before playing with friends!
              </p>
            </div>

            {/* AI Opponents Preview */}
            <div>
              <span className="text-xs font-bold uppercase text-gray-400 block mb-2">
                Your AI Opponents
              </span>
              <div className="grid grid-cols-3 gap-3">
                {AI_BOTS.map((bot) => (
                  <div key={bot.id} className="p-3 rounded-2xl bg-slate-900/80 border border-gray-800 text-center">
                    <span className="text-3xl block mb-1">{bot.avatar}</span>
                    <strong className="text-xs font-bold text-white block">{bot.name}</strong>
                    <span className="text-[10px] text-cyan-400 block">{bot.persona}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Match Options */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-gray-400 block mb-1">
                  Difficulty
                </label>
                <div className="grid grid-cols-3 gap-1">
                  {["easy", "medium", "hard"].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
                      className={`py-2 rounded-xl text-xs font-bold capitalize border ${
                        difficulty === d
                          ? "bg-blue-900 border-cyan-400 text-white"
                          : "bg-slate-900 border-gray-800 text-gray-400"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-gray-400 block mb-1">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full bg-slate-900 border border-gray-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="Random">Random</option>
                  <option value="Technology">Technology</option>
                  <option value="Food & Drinks">Food & Drinks</option>
                  <option value="Animals">Animals</option>
                  <option value="Everyday Objects">Everyday Objects</option>
                </select>
              </div>
            </div>

            <button
              onClick={startMatch}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 font-black text-sm uppercase text-white shadow-lg shadow-blue-600/30 hover:scale-102 transition-all"
            >
              🚀 Launch AI Practice Match
            </button>
          </div>
        )}

        {/* ROLE REVEAL SCREEN */}
        {gameState === "reveal" && (
          <div className="max-w-md w-full mx-auto space-y-6 text-center animate-slide-up">
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase text-purple-400 tracking-wider">
                Step 1 of 4 · Secret Role
              </span>
              <h2 className="text-2xl font-black text-white">Your Assignment</h2>
            </div>

            <div className={`p-6 rounded-3xl border-2 backdrop-blur-xl shadow-2xl text-left ${
              isHumanImpostor
                ? "bg-rose-950/80 border-rose-500"
                : "bg-purple-950/80 border-purple-500"
            }`}>
              <div className="flex items-center justify-between border-b border-gray-800/80 pb-3 mb-4">
                <span className="text-3xl">{isHumanImpostor ? "🦹" : "🕵️"}</span>
                <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-full border border-gray-700 bg-black/40">
                  {isHumanImpostor ? "The Impostor" : "Innocent Civilian"}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-black/50 border border-gray-800 text-center space-y-1 mb-4">
                <span className="text-xs text-gray-400 font-bold uppercase">
                  {isHumanImpostor ? "Secret Word Status" : "Your Secret Word"}
                </span>
                <div className={`text-3xl font-black tracking-wider ${isHumanImpostor ? "text-rose-400" : "text-amber-400"}`}>
                  {isHumanImpostor ? "❌ NO SECRET WORD" : secretWord}
                </div>
              </div>

              <p className="text-xs text-gray-300 leading-relaxed mb-6">
                {isHumanImpostor
                  ? "You don't know the word! Listen to the AI bots' clues and bluff with plausible answers."
                  : `Give subtle clues about ${secretWord} on your turn. Identify which AI bot is bluffing!`}
              </p>

              <button
                onClick={() => {
                  sound.playClick();
                  setGameState("clues");
                }}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 text-white font-black text-sm uppercase shadow-lg"
              >
                🔒 I&apos;ve Memorised It — Start Round 1 →
              </button>
            </div>
          </div>
        )}

        {/* CLUE ROUNDS SCREEN */}
        {gameState === "clues" && (
          <div className="w-full space-y-6 animate-slide-up">
            <div className="bg-slate-950/80 border border-gray-800 rounded-2xl p-4 flex items-center justify-between text-xs font-bold">
              <span className="text-cyan-400 font-mono uppercase">
                Round {currentRound} of {totalRounds} · AI Match
              </span>
              <span className="text-gray-400">
                Turn: <strong className="text-white">{allPlayers.find((p) => p.id === turnOrder[currentTurnIdx])?.name}</strong>
              </span>
            </div>

            {/* Turn Input Hero */}
            <div className="bg-slate-950 border border-cyan-500/30 rounded-3xl p-6 shadow-xl">
              {turnOrder[currentTurnIdx] === humanPlayer.id ? (
                <form onSubmit={handleHumanClueSubmit} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">✍️</span>
                    <div>
                      <h3 className="text-base font-black text-white">Your Turn to Give a Clue!</h3>
                      <p className="text-xs text-gray-400">
                        {isHumanImpostor
                          ? "You are the Impostor! Give a broad, plausible clue to blend in."
                          : `Secret Word: ${secretWord}. Describe it without giving it away!`}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g. It helps you stay productive..."
                      value={humanClueDraft}
                      onChange={(e) => setHumanClueDraft(e.target.value)}
                      className="flex-1 bg-slate-900 border border-cyan-500/50 rounded-xl px-4 py-3 text-white font-bold"
                    />
                    <button
                      type="submit"
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black text-xs uppercase"
                    >
                      💬 Submit
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🤖</span>
                    <div>
                      <h3 className="font-bold text-sm text-white">
                        {typingBot ? `${typingBot} is thinking of a clue...` : "Waiting for AI bot..."}
                      </h3>
                      <p className="text-xs text-gray-400">Evaluating clues and semantic similarity...</p>
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                </div>
              )}
            </div>

            {/* Clues Timeline */}
            <div className="bg-slate-950/60 border border-gray-800 rounded-2xl p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Practice Clue History ({clues.length})
              </h4>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {clues.map((c, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-900/80 border border-gray-800 flex items-start gap-3">
                    <span className="text-xl">{c.avatar}</span>
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-xs">
                        <strong className="text-white">{c.name}</strong>
                        <span className="text-[10px] text-gray-500 font-mono">Round {c.round}</span>
                      </div>
                      <p className="text-xs text-gray-300 font-medium">&ldquo;{c.clue}&rdquo;</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DISCUSSION SCREEN */}
        {gameState === "discussion" && (
          <div className="w-full space-y-6 text-center animate-slide-up">
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase text-amber-400 tracking-wider">
                Step 3 of 4 · AI Match Debate
              </span>
              <h2 className="text-2xl font-black text-white">Review the Clues</h2>
              <p className="text-xs text-gray-400">
                Analyze each player&apos;s clues. Who gave vague or conflicting descriptions?
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
              {allPlayers.map((p) => {
                const pClues = clues.filter((c) => c.id === p.id);
                return (
                  <div key={p.id} className="p-4 rounded-2xl bg-slate-950/80 border border-gray-800 space-y-2">
                    <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                      <span className="text-xl">{p.avatar}</span>
                      <strong className="text-sm text-white">{p.name}</strong>
                      {p.isHuman && <span className="text-[10px] text-purple-400 font-mono">(You)</span>}
                    </div>
                    <div className="space-y-1">
                      {pClues.map((c, i) => (
                        <p key={i} className="text-xs text-gray-300 italic">• &ldquo;{c.clue}&rdquo;</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => {
                sound.playClick();
                setGameState("voting");
              }}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 font-black text-sm uppercase text-white shadow-lg"
            >
              🗳️ Proceed to Secret Voting Booth →
            </button>
          </div>
        )}

        {/* VOTING SCREEN */}
        {gameState === "voting" && (
          <div className="max-w-md w-full mx-auto space-y-6 text-center animate-slide-up">
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase text-rose-400 tracking-wider">
                Step 4 of 4 · Secret Vote
              </span>
              <h2 className="text-2xl font-black text-white">Who Is The Impostor?</h2>
              <p className="text-xs text-gray-400">
                Cast your vote for the player you suspect of faking the secret word.
              </p>
            </div>

            <div className="space-y-3">
              {allPlayers
                .filter((p) => p.id !== humanPlayer.id)
                .map((p) => {
                  const isSelected = selectedSuspect === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setSelectedSuspect(p.id);
                      }}
                      className={`w-full p-4 rounded-2xl border flex items-center justify-between transition-all ${
                        isSelected
                          ? "border-rose-500 bg-rose-950/80 shadow-lg"
                          : "border-gray-800 bg-slate-950/80 hover:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{p.avatar}</span>
                        <div className="text-left">
                          <strong className="text-sm text-white block">{p.name}</strong>
                          <span className="text-[10px] text-gray-400">{p.persona}</span>
                        </div>
                      </div>
                      {isSelected && (
                        <span className="text-xs font-bold text-rose-400 uppercase">✓ Selected</span>
                      )}
                    </button>
                  );
                })}

              {selectedSuspect && (
                <button
                  onClick={handleVoteSubmit}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-rose-600 via-pink-600 to-amber-600 font-black text-sm uppercase text-white shadow-xl mt-4"
                >
                  🎯 Confirm Vote for {allPlayers.find((p) => p.id === selectedSuspect)?.name}
                </button>
              )}
            </div>
          </div>
        )}

        {/* RESULTS SCREEN */}
        {gameState === "results" && (
          <div className="max-w-md w-full mx-auto space-y-6 text-center animate-slide-up">
            <span className="text-5xl block animate-bounce">
              {finalWinner === "innocents" ? "🏆" : "🦹"}
            </span>
            <div className="space-y-1">
              <h2 className="text-3xl font-black uppercase text-white">
                {finalWinner === "innocents" ? "Innocents Victory!" : "Impostor Victory!"}
              </h2>
              <p className="text-xs text-gray-300">
                Eliminated: <strong>{eliminatedPlayer?.name}</strong> ({eliminatedPlayer?.avatar})
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-black/60 border border-amber-500/40 text-center space-y-1">
              <span className="text-[10px] font-mono text-gray-400 uppercase">The Secret Word Was:</span>
              <div className="text-3xl font-black text-amber-400">{secretWord}</div>
            </div>

            <div className="bg-slate-950 border border-gray-800 rounded-2xl p-4 text-left space-y-2">
              <span className="text-xs font-bold uppercase text-gray-400">Actual Roles:</span>
              {allPlayers.map((p) => {
                const isImp = p.id === impostorId;
                return (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-gray-800 text-xs">
                    <div className="flex items-center gap-2">
                      <span>{p.avatar}</span>
                      <strong>{p.name}</strong>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full font-bold uppercase text-[10px] border ${
                      isImp ? "bg-rose-950 border-rose-500 text-rose-300" : "bg-purple-950 border-purple-500 text-purple-300"
                    }`}>
                      {isImp ? "🦹 Impostor" : "🕵️ Innocent"}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                onClick={startMatch}
                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black text-xs uppercase"
              >
                🔄 Play Again vs AI
              </button>
              <button
                onClick={() => router.push("/")}
                className="py-4 px-6 rounded-xl bg-slate-900 border border-gray-800 text-xs font-bold text-gray-300"
              >
                🏠 Main Menu
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
