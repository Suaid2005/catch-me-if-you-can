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

import { useEffect, useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useGameStore } from "@/lib/store";
import { sound } from "@/lib/sound";
import GameHeader from "@/components/ui/GameHeader";
import {
  PracticeSubmissionController,
  evaluateClue,
  PublicClue,
  PlayerSummary,
  VoteTallyResult,
} from "@/lib/practiceAi";

const Avatar3D = dynamic(() => import("@/components/ui/Avatar3D"), { ssr: false });

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
  // Technology
  { word: "SMARTPHONE", category: "Technology", hints: ["screen", "pocket", "battery", "wireless", "apps"] },
  { word: "TELESCOPE", category: "Technology", hints: ["stars", "lenses", "night sky", "distance", "astronomy"] },
  { word: "LAPTOP", category: "Technology", hints: ["keyboard", "portable", "screen", "charger", "trackpad"] },
  { word: "HEADPHONES", category: "Technology", hints: ["ears", "music", "audio", "wireless", "cables"] },
  { word: "ROBOT", category: "Technology", hints: ["metal", "sensors", "automated", "gears", "battery"] },
  // Food & Drinks
  { word: "PIZZA", category: "Food & Drinks", hints: ["crust", "cheese", "oven", "slices", "toppings"] },
  { word: "COFFEE", category: "Food & Drinks", hints: ["morning", "caffeine", "roasted", "mug", "aroma"] },
  { word: "ICE CREAM", category: "Food & Drinks", hints: ["cone", "frozen", "sweet", "vanilla", "summer"] },
  { word: "CHOCOLATE", category: "Food & Drinks", hints: ["cocoa", "sweet", "bar", "melting", "treat"] },
  { word: "LEMONADE", category: "Food & Drinks", hints: ["citrus", "sour", "ice", "summer", "yellow"] },
  // Animals
  { word: "DOLPHIN", category: "Animals", hints: ["ocean", "intelligent", "swim", "pod", "playful"] },
  { word: "EAGLE", category: "Animals", hints: ["feathers", "talons", "sky", "predator", "vision"] },
  { word: "ELEPHANT", category: "Animals", hints: ["trunk", "tusks", "giant", "ears", "safari"] },
  { word: "PENGUIN", category: "Animals", hints: ["antarctica", "waddle", "tuxedo", "ice", "flightless"] },
  { word: "TIGER", category: "Animals", hints: ["stripes", "paws", "predator", "roar", "jungle"] },
  // Everyday Objects
  { word: "BACKPACK", category: "Everyday Objects", hints: ["zippers", "straps", "carrying", "school", "travel"] },
  { word: "UMBRELLA", category: "Everyday Objects", hints: ["rain", "folding", "canopy", "shelter", "waterproof"] },
  { word: "SUNGLASSES", category: "Everyday Objects", hints: ["shades", "tinted", "summer", "glare", "eyes"] },
  { word: "WRISTWATCH", category: "Everyday Objects", hints: ["clock", "strap", "time", "ticking", "wrist"] },
  { word: "BICYCLE", category: "Everyday Objects", hints: ["pedals", "handlebars", "two wheels", "chain", "helmet"] },
  // Sports & Entertainment
  { word: "BASKETBALL", category: "Sports & Entertainment", hints: ["hoop", "orange ball", "dribble", "court", "sneakers"] },
  { word: "CINEMA", category: "Sports & Entertainment", hints: ["popcorn", "movie", "big screen", "seats", "dark room"] },
  { word: "ROLLERCOASTER", category: "Sports & Entertainment", hints: ["tracks", "loop", "amusement park", "screaming", "fast"] },
  { word: "CHESS", category: "Sports & Entertainment", hints: ["checkmate", "knights", "pawns", "black and white", "board"] },
  // Places
  { word: "LIBRARY", category: "Places", hints: ["books", "quiet", "shelves", "reading", "study"] },
  { word: "AIRPORT", category: "Places", hints: ["planes", "runway", "luggage", "boarding", "terminal"] },
  { word: "BEACH", category: "Places", hints: ["sand", "waves", "sun", "seashells", "ocean"] },
  { word: "CASTLE", category: "Places", hints: ["stone walls", "towers", "medieval", "kingdom", "moat"] },
];

