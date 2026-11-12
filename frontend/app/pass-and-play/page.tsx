/**
 * app/pass-and-play/page.tsx
 * ──────────────────────────
 * Redesigned Pass-and-Play (Party Hot-Seat Mode) for 'Catch Me If You Can?'.
 *
 * UX Goals:
 * 1. Clear Visual Hierarchy: Every screen answers:
 *    - Where am I?
 *    - What am I supposed to do?
 *    - What is happening right now?
 *    - What happens next?
 * 2. Playful Party Match Setup (Players 3-12, Auto/Manual Impostor, 4 Difficulties, Categories, Rounds, Chaos).
 * 3. Dramatic, Fool-Proof Secret Word Distribution (Curtain -> Reveal -> Memorise -> Handoff).
 * 4. Visual Turn Progression in Clue Phase with horizontal player step track.
 * 5. High-Impact Discussion & 2-Step Safe Secret Voting Booth.
 * 6. Rewarding Victory Celebration with XP, coin rewards, and Play Again loop.
 */
"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { sound } from "@/lib/sound";

type Stage = "setup" | "handoff" | "peek" | "clues" | "discussion" | "vote" | "final_guess" | "results";
type GameMode = "classic" | "double_trouble" | "undercover" | "mr_white" | "mystery_twist";

const CATEGORIES = [
  "Random",
  "Technology",
  "Food & Drinks",
  "Animals",
  "Everyday Objects",
  "Sports & Entertainment",
  "Places"
];

const DIFFICULTIES = [
  { id: "easy", name: "Easy", desc: "Common everyday objects & simple concepts" },
  { id: "medium", name: "Medium", desc: "Standard party vocabulary with good subtlety" },
  { id: "hard", name: "Hard", desc: "Clever, nuanced, and abstract concepts" },
  { id: "expert", name: "Expert", desc: "Rare, intricate, and high-difficulty words" }
] as const;

interface WordEntry {
  word: string;
  undercover: string;
  category: string;
  difficulty: string;
  hints: string[];
}

const LOCAL_FALLBACK_WORDS: Record<string, WordEntry[]> = {
  "Technology": [
    { word: "SMARTPHONE", undercover: "TABLET", category: "Technology", difficulty: "easy", hints: ["touch screen", "pocket sized", "cellular"] },
    { word: "LAPTOP", undercover: "DESKTOP", category: "Technology", difficulty: "medium", hints: ["keyboard", "hinge", "battery"] },
    { word: "BLOCKCHAIN", undercover: "DATABASE", category: "Technology", difficulty: "hard", hints: ["decentralized", "crypto", "immutable ledger"] },
    { word: "QUANTUM COMPUTER", undercover: "SUPERCOMPUTER", category: "Technology", difficulty: "expert", hints: ["qubits", "superposition", "cryogenic cooling"] }
  ],
  "Food & Drinks": [
    { word: "PIZZA", undercover: "BURGER", category: "Food & Drinks", difficulty: "easy", hints: ["slices", "crust", "cheese"] },
    { word: "SUSHI", undercover: "SASHIMI", category: "Food & Drinks", difficulty: "medium", hints: ["rice", "seaweed", "raw fish"] },
    { word: "CROISSANT", undercover: "BAGUETTE", category: "Food & Drinks", difficulty: "hard", hints: ["flaky", "butter layers", "french bakery"] },
    { word: "KOMBUCHA", undercover: "KEFIR", category: "Food & Drinks", difficulty: "expert", hints: ["fermented tea", "scoby", "effervescent probiotic"] }
  ],
  "Animals": [
    { word: "DOLPHIN", undercover: "WHALE", category: "Animals", difficulty: "easy", hints: ["blowhole", "ocean", "clicks and whistles"] },
    { word: "CHAMELEON", undercover: "IGUANA", category: "Animals", difficulty: "medium", hints: ["color changing", "swiveling eyes", "sticky tongue"] },
    { word: "PLATYPUS", undercover: "ECHIDNA", category: "Animals", difficulty: "hard", hints: ["duck bill", "egg laying mammal", "venomous spur"] },
    { word: "AXOLOTL", undercover: "SALAMANDER", category: "Animals", difficulty: "expert", hints: ["external gills", "regeneration", "mexican walking fish"] }
  ],
  "Everyday Objects": [
    { word: "UMBRELLA", undercover: "RAINCOAT", category: "Everyday Objects", difficulty: "easy", hints: ["opens up", "protects from rain", "canopy"] },
    { word: "THERMOS", undercover: "WATER BOTTLE", category: "Everyday Objects", difficulty: "medium", hints: ["vacuum insulated", "keeps liquids hot", "screw cap"] },
    { word: "METRONOME", undercover: "STOPWATCH", category: "Everyday Objects", difficulty: "hard", hints: ["rhythm", "ticking pendulum", "tempo pacing"] },
    { word: "KALEIDOSCOPE", undercover: "TELESCOPE", category: "Everyday Objects", difficulty: "expert", hints: ["mirrors", "geometric color patterns", "rotating tube"] }
  ],
  "Sports & Entertainment": [
    { word: "BASKETBALL", undercover: "VOLLEYBALL", category: "Sports & Entertainment", difficulty: "easy", hints: ["dribbling", "hoop", "orange ball"] },
    { word: "ARCHERY", undercover: "DARTS", category: "Sports & Entertainment", difficulty: "medium", hints: ["bow and arrow", "bullseye target", "quiver"] },
    { word: "CURLING", undercover: "SHUFFLEBOARD", category: "Sports & Entertainment", difficulty: "hard", hints: ["sweeping ice", "heavy stone", "winter olympics"] },
    { word: "BIATHLON", undercover: "TRIATHLON", category: "Sports & Entertainment", difficulty: "expert", hints: ["cross country skiing", "rifle marksmanship", "penalty laps"] }
  ],
  "Places": [
    { word: "AIRPORT", undercover: "TRAIN STATION", category: "Places", difficulty: "easy", hints: ["runway", "terminals", "boarding passes"] },
    { word: "LIGHTHOUSE", undercover: "WINDMILL", category: "Places", difficulty: "medium", hints: ["beacon of light", "rocky cliff", "guides ships"] },
    { word: "OBSERVATORY", undercover: "PLANETARIUM", category: "Places", difficulty: "hard", hints: ["telescope dome", "mountain peak", "stargazing"] },
    { word: "BIOSPHERE", undercover: "GREENHOUSE", category: "Places", difficulty: "expert", hints: ["sealed dome ecosystem", "controlled climate", "ecological experiment"] }
  ]
};

const CHAOS_CARDS = [
  { id: "one_word", name: "One-Word Wonder", emoji: "☝️", desc: "Your clue must be exactly ONE word only!" },
  { id: "rhyme_time", name: "Rhyme Time", emoji: "🎵", desc: "Your clue must rhyme or relate musically!" },
  { id: "speed_round", name: "Speed Blitz", emoji: "⚡", desc: "Speak fast without overthinking! 10-second limit." },
  { id: "opposite_day", name: "Opposite Day", emoji: "🙃", desc: "Describe what the secret word is NOT!" },
  { id: "abstract", name: "Abstract Emotion", emoji: "🎨", desc: "Describe using feelings or colors, not physical shapes!" }
];

const DEFAULT_AVATARS = ["🕵️", "🕵️‍♀️", "🕵️‍♂️", "🧙", "🥷", "🧑‍🚀", "🧑‍🚒", "🧑‍🎤", "🧑‍🔬", "🧑‍🍳", "🧝", "🧛"];

export default function PassAndPlayPage() {
  const router = useRouter();

  // Setup state
  const [playerCount, setPlayerCount] = useState(5);
  const [playerNames, setPlayerNames] = useState<string[]>([
    "Player 1", "Player 2", "Player 3", "Player 4", "Player 5"
  ]);
  const [impostorMode, setImpostorMode] = useState<"auto" | "manual">("auto");
  const [manualImpostors, setManualImpostors] = useState(1);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "expert">("medium");
  const [category, setCategory] = useState("Random");
  const [clueRounds, setClueRounds] = useState(1);
  const [enableChaos, setEnableChaos] = useState(false);
  const [gameMode, setGameMode] = useState<GameMode>("classic");

  // Match state
  const [stage, setStage] = useState<Stage>("setup");
  const [currentHandoffIdx, setCurrentHandoffIdx] = useState(0);
  const [impostorIndices, setImpostorIndices] = useState<Set<number>>(new Set([0]));
  const [secretWord, setSecretWord] = useState("SMARTPHONE");
  const [undercoverWord, setUndercoverWord] = useState("TABLET");
  const [selectedCategory, setSelectedCategory] = useState("Technology");

  // Gameplay state
  const [currentRound, setCurrentRound] = useState(1);
  const [currentCluePlayerIdx, setCurrentCluePlayerIdx] = useState(0);
  const [cluesList, setCluesList] = useState<{ round: number; player: string; avatar: string; clue: string }[]>([]);
  const [currentInputClue, setCurrentInputClue] = useState("");
  const [activeChaosCard, setActiveChaosCard] = useState<typeof CHAOS_CARDS[0] | null>(null);

  // Voting state (2-step voting for complete safety)
  const [votes, setVotes] = useState<Record<number, number>>({});
  const [currentVoterIdx, setCurrentVoterIdx] = useState(0);
  const [selectedSuspectIdx, setSelectedSuspectIdx] = useState<number | null>(null);
  const [eliminatedIdx, setEliminatedIdx] = useState<number | null>(null);
  const [guessInput, setGuessInput] = useState("");
  const [winner, setWinner] = useState<"innocents" | "impostor" | "mr_white">("innocents");
  const [winReason, setWinReason] = useState("");

  // Maximum allowed impostors leaving at least 2 normal players
  const maxAllowedImpostors = Math.max(1, playerCount - 2);

  // Compute effective impostor count
  const effectiveImpostorCount = useMemo(() => {
    if (gameMode === "double_trouble") {
      return Math.min(2, maxAllowedImpostors);
    }
    if (impostorMode === "auto") {
      return playerCount >= 8 ? Math.min(2, maxAllowedImpostors) : 1;
    }
    return Math.min(manualImpostors, maxAllowedImpostors);
  }, [gameMode, impostorMode, manualImpostors, maxAllowedImpostors, playerCount]);

  // Validation
  const isInvalidSetup = manualImpostors > maxAllowedImpostors && impostorMode === "manual";

  const handlePlayerCountChange = (count: number) => {
    sound.playClick();
    const clamped = Math.max(3, Math.min(12, count));
    setPlayerCount(clamped);
    const updatedNames = Array.from({ length: clamped }, (_, i) => playerNames[i] || `Player ${i + 1}`);
    setPlayerNames(updatedNames);
    if (manualImpostors > clamped - 2) {
      setManualImpostors(Math.max(1, clamped - 2));
    }
  };

  const startMatch = () => {
    if (isInvalidSetup) return;
    sound.playTurnChime();

    // Determine category
    let actualCategory = category;
    if (actualCategory === "Random") {
      const explicit = ["Technology", "Food & Drinks", "Animals", "Everyday Objects", "Sports & Entertainment", "Places"];
      actualCategory = explicit[Math.floor(Math.random() * explicit.length)];
    }
    setSelectedCategory(actualCategory);

    // Pick word pair
    const catWords = LOCAL_FALLBACK_WORDS[actualCategory] || LOCAL_FALLBACK_WORDS["Technology"];
    const matchedDiff = catWords.filter((w) => w.difficulty === difficulty);
    const pool = matchedDiff.length > 0 ? matchedDiff : catWords;
    const selected = pool[Math.floor(Math.random() * pool.length)];

    setSecretWord(selected.word);
    setUndercoverWord(selected.undercover);

    // Pick random Impostors
    const chosenIndices = new Set<number>();
    while (chosenIndices.size < effectiveImpostorCount) {
      const randIdx = Math.floor(Math.random() * playerCount);
      chosenIndices.add(randIdx);
    }
    setImpostorIndices(chosenIndices);

    // Draw chaos card if enabled or mystery mode
    if (enableChaos || gameMode === "mystery_twist") {
      setActiveChaosCard(CHAOS_CARDS[Math.floor(Math.random() * CHAOS_CARDS.length)]);
    } else {
      setActiveChaosCard(null);
    }

    setCurrentHandoffIdx(0);
    setCurrentRound(1);
    setCurrentCluePlayerIdx(0);
    setCluesList([]);
    setVotes({});
    setSelectedSuspectIdx(null);
    setStage("handoff");
  };

  const handleNextHandoff = () => {
    sound.playClick();
    if (currentHandoffIdx < playerCount - 1) {
      setCurrentHandoffIdx(currentHandoffIdx + 1);
      setStage("handoff");
    } else {
      // All players peeked their secret word
      sound.playTurnChime();
      setCurrentRound(1);
      setCurrentCluePlayerIdx(0);
      setStage("clues");
    }
  };

  const handleClueSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentInputClue.trim()) return;
    sound.playClick();

    const newClues = [
      ...cluesList,
      {
        round: currentRound,
        player: playerNames[currentCluePlayerIdx],
        avatar: DEFAULT_AVATARS[currentCluePlayerIdx % DEFAULT_AVATARS.length],
        clue: currentInputClue.trim()
      }
    ];
    setCluesList(newClues);
    setCurrentInputClue("");

    if (currentCluePlayerIdx < playerCount - 1) {
      setCurrentCluePlayerIdx(currentCluePlayerIdx + 1);
    } else {
      // Current round finished
      if (currentRound < clueRounds) {
        sound.playTurnChime();
        setCurrentRound(currentRound + 1);
        setCurrentCluePlayerIdx(0);
        if (enableChaos || gameMode === "mystery_twist") {
          setActiveChaosCard(CHAOS_CARDS[Math.floor(Math.random() * CHAOS_CARDS.length)]);
        }
      } else {
        // All rounds complete -> move to discussion
        sound.playSuspense();
        setStage("discussion");
      }
    }
  };

  const handleSelectSuspect = (targetIdx: number) => {
    if (targetIdx === currentVoterIdx) return;
    sound.playClick();
    setSelectedSuspectIdx(targetIdx);
  };

  const handleConfirmVote = () => {
    if (selectedSuspectIdx === null) return;
    sound.playClick();

    const updatedVotes = { ...votes, [currentVoterIdx]: selectedSuspectIdx };
    setVotes(updatedVotes);
    setSelectedSuspectIdx(null);

    if (currentVoterIdx < playerCount - 1) {
      setCurrentVoterIdx(currentVoterIdx + 1);
    } else {
      // All votes in! Tally outcome
      tallyVotesResult(updatedVotes);
    }
  };

  const tallyVotesResult = (allVotes: Record<number, number>) => {
    const tally: Record<number, number> = {};
    Object.values(allVotes).forEach((target) => {
      tally[target] = (tally[target] || 0) + 1;
    });

    let maxV = -1;
    let chosenIdx = 0;
    Object.entries(tally).forEach(([idxStr, count]) => {
      if (count > maxV) {
        maxV = count;
        chosenIdx = parseInt(idxStr);
      }
    });

    setEliminatedIdx(chosenIdx);

    if (impostorIndices.has(chosenIdx)) {
      // Caught an Impostor! Give final guess opportunity
      sound.playCaughtBuzzer();
      setStage("final_guess");
    } else {
      // Innocent voted out! Impostors win!
      sound.playVictory();
      setWinner("impostor");
      const impNames = Array.from(impostorIndices).map((i) => playerNames[i]).join(" & ");
      setWinReason(`The innocents voted out ${playerNames[chosenIdx]}! The Impostor (${impNames}) safely evaded capture.`);
      setStage("results");
    }
  };

  const handleFinalGuess = (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    const isCorrect = guessInput.trim().toUpperCase() === secretWord.toUpperCase();
    const caughtPlayerName = eliminatedIdx !== null ? playerNames[eliminatedIdx] : "The Impostor";

    if (isCorrect) {
      sound.playVictory();
      if (gameMode === "mr_white") {
        setWinner("mr_white");
        setWinReason(`Mr. White (${caughtPlayerName}) correctly guessed '${secretWord}' and scored an extraordinary DOUBLE WIN!`);
      } else {
        setWinner("impostor");
        setWinReason(`${caughtPlayerName} was caught, but correctly guessed the secret word '${secretWord}' to steal the victory!`);
      }
    } else {
      sound.playVictory();
      setWinner("innocents");
      setWinReason(`${caughtPlayerName} guessed '${guessInput}', but the secret word was '${secretWord}'. Innocents win!`);
    }
    setStage("results");
  };

  return (
    <main className="min-h-screen bg-game-dark text-white p-3 sm:p-6 md:p-8 flex flex-col items-center justify-center relative overflow-x-hidden">
      {/* Dynamic Background Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[500px] bg-gradient-to-b from-purple-900/25 via-cyan-900/10 to-transparent blur-3xl pointer-events-none" />

      {/* Top Banner & Context Nav */}
      <div className="w-full max-w-xl flex items-center justify-between mb-4 z-10">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { sound.playClick(); router.push("/"); }}
            className="text-xs font-semibold text-gray-400 hover:text-white px-2.5 py-1 rounded-lg hover:bg-gray-800 transition-colors"
          >
            ← Exit to Home
          </button>
          <span className="text-gray-600">|</span>
          <span className="font-bold text-game-accent text-xs sm:text-sm flex items-center gap-1.5">
            <span>📱</span> Pass & Play Party
          </span>
        </div>
        <span className="text-[11px] bg-purple-950 text-purple-200 border border-purple-800/80 px-2.5 py-0.5 rounded-full font-bold">
          3–12 Players Local
        </span>
      </div>

      {/* Main Game Card */}
      <div className="w-full max-w-xl bg-game-card/95 backdrop-blur-2xl border border-purple-800/50 rounded-3xl p-5 sm:p-7 shadow-2xl shadow-black/80 text-center relative z-10">

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE 1: MATCH SETUP                                             */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "setup" && (
          <div className="space-y-6 text-left">
            {/* Header */}
            <div className="text-center pb-2 border-b border-gray-800">
              <span className="text-xs font-bold text-game-gold uppercase tracking-widest">
                Step 1 of 4 · Match Setup
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
                Set Up Party Match
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                Customize your match settings below, then pass this single device between players!
              </p>
            </div>

            {/* SECTION 1: PLAYERS COUNT */}
            <div className="p-4 rounded-2xl bg-game-dark/80 border border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-black text-white uppercase tracking-wider block">
                    1. Number of Players
                  </label>
                  <p className="text-[11px] text-gray-400">Total friends playing in this match</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePlayerCountChange(playerCount - 1)}
                    disabled={playerCount <= 3}
                    className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white font-black text-sm flex items-center justify-center"
                  >
                    -
                  </button>
                  <span className="text-xl font-black text-game-accent px-1 font-mono">
                    {playerCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => handlePlayerCountChange(playerCount + 1)}
                    disabled={playerCount >= 12}
                    className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-30 text-white font-black text-sm flex items-center justify-center"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Number Buttons Selector */}
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5 pt-1">
                {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => handlePlayerCountChange(cnt)}
                    className={`py-2 rounded-xl font-black text-xs border transition-all ${
                      playerCount === cnt
                        ? "bg-game-accent border-game-accent text-white shadow-md shadow-game-accent/30 scale-105"
                        : "bg-game-card border-gray-800 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>

            {/* SECTION 2: IMPOSTORS COUNT */}
            <div className="p-4 rounded-2xl bg-game-dark/80 border border-gray-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-black text-white uppercase tracking-wider block">
                    2. Impostors Count
                  </label>
                  <p className="text-[11px] text-gray-400">
                    Currently: <span className="text-game-accent font-bold">{effectiveImpostorCount} Impostor{effectiveImpostorCount > 1 ? "s" : ""}</span> ({playerCount - effectiveImpostorCount} Innocents)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { sound.playClick(); setImpostorMode("auto"); }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    impostorMode === "auto"
                      ? "bg-purple-950 border-game-accent text-white shadow-sm"
                      : "bg-game-card border-gray-800 text-gray-400 hover:border-gray-700"
                  }`}
                >
                  <p className="font-bold text-xs text-white">⚡ Auto (Balanced)</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">1 for 3–7 players, 2 for 8+</p>
                </button>
                <button
                  type="button"
                  onClick={() => { sound.playClick(); setImpostorMode("manual"); }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    impostorMode === "manual"
                      ? "bg-purple-950 border-game-accent text-white shadow-sm"
                      : "bg-game-card border-gray-800 text-gray-400 hover:border-gray-700"
                  }`}
                >
                  <p className="font-bold text-xs text-white">🛠️ Custom Count</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">Choose manually</p>
                </button>
              </div>

              {impostorMode === "manual" && (
                <div className="pt-2">
                  <span className="text-xs text-gray-400 block mb-1.5">
                    Select number of Impostors (max {maxAllowedImpostors} to leave $\ge 2$ innocents):
                  </span>
                  <div className="flex gap-2">
                    {Array.from({ length: maxAllowedImpostors }, (_, idx) => idx + 1).map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => { sound.playClick(); setManualImpostors(val); }}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                          manualImpostors === val
                            ? "bg-game-accent border-game-accent text-white"
                            : "bg-game-card border-gray-800 text-gray-400"
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 3: GAME RULES & WORD SETTINGS */}
            <div className="p-4 rounded-2xl bg-game-dark/80 border border-gray-800 space-y-4">
              <label className="text-xs font-black text-white uppercase tracking-wider block">
                3. Game Rules & Vocabulary
              </label>

              {/* Difficulty */}
              <div>
                <span className="text-[11px] font-bold text-gray-400 block mb-1.5">
                  Vocabulary Difficulty:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => { sound.playClick(); setDifficulty(d.id); }}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        difficulty === d.id
                          ? "bg-purple-950 border-game-accent text-white shadow-md shadow-purple-950/40"
                          : "bg-game-card border-gray-800 text-gray-400 hover:border-gray-700"
                      }`}
                    >
                      <p className="font-bold text-xs text-white capitalize">{d.name}</p>
                      <p className="text-[9px] text-gray-400 mt-0.5 line-clamp-1">{d.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category & Rounds Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Word Category */}
                <div>
                  <span className="text-[11px] font-bold text-gray-400 block mb-1.5">
                    Word Category:
                  </span>
                  <select
                    className="game-input text-xs py-2.5"
                    value={category}
                    onChange={(e) => { sound.playClick(); setCategory(e.target.value); }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c === "Random" ? "🎲 Random (Surprise)" : c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Clue Rounds */}
                <div>
                  <span className="text-[11px] font-bold text-gray-400 block mb-1.5">
                    Clue Rounds ({clueRounds * playerCount} clues total):
                  </span>
                  <div className="grid grid-cols-5 gap-1">
                    {[1, 2, 3, 4, 5].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => { sound.playClick(); setClueRounds(r); }}
                        className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                          clueRounds === r
                            ? "bg-cyan-950 border-cyan-500 text-cyan-200"
                            : "bg-game-card border-gray-800 text-gray-400"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chaos Cards Toggle */}
              <div className="p-3 rounded-xl bg-game-card border border-gray-800 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>⚡</span> Chaos Cards Modifiers
                  </span>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Draws random twists (One-Word Only, Rhyme Time, Speed Blitz) each round!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { sound.playClick(); setEnableChaos(!enableChaos); }}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-black border transition-all ${
                    enableChaos || gameMode === "mystery_twist"
                      ? "bg-game-gold border-game-gold text-black shadow-md shadow-game-gold/30"
                      : "bg-gray-800 border-gray-700 text-gray-400"
                  }`}
                >
                  {enableChaos || gameMode === "mystery_twist" ? "ON" : "OFF"}
                </button>
              </div>

              {/* Rule Variant */}
              <div>
                <span className="text-[11px] font-bold text-gray-400 block mb-1.5">
                  Game Mode Variant:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => { sound.playClick(); setGameMode("classic"); }}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      gameMode === "classic" ? "bg-purple-950 border-game-accent text-white" : "bg-game-card border-gray-800 text-gray-400"
                    }`}
                  >
                    <p className="font-bold text-xs text-white">Classic</p>
                    <p className="text-[9px] text-gray-400">1 Impostor blind</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { sound.playClick(); setGameMode("undercover"); }}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      gameMode === "undercover" ? "bg-purple-950 border-cyan-400 text-white" : "bg-game-card border-gray-800 text-gray-400"
                    }`}
                  >
                    <p className="font-bold text-xs text-cyan-300">Undercover</p>
                    <p className="text-[9px] text-gray-400">Similar word</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => { sound.playClick(); setGameMode("mr_white"); }}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      gameMode === "mr_white" ? "bg-purple-950 border-game-gold text-white" : "bg-game-card border-gray-800 text-gray-400"
                    }`}
                  >
                    <p className="font-bold text-xs text-game-gold">Mr. White</p>
                    <p className="text-[9px] text-gray-400">Double Win</p>
                  </button>
                </div>
              </div>
            </div>

            {/* LIVE MATCH PREVIEW CARD */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/60 via-purple-900/30 to-game-card border border-purple-700/50 space-y-2.5">
              <div className="flex items-center justify-between border-b border-purple-800/40 pb-2">
                <span className="text-xs font-black text-game-gold uppercase tracking-wider flex items-center gap-1.5">
                  <span>📊</span> Match Preview
                </span>
                <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                  isInvalidSetup ? "bg-red-900/80 text-red-200 border border-red-700" : "bg-emerald-950 text-emerald-300 border border-emerald-600"
                }`}>
                  {isInvalidSetup ? "⚠️ Invalid Settings" : "✓ Ready to Launch"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-gray-400 block text-[10px]">Total Players</span>
                  <span className="font-black text-white text-sm">{playerCount}</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Impostors / Innocents</span>
                  <span className="font-black text-game-accent text-sm">
                    {effectiveImpostorCount} <span className="text-gray-500 font-normal">/</span> <span className="text-emerald-400">{playerCount - effectiveImpostorCount}</span>
                  </span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Clue Rounds</span>
                  <span className="font-black text-cyan-300 text-sm">{clueRounds} ({clueRounds * playerCount} clues)</span>
                </div>
                <div>
                  <span className="text-gray-400 block text-[10px]">Difficulty</span>
                  <span className="font-black text-amber-300 text-sm capitalize">{difficulty}</span>
                </div>
              </div>

              {isInvalidSetup && (
                <p className="text-xs text-red-300 bg-red-950/80 border border-red-700/60 p-2.5 rounded-xl">
                  ⚠️ Too many impostors! At least 2 innocent players must receive the secret word.
                </p>
              )}
            </div>

            {/* Player Names (Optional Quick Customization) */}
            <div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block mb-2">
                Player Codenames (Optional):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto pr-1">
                {playerNames.map((name, idx) => (
                  <input
                    key={idx}
                    className="game-input text-xs py-1.5"
                    value={name}
                    onChange={(e) => {
                      const updated = [...playerNames];
                      updated[idx] = e.target.value;
                      setPlayerNames(updated);
                    }}
                    placeholder={`Player ${idx + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* UNMISSABLE PRIMARY ACTION */}
            <button
              onClick={startMatch}
              disabled={isInvalidSetup}
              className="btn-primary w-full py-4 text-base sm:text-lg font-black tracking-wider uppercase shadow-xl shadow-game-accent/30 disabled:opacity-40"
            >
              🚀 Start Match
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE 2: PRIVACY CURTAIN (Device Handoff)                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "handoff" && (
          <div className="py-8 space-y-6 animate-fade-in">
            {/* Shield Graphic */}
            <div className="relative mx-auto w-24 h-24 rounded-3xl bg-purple-950/80 border-2 border-purple-600/50 flex items-center justify-center text-5xl shadow-xl shadow-purple-950/50 animate-bounce">
              🛡️
            </div>

            <div>
              <span className="text-xs font-bold text-game-gold uppercase tracking-widest">
                Step 2 of 4 · Secret Distribution
              </span>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider mt-1">
                Pass the device to:
              </p>
              <h2 className="text-3xl sm:text-4xl font-black text-white mt-1">
                {playerNames[currentHandoffIdx]}
              </h2>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/60 border border-red-800/60 text-xs text-red-200">
                <span>🙈</span> <strong>No Peeking!</strong> Make sure other players are looking away!
              </div>
            </div>

            {/* Reveal Action */}
            <button
              onClick={() => { sound.playTurnChime(); setStage("peek"); }}
              className="btn-primary px-8 py-4 text-base font-black tracking-wider uppercase shadow-xl shadow-game-accent/30"
            >
              👁️ Reveal My Secret Role
            </button>

            <p className="text-[11px] text-gray-500">
              Player {currentHandoffIdx + 1} of {playerCount}
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE 3: PRIVATE REVEAL CARD                                     */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "peek" && (
          <div className="py-6 space-y-6 animate-fade-in">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
              Private Secret for {playerNames[currentHandoffIdx]}
            </span>

            {/* Card Content based on Role */}
            {impostorIndices.has(currentHandoffIdx) ? (
              gameMode === "undercover" ? (
                /* Undercover Card */
                <div className="p-6 rounded-3xl bg-gradient-to-br from-cyan-950/60 to-game-card border-2 border-cyan-400 shadow-2xl shadow-cyan-500/20 space-y-3">
                  <span className="text-5xl block">👥</span>
                  <span className="text-xs font-black text-cyan-300 uppercase tracking-widest px-3 py-1 rounded-full bg-cyan-950 border border-cyan-700">
                    You are Undercover
                  </span>
                  <div>
                    <span className="text-xs text-gray-400 block">Your Secret Word is:</span>
                    <h3 className="text-3xl sm:text-4xl font-black text-white tracking-wider mt-1 text-cyan-300">
                      {undercoverWord}
                    </h3>
                  </div>
                  <p className="text-xs text-gray-300 max-w-sm mx-auto leading-relaxed">
                    Describe this word carefully! Your word is subtly different from the other players' word.
                  </p>
                </div>
              ) : gameMode === "mr_white" ? (
                /* Mr. White Card */
                <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-950/60 to-game-card border-2 border-game-gold shadow-2xl shadow-game-gold/20 space-y-3">
                  <span className="text-5xl block">👻</span>
                  <span className="text-xs font-black text-game-gold uppercase tracking-widest px-3 py-1 rounded-full bg-amber-950 border border-amber-700">
                    You are Mr. White (Ghost)
                  </span>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-white tracking-wider mt-1">
                      NO SECRET WORD
                    </h3>
                  </div>
                  <p className="text-xs text-gray-300 max-w-sm mx-auto leading-relaxed">
                    You know nothing! Listen to others, blend in, and fake your clues.
                    If caught during voting, guess the exact word for a <strong>DOUBLE WIN!</strong>
                  </p>
                </div>
              ) : (
                /* Classic Impostor Card */
                <div className="p-6 rounded-3xl bg-gradient-to-br from-red-950/70 to-game-card border-2 border-game-accent shadow-2xl shadow-game-accent/30 space-y-3">
                  <span className="text-5xl block">🦹</span>
                  <span className="text-xs font-black text-rose-300 uppercase tracking-widest px-3 py-1 rounded-full bg-red-950 border border-red-700">
                    {gameMode === "double_trouble" ? "You are a Double Trouble Impostor" : "You are The Impostor!"}
                  </span>
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black text-white tracking-wider mt-1">
                      NO SECRET WORD
                    </h3>
                  </div>
                  <p className="text-xs text-gray-300 max-w-sm mx-auto leading-relaxed">
                    You DO NOT know the word! Listen carefully to other players' clues, sound confident, and bluff to blend in!
                  </p>
                </div>
              )
            ) : (
              /* Innocent Citizen Card */
              <div className="p-6 rounded-3xl bg-gradient-to-br from-purple-950/70 to-game-card border-2 border-purple-500 shadow-2xl shadow-purple-500/20 space-y-3">
                <span className="text-5xl block">🕵️</span>
                <span className="text-xs font-black text-purple-300 uppercase tracking-widest px-3 py-1 rounded-full bg-purple-950 border border-purple-700">
                  You are an Innocent Citizen
                </span>
                <div>
                  <span className="text-xs text-gray-400 block">Category: {selectedCategory}</span>
                  <h3 className="text-3xl sm:text-4xl font-black text-game-gold tracking-widest mt-1">
                    {secretWord}
                  </h3>
                </div>
                <p className="text-xs text-gray-300 max-w-sm mx-auto leading-relaxed">
                  Memorise this word! When it's your turn, give a subtle clue describing it without giving it away to the Impostor.
                </p>
              </div>
            )}

            {/* Confirmation & Handoff Action */}
            <button
              onClick={handleNextHandoff}
              className="btn-secondary px-8 py-3.5 text-sm font-black tracking-wider uppercase hover:border-game-gold"
            >
              🔒 I've Memorised It — Lock & Pass →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE 4: CLUE SUBMISSION PHASE                                   */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "clues" && (
          <div className="space-y-5 text-left animate-fade-in">
            {/* Visual Turn Track */}
            <div className="p-3 rounded-2xl bg-game-dark/80 border border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-game-gold">
                  Clue Progress · Round {currentRound} of {clueRounds}
                </span>
                <span className="text-[10px] text-gray-400">
                  Player {currentCluePlayerIdx + 1} of {playerCount}
                </span>
              </div>

              {/* Turn Sequence Track */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {playerNames.map((name, idx) => {
                  const isCurrent = idx === currentCluePlayerIdx;
                  const isDone = idx < currentCluePlayerIdx;
                  return (
                    <div
                      key={idx}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold whitespace-nowrap transition-all ${
                        isCurrent
                          ? "bg-game-accent text-white shadow-md shadow-game-accent/30 scale-105 border border-rose-400"
                          : isDone
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                          : "bg-gray-800/60 text-gray-500 border border-gray-800"
                      }`}
                    >
                      <span>{isDone ? "✓" : isCurrent ? "⭐" : idx + 1}</span>
                      <span>{name}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active Chaos Modifier Banner if enabled */}
            {activeChaosCard && (
              <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-950/60 to-purple-950/60 border border-game-gold/50 flex items-center gap-3">
                <span className="text-3xl">{activeChaosCard.emoji}</span>
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-game-gold">
                    Active Chaos Modifier
                  </span>
                  <p className="text-xs font-bold text-white">{activeChaosCard.name}</p>
                  <p className="text-[11px] text-gray-300">{activeChaosCard.desc}</p>
                </div>
              </div>
            )}

            {/* Current Turn Hero Card */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/50 to-game-card border border-purple-800/40 text-center">
              <span className="text-3xl block mb-1">
                {DEFAULT_AVATARS[currentCluePlayerIdx % DEFAULT_AVATARS.length]}
              </span>
              <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">It is your turn</p>
              <h3 className="text-xl sm:text-2xl font-black text-game-gold mt-0.5">
                {playerNames[currentCluePlayerIdx]}
              </h3>
              <p className="text-xs text-gray-300 mt-1 max-w-sm mx-auto">
                Give a subtle 1-sentence clue about the secret word. (Impostors: bluff based on previous clues!)
              </p>
            </div>

            {/* Clue Input Form */}
            <form onSubmit={handleClueSubmit} className="space-y-3">
              <input
                className="game-input text-sm py-3 font-medium"
                placeholder={`Type ${playerNames[currentCluePlayerIdx]}'s subtle clue here…`}
                value={currentInputClue}
                onChange={(e) => setCurrentInputClue(e.target.value)}
                autoFocus
                required
              />
              <button
                type="submit"
                className="btn-primary w-full py-3.5 text-sm font-black uppercase tracking-wider shadow-lg shadow-game-accent/30"
              >
                Submit Clue 💬
              </button>
            </form>

            {/* Previous Clues in Feed */}
            {cluesList.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-gray-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                  Clues Given This Match ({cluesList.length})
                </span>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {cluesList.map((entry, idx) => (
                    <div key={idx} className="p-2.5 rounded-xl bg-game-dark border border-gray-800/80 text-xs flex items-start gap-2">
                      <span className="text-base">{entry.avatar}</span>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="font-bold text-game-accent">{entry.player}</span>
                          <span className="text-[10px] text-gray-500">Round {entry.round}</span>
                        </div>
                        <p className="text-gray-200">"{entry.clue}"</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE 5: DISCUSSION PHASE                                        */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "discussion" && (
          <div className="space-y-6 text-left animate-fade-in">
            <div className="text-center pb-2 border-b border-gray-800">
              <span className="text-4xl block mb-1">💬</span>
              <span className="text-xs font-bold text-game-gold uppercase tracking-widest">
                Step 3 of 4 · Debate
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-0.5">
                Discussion Phase
              </h2>
              <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                Review all clues below! Compare descriptions, spot inconsistencies, and decide who sounds like they're bluffing.
              </p>
            </div>

            {/* All Clues Feed */}
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {cluesList.map((entry, idx) => (
                <div key={idx} className="p-3 rounded-2xl bg-game-dark border border-purple-900/40 text-xs flex items-start gap-3">
                  <span className="text-2xl p-1.5 rounded-xl bg-purple-950/80 border border-purple-800/50">
                    {entry.avatar}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-game-gold text-sm">{entry.player}</span>
                      <span className="text-[10px] text-purple-300 font-bold px-2 py-0.5 rounded-full bg-purple-950 border border-purple-800">
                        Round {entry.round}
                      </span>
                    </div>
                    <p className="text-gray-200 text-xs sm:text-sm">"{entry.clue}"</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Transition to Voting */}
            <button
              onClick={() => {
                sound.playSuspense();
                setCurrentVoterIdx(0);
                setSelectedSuspectIdx(null);
                setStage("vote");
              }}
              className="btn-primary w-full py-4 text-base font-black uppercase tracking-wider shadow-xl shadow-game-accent/30"
            >
              🗳️ Ready to Accuse? Proceed to Secret Voting →
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE 6: SECRET VOTING BOOTH (2-Step Safe Voting)                */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "vote" && (
          <div className="space-y-5 text-left animate-fade-in">
            {/* Header */}
            <div className="text-center pb-2 border-b border-gray-800">
              <span className="text-xs font-bold text-game-gold uppercase tracking-widest">
                Step 4 of 4 · Secret Ballot
              </span>
              <p className="text-xs text-gray-400 mt-1">
                Pass device to: <strong className="text-white text-sm">{playerNames[currentVoterIdx]}</strong>
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-white mt-0.5">
                Who is the Impostor?
              </h3>
              <p className="text-xs text-gray-400">
                1. Tap your suspect. 2. Tap Confirm Vote. (Votes are kept secret until reveal!)
              </p>
            </div>

            {/* Selectable Player Cards Grid */}
            <div className="grid grid-cols-2 gap-2.5">
              {playerNames.map((name, idx) => {
                const isSelf = idx === currentVoterIdx;
                const isSelected = selectedSuspectIdx === idx;
                return (
                  <button
                    key={idx}
                    disabled={isSelf}
                    type="button"
                    onClick={() => handleSelectSuspect(idx)}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      isSelf
                        ? "opacity-30 border-gray-800 bg-game-dark cursor-not-allowed"
                        : isSelected
                        ? "bg-game-accent/25 border-2 border-game-accent text-white shadow-lg shadow-game-accent/20 scale-102"
                        : "bg-game-dark border-gray-800 hover:border-gray-600 text-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-2xl">{DEFAULT_AVATARS[idx % DEFAULT_AVATARS.length]}</span>
                      {isSelected && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-game-accent text-white">
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="font-bold text-sm text-white">
                      {name} {isSelf && "(You)"}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {isSelf ? "Cannot vote self" : isSelected ? "Tap confirm below" : "Tap to select"}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Two-Step Confirm Action */}
            <button
              onClick={handleConfirmVote}
              disabled={selectedSuspectIdx === null}
              className="btn-primary w-full py-3.5 text-sm sm:text-base font-black uppercase tracking-wider shadow-lg shadow-game-accent/30 disabled:opacity-40"
            >
              {selectedSuspectIdx !== null
                ? `🎯 Confirm Vote for ${playerNames[selectedSuspectIdx]}`
                : "Select a Player Above to Vote"}
            </button>

            <p className="text-[11px] text-gray-500 text-center">
              Voter {currentVoterIdx + 1} of {playerCount}
            </p>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE 7: FINAL GUESS (Caught Impostor Opportunity)               */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "final_guess" && (
          <div className="py-6 space-y-6 text-center animate-fade-in">
            <span className="text-6xl animate-pulse block">⚡</span>
            <div>
              <span className="text-xs font-black text-rose-400 uppercase tracking-widest px-3 py-1 rounded-full bg-red-950 border border-red-700">
                Impostor Caught!
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-2">
                One Last Chance to Steal Victory!
              </h2>
              <p className="text-xs text-gray-300 mt-2 max-w-sm mx-auto leading-relaxed">
                <strong>{eliminatedIdx !== null ? playerNames[eliminatedIdx] : "The Impostor"}</strong> was voted out!
                However, you get <strong>ONE guess</strong> to deduce the secret word from the clues you heard.
                A correct guess steals the win!
              </p>
            </div>

            <form onSubmit={handleFinalGuess} className="space-y-3 max-w-md mx-auto">
              <input
                className="game-input text-base text-center uppercase tracking-widest font-black py-3.5"
                placeholder="TYPE YOUR SECRET WORD GUESS…"
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                autoFocus
                required
              />
              <button
                type="submit"
                className="btn-primary w-full py-3.5 text-sm font-black uppercase tracking-wider shadow-xl shadow-game-accent/30"
              >
                ⚡ Submit Last Chance Guess
              </button>
            </form>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* STAGE 8: RESULTS & REWARD CELEBRATION                            */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {stage === "results" && (
          <div className="py-6 space-y-6 text-center animate-fade-in">
            {/* Victory Badge */}
            <span className="text-6xl sm:text-7xl block animate-bounce">
              {winner === "innocents" ? "🏆" : winner === "mr_white" ? "👻" : "🦹"}
            </span>

            <div>
              <h2 className={`text-3xl sm:text-4xl font-black tracking-wider ${
                winner === "innocents" ? "text-game-green" : winner === "mr_white" ? "text-game-gold" : "text-game-accent"
              }`}>
                {winner === "innocents" ? "Innocents Win!" : winner === "mr_white" ? "Mr. White Double Win!" : "Impostor Wins!"}
              </h2>
              <p className="text-xs sm:text-sm text-gray-300 mt-2 max-w-md mx-auto leading-relaxed">
                {winReason}
              </p>
            </div>

            {/* Revealed Secret Word Hero */}
            <div className="p-4 rounded-3xl bg-gradient-to-br from-purple-950/70 via-purple-900/40 to-game-card border-2 border-game-gold/60 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-game-gold">
                The Secret Word Was:
              </span>
              <h3 className="text-3xl sm:text-4xl font-black text-white tracking-widest font-mono">
                {secretWord}
              </h3>
              <p className="text-xs text-purple-300">Category: {selectedCategory}</p>

              {gameMode === "undercover" && (
                <div className="pt-2 border-t border-purple-800/40 flex items-center justify-between text-xs">
                  <span className="text-gray-400">Undercover Word:</span>
                  <span className="font-black text-cyan-300">{undercoverWord}</span>
                </div>
              )}
            </div>

            {/* Full Role Reveal Roster */}
            <div className="p-4 rounded-2xl bg-game-dark/80 border border-gray-800 text-left space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-2">
                True Player Identities
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {playerNames.map((name, idx) => {
                  const isImp = impostorIndices.has(idx);
                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-xl border flex items-center justify-between ${
                        isImp
                          ? "bg-red-950/50 border-game-accent/60 text-white"
                          : "bg-purple-950/40 border-purple-800/40 text-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{DEFAULT_AVATARS[idx % DEFAULT_AVATARS.length]}</span>
                        <span className="font-bold">{name}</span>
                      </div>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                        isImp ? "bg-red-900 text-rose-200" : "bg-purple-900 text-purple-200"
                      }`}>
                        {isImp ? (gameMode === "mr_white" ? "Mr. White" : "Impostor") : "Innocent"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rewards & Progression */}
            <div className="p-3.5 rounded-2xl bg-game-dark border border-gray-800 flex items-center justify-around text-xs">
              <div>
                <span className="text-game-gold font-black text-lg block">+150 XP</span>
                <span className="text-gray-400 text-[10px]">Match Experience</span>
              </div>
              <div className="h-6 w-[1px] bg-gray-800" />
              <div>
                <span className="text-cyan-400 font-black text-lg block">+50 🪙</span>
                <span className="text-gray-400 text-[10px]">Vault Coins</span>
              </div>
              <div className="h-6 w-[1px] bg-gray-800" />
              <div>
                <span className="text-emerald-400 font-black text-lg block">Master Detective</span>
                <span className="text-gray-400 text-[10px]">Badge Progression</span>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-2">
              <button
                onClick={() => {
                  sound.playClick();
                  startMatch();
                }}
                className="btn-primary w-full py-4 text-base font-black uppercase tracking-wider shadow-xl shadow-game-accent/30"
              >
                🔄 Play Again (Same Settings)
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { sound.playClick(); setStage("setup"); }}
                  className="btn-secondary py-3 text-xs font-bold"
                >
                  ⚙️ Change Match Setup
                </button>
                <button
                  onClick={() => { sound.playClick(); router.push("/"); }}
                  className="btn-secondary py-3 text-xs font-bold"
                >
                  🏠 Return to Home
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