export default function PracticeArenaPage() {
  const router = useRouter();
  const { user, addPracticeRewards, practiceProgression, progression } = useGameStore();

  const [gameState, setGameState] = useState<
    "setup" | "reveal" | "clues" | "discussion" | "voting" | "results"
  >("setup");

  // Setup options (Easy default)
  const [difficulty, setDifficulty] = useState("easy");
  const [selectedCategory, setSelectedCategory] = useState("Random");

  // Practice Progression State
  const [practiceReward, setPracticeReward] = useState<{
    xp: number;
    coins: number;
    breakdown: Record<string, number>;
  } | null>(null);
  const controllerRef = useRef<PracticeSubmissionController>(new PracticeSubmissionController("setup"));
  const [tallyResult, setTallyResult] = useState<VoteTallyResult | null>(null);
  const [votingError, setVotingError] = useState<string | null>(null);
  const [isSubmittingVote, setIsSubmittingVote] = useState(false);

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

  // 60-Second Clue Countdown Timer
  const [turnSecondsRemaining, setTurnSecondsRemaining] = useState(60);

  // Active match exit protection (warn before accidental tab closure or refresh)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (gameState !== "setup" && gameState !== "results") {
        e.preventDefault();
        e.returnValue = "An active match is in progress. Leaving now will abandon your game progress.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [gameState]);

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
    controllerRef.current.resetForNewMatch();
    controllerRef.current.setPhase("reveal");
    setPracticeReward(null);
    setTallyResult(null);
    setVotingError(null);
    setSelectedSuspect(null);
    setIsSubmittingVote(false);
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
        // Impostor bot bluffs with category-relevant statements without knowing secret word
        const categoryBluffs: Record<string, string[]> = {
          "Food & Drinks": [
            "It has a distinct flavor that people enjoy at meals.",
            "It is prepared in kitchens and served fresh.",
            "You can find this on many restaurant and cafe menus.",
            "It's a popular choice people consume during the day.",
          ],
          Technology: [
            "It is an electronic device people use for daily tasks.",
            "It relies on modern engineering and electrical power.",
            "It is an essential tool found in modern workplaces.",
            "People utilize its digital interface quite frequently.",
          ],
          Animals: [
            "It is a creature known for its natural habitat and behaviors.",
            "You can observe them in wildlife documentaries and nature reserves.",
            "It plays an important role within its wild ecosystem.",
            "It has distinctive physical traits suited for survival in nature.",
          ],
          "Everyday Objects": [
            "It is a practical item people keep within easy reach.",
            "You often find people using this in their routine activities.",
            "It serves an everyday function that is convenient and reliable.",
            "It is commonly found in most households and stores.",
          ],
          "Sports & Entertainment": [
            "It provides great recreation and excitement for spectators and players.",
            "People gather together to watch or compete in this activity.",
            "It requires focus, strategy, and coordinated movements.",
            "It is a popular pastime that draws enthusiastic fans.",
          ],
          Places: [
            "It is a notable destination where visitors spend meaningful time.",
            "People travel here for a specific experience or purpose.",
            "It features distinct architecture and recognized surroundings.",
            "It is marked on maps and frequented by travellers.",
          ],
        };

        const bluffs = categoryBluffs[category] || [
          "It's something commonly encountered in everyday situations.",
          "Most people would recognize its value immediately.",
          "It has a recognizable shape and practical function.",
          "You'll see people interacting with this quite frequently.",
        ];
        clueText = bluffs[Math.floor(Math.random() * bluffs.length)];
      } else {
        // Innocent bot hints: Natural phrasing referencing genuine word associations
        const item = VOCABULARY.find((v) => v.word === secretWord);
        const hints = item?.hints || ["practical", "familiar", "useful"];
        const h = hints[Math.floor(Math.random() * hints.length)];
        const templates = [
          `A key characteristic of this is its ${h}.`,
          `You immediately notice the ${h} when observing it.`,
          `It is widely recognized for having ${h}.`,
          `Its everyday function directly involves ${h}.`,
          `Think about something strongly defined by ${h}.`,
          `It prominently features ${h}.`,
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
        controllerRef.current.setPhase("discussion");
        setGameState("discussion");
        sound.playNotification();
      }
    }
  };

  // 60-second practice turn timer for human player
  useEffect(() => {
    if (gameState !== "clues") return;
    const isMyTurn = turnOrder[currentTurnIdx] === humanPlayer.id;
    if (!isMyTurn) {
      setTurnSecondsRemaining(60);
      return;
    }

    setTurnSecondsRemaining(60);
    const interval = setInterval(() => {
      setTurnSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setClues((cl) => [
            ...cl,
            {
              id: humanPlayer.id,
              name: humanPlayer.name,
              avatar: humanPlayer.avatar,
              clue: "[Time Expired - Skipped]",
              round: currentRound,
            },
          ]);
          advanceTurn();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameState, currentTurnIdx, turnOrder, humanPlayer.id, currentRound]);

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
    if (!selectedSuspect || isSubmittingVote) return;
    setIsSubmittingVote(true);
    setVotingError(null);
    sound.playClick();

    const publicClues: PublicClue[] = clues.map((c) => ({
      playerId: c.id,
      playerName: c.name,
      avatar: c.avatar,
      clueText: c.clue,
      round: c.round,
    }));

    const vocabItem = VOCABULARY.find((v) => v.word === secretWord);
    const hints = vocabItem?.hints || ["practical", "familiar", "useful"];

    const innocentSuspicionMap = new Map<string, number>();
    for (const candidate of allPlayers) {
      const candClues = clues.filter((c) => c.id === candidate.id);
      if (candClues.length === 0) {
        innocentSuspicionMap.set(candidate.id, 1.0);
      } else {
        let totalSuspicion = 0;
        for (const c of candClues) {
          const ev = evaluateClue(c.clue, secretWord, category, hints);
          totalSuspicion += ev.suspicionScore;
        }
        const avg = totalSuspicion / candClues.length;
        innocentSuspicionMap.set(candidate.id, Math.round(avg * 1000) / 1000);
      }
    }

    const playerSummaries: PlayerSummary[] = allPlayers.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      persona: p.persona,
    }));

    const botSummaries: PlayerSummary[] = AI_BOTS.map((b) => ({
      id: b.id,
      name: b.name,
      avatar: b.avatar,
      persona: b.persona,
    }));

    let rewardedData: { xp: number; coins: number } | null = null;

    const result = controllerRef.current.submitVote({
      humanVoter: humanPlayer,
      selectedSuspect,
      botProfiles: botSummaries,
      impostorId,
      secretWord,
      category,
      hints,
      allClues: publicClues,
      allPlayers: playerSummaries,
      innocentSuspicionMap,
      onReward: (xp, coins) => {
        rewardedData = { xp, coins };
      },
    });

    setIsSubmittingVote(false);

    if (result.status === "SUCCESS" && result.tallyResult) {
      setTallyResult(result.tallyResult);
      setFinalWinner(result.tallyResult.winner === "innocents" ? "innocents" : "impostor");
      const elim = allPlayers.find((p) => p.id === result.tallyResult?.eliminatedId) || null;
      setEliminatedPlayer(elim);

      const humanWon =
        (isHumanImpostor && result.tallyResult.winner === "impostor") ||
        (!isHumanImpostor && result.tallyResult.winner === "innocents");

      const rewardInfo = rewardedData as { xp: number; coins: number } | null;
      if (rewardInfo) {
        addPracticeRewards(rewardInfo.xp, rewardInfo.coins, {
          won: humanWon,
          role: isHumanImpostor ? "impostor" : "civilian",
          was_impostor: isHumanImpostor,
          difficulty,
        });

        const correctVote = !isHumanImpostor && selectedSuspect === impostorId;
        const breakdown: Record<string, number> = { base_completion: 75 };
        if (humanWon) {
          breakdown.victory = 100;
          if (isHumanImpostor) breakdown.role_bonus = 50;
        }
        if (correctVote) {
          breakdown.clean_vote = 25;
        }
        setPracticeReward({ xp: rewardInfo.xp, coins: rewardInfo.coins, breakdown });
      }

      setGameState("results");
      if (result.tallyResult.winner === "innocents") {
        sound.playVictory();
      } else {
        sound.playCaughtBuzzer();
      }
    } else {
      setVotingError(result.errorMessage || "Ballot validation failed. Please cast a fresh vote.");
      setSelectedSuspect(null);
      sound.playCaughtBuzzer();
    }
  };

  return (
    <main className="min-h-screen bg-game-dark text-white relative overflow-hidden flex flex-col justify-between p-4 md:p-8">
      {/* Top Header */}
      <GameHeader showBack={true} backHref="/" backLabel="Main Menu" />

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
                  <div key={bot.id} className="p-3 rounded-2xl bg-slate-900/80 border border-gray-800 text-center flex flex-col items-center">
                    <div className="mb-2">
                      <Avatar3D avatar={bot.avatar} name={bot.name} size="md" />
                    </div>
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
                  controllerRef.current.setPhase("clues");
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

              {/* 60s Timer Pill */}
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-black tracking-wider shadow-md ${
                turnSecondsRemaining <= 10
                  ? "border-rose-500 bg-rose-950/80 text-rose-300 shadow-rose-500/30 animate-pulse"
                  : turnSecondsRemaining <= 20
                  ? "border-amber-500 bg-amber-950/60 text-amber-300 shadow-amber-500/20"
                  : "border-cyan-500 bg-cyan-950/60 text-cyan-300 shadow-cyan-500/20"
              }`}>
                <span>⏱️</span>
                <span>{turnSecondsRemaining}s</span>
              </div>

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
            <div className="bg-slate-950/60 border border-gray-800 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Practice Clue History ({clues.length})
              </h4>
              {clues.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-3 text-center">
                  No clues submitted yet this round.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {clues.map((c, i) => (
                    <div
                      key={i}
                      className="p-2 sm:p-2.5 rounded-xl bg-slate-900/80 border border-gray-800/80 hover:border-gray-700/80 flex items-center gap-3 transition-colors"
                    >
                      <div className="shrink-0 flex items-center justify-center">
                        <Avatar3D
                          avatar={c.avatar}
                          name={c.name}
                          size="lg"
                          interactive={false}
                          animated={false}
                        />
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                        <div className="flex items-center gap-2 shrink-0">
                          <strong className="text-xs font-bold text-white tracking-tight truncate max-w-[110px]">
                            {c.name}
                          </strong>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800/90 text-cyan-400/90 font-mono shrink-0">
                            Round {c.round}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm text-gray-200 font-medium break-words leading-snug">
                            &ldquo;{c.clue}&rdquo;
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                      <Avatar3D avatar={p.avatar} name={p.name} size="sm" interactive={false} animated={false} />
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
                controllerRef.current.setPhase("voting");
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

            {votingError && (
              <div className="p-3 rounded-xl bg-rose-950/90 border border-rose-500 text-rose-300 text-xs flex items-center justify-between shadow-lg text-left">
                <span>⚠️ {votingError}</span>
                <button
                  onClick={() => setVotingError(null)}
                  className="text-rose-400 hover:text-white font-bold ml-2 text-sm"
                >
                  ✕
                </button>
              </div>
            )}

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
                          ? "border-rose-500 bg-rose-950/80 shadow-lg ring-2 ring-rose-400"
                          : "border-gray-800 bg-slate-950/80 hover:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar3D avatar={p.avatar} name={p.name} size="sm" interactive={false} animated={isSelected} />
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
                  disabled={isSubmittingVote}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-rose-600 via-pink-600 to-amber-600 font-black text-sm uppercase text-white shadow-xl mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingVote
                    ? "Submitting Ballots..."
                    : `🎯 Confirm Vote for ${allPlayers.find((p) => p.id === selectedSuspect)?.name}`}
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
              {tallyResult?.isTie && !tallyResult?.eliminatedId ? (
                <p className="text-xs text-amber-300 font-medium">
                  ⚡ Voting ended in an unbroken tie! The Impostor escaped undetected.
                </p>
              ) : (
                <div className="flex items-center justify-center gap-2 text-xs text-gray-300 pt-1">
                  <span>Eliminated:</span>
                  <Avatar3D avatar={eliminatedPlayer?.avatar} name={eliminatedPlayer?.name} size="sm" interactive={false} animated={false} />
                  <strong>{eliminatedPlayer?.name}</strong> ·{" "}
                  <span className={tallyResult?.wasImpostor ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                    {tallyResult?.wasImpostor ? "Caught Impostor!" : "Wrongfully Eliminated Innocent!"}
                  </span>
                </div>
              )}
              {tallyResult?.winReason && (
                <p className="text-[11px] text-gray-400 italic">
                  &ldquo;{tallyResult.winReason}&rdquo;
                </p>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-black/60 border border-amber-500/40 text-center space-y-1">
              <span className="text-[10px] font-mono text-gray-400 uppercase">The Secret Word Was:</span>
              <div className="text-3xl font-black text-amber-400">{secretWord}</div>
            </div>

            {/* Voting Breakdown & AI Analysis Card */}
            {tallyResult && (
              <div className="bg-slate-950 border border-purple-500/30 rounded-2xl p-4 text-left space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span className="text-xs font-bold uppercase text-purple-300 flex items-center gap-1.5">
                    <span>🗳️</span> Secret Voting Breakdown
                  </span>
                  <span className="text-[10px] font-mono text-gray-400">
                    {tallyResult.isTie ? "Tie Resolution" : "Plurality Elimination"}
                  </span>
                </div>

                {/* Vote counts per candidate */}
                <div className="grid grid-cols-2 gap-2">
                  {allPlayers.map((p) => {
                    const count = tallyResult.counts[p.id] ?? 0;
                    const isElim = tallyResult.eliminatedId === p.id;
                    return (
                      <div
                        key={p.id}
                        className={`p-2 rounded-xl border flex items-center justify-between text-xs ${
                          isElim
                            ? "bg-rose-950/40 border-rose-500/60 text-white"
                            : "bg-slate-900 border-gray-800 text-gray-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <Avatar3D avatar={p.avatar} name={p.name} size="sm" interactive={false} animated={false} />
                          <span className="truncate font-semibold">{p.name}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono font-bold text-xs ${
                            isElim ? "bg-rose-500 text-white" : "bg-gray-800 text-gray-300"
                          }`}
                        >
                          {count} {count === 1 ? "vote" : "votes"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Individual Ballots & AI Reasoning */}
                <div className="space-y-2 pt-2 border-t border-gray-800/80">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">
                    Individual Ballots & AI Evidence
                  </span>
                  {tallyResult.ballots.map((ballot, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-900/90 border border-gray-800/90 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <span className="font-bold text-white flex items-center gap-1.5">
                          <Avatar3D avatar={ballot.voterAvatar} name={ballot.voterName} size="sm" interactive={false} animated={false} />
                          <span>{ballot.voterName}</span>
                        </span>
                        <span className="text-gray-400 text-[11px] flex items-center gap-1">
                          <span>voted for</span>
                          <span className="font-bold text-amber-300 flex items-center gap-1">
                            <Avatar3D avatar={ballot.targetAvatar} name={ballot.targetName} size="sm" interactive={false} animated={false} />
                            <span>{ballot.targetName}</span>
                          </span>
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 italic bg-black/40 px-2 py-1 rounded">
                        &ldquo;{ballot.evidenceExplanation}&rdquo;
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Practice Mode Rewards Card */}
            {practiceReward && (
              <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/70 via-slate-900 to-slate-950 border border-purple-500/40 shadow-xl space-y-3 text-left">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                      Practice Match Rewards
                    </span>
                    <h3 className="text-base font-black text-white flex items-center gap-1.5">
                      <span>⭐</span> Level {(user && !user.is_guest ? practiceProgression : progression)?.level ?? 1} Detective
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="bg-purple-900/40 border border-purple-500/50 px-2.5 py-0.5 rounded-full text-xs font-black text-purple-300">
                      +{practiceReward.xp} XP
                    </span>
                    <span className="bg-amber-900/40 border border-amber-500/50 px-2.5 py-0.5 rounded-full text-xs font-black text-amber-300">
                      +{practiceReward.coins} 🪙
                    </span>
                  </div>
                </div>

                {/* Level progress bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-semibold text-gray-400">
                    <span>Level Progress</span>
                    <span>{Math.round(((((user && !user.is_guest ? practiceProgression : progression)?.xp ?? 0) % 250) / 250) * 100)}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-900 rounded-full overflow-hidden border border-gray-800">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-amber-400 rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(100, Math.max(5, ((((user && !user.is_guest ? practiceProgression : progression)?.xp ?? 0) % 250) / 250) * 100))}%` }}
                    />
                  </div>
                </div>

                {/* Breakdown */}
                <div className="grid grid-cols-2 gap-2 text-center text-[11px] pt-1">
                  <div className="bg-slate-900/90 rounded-lg p-1.5 border border-gray-800">
                    <span className="text-[10px] text-gray-400 block">Base Match</span>
                    <strong className="text-purple-300">+{practiceReward.breakdown.base_completion} XP</strong>
                  </div>
                  {practiceReward.breakdown.victory && (
                    <div className="bg-slate-900/90 rounded-lg p-1.5 border border-gray-800">
                      <span className="text-[10px] text-gray-400 block">Match Victory</span>
                      <strong className="text-emerald-300">+{practiceReward.breakdown.victory} XP</strong>
                    </div>
                  )}
                  {practiceReward.breakdown.role_bonus && (
                    <div className="bg-slate-900/90 rounded-lg p-1.5 border border-gray-800">
                      <span className="text-[10px] text-gray-400 block">Role Mastery</span>
                      <strong className="text-amber-300">+{practiceReward.breakdown.role_bonus} XP</strong>
                    </div>
                  )}
                  {practiceReward.breakdown.clean_vote && (
                    <div className="bg-slate-900/90 rounded-lg p-1.5 border border-gray-800">
                      <span className="text-[10px] text-gray-400 block">Clean Vote</span>
                      <strong className="text-cyan-300">+{practiceReward.breakdown.clean_vote} XP</strong>
                    </div>
                  )}
                </div>

                {/* Vault Direct Access CTA */}
                <button
                  onClick={() => {
                    sound.playClick();
                    router.push("/vault");
                  }}
                  className="w-full mt-3 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-600/30 to-purple-600/30 hover:from-amber-600/50 hover:to-purple-600/50 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 transition-all"
                >
                  <span>🛍️</span> Spend Coins in Cosmetic Vault →
                </button>
              </div>
            )}

            <div className="bg-slate-950 border border-gray-800 rounded-2xl p-4 text-left space-y-2">
              <span className="text-xs font-bold uppercase text-gray-400">Actual Roles:</span>
              {allPlayers.map((p) => {
                const isImp = p.id === impostorId;
                return (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-gray-800 text-xs">
                    <div className="flex items-center gap-2.5">
                      <Avatar3D avatar={p.avatar} name={p.name} size="sm" interactive={false} animated={false} />
                      <strong className="text-white">{p.name}</strong>
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

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={startMatch}
                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-black text-xs uppercase"
              >
                🔄 Play Again vs AI
              </button>
              <button
                onClick={() => {
                  sound.playClick();
                  router.push("/vault");
                }}
                className="py-4 px-5 rounded-xl bg-gradient-to-r from-purple-900/60 to-amber-900/60 border border-amber-500/40 text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5"
              >
                <span>🛍️</span> Cosmetic Vault
              </button>
              <button
                onClick={() => router.push("/")}
                className="py-4 px-5 rounded-xl bg-slate-900 border border-gray-800 text-xs font-bold text-gray-300"
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
