/**
 * app/lobby/[code]/page.tsx
 * ──────────────────────────
 * Pre-game lobby waiting room.
 * Shows all players who have joined, their ready status,
 * allows the host to customize Match Setup (Mode, Impostors, Difficulty, Category, Rounds, Chaos),
 * and allows the host to start the game.
 */
"use client";

import { useEffect, useCallback, useState, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { connectSocket, getSocket } from "@/lib/socket";
import { getToken } from "@/lib/api";
import { sound } from "@/lib/sound";
import type { Player } from "@/types/game.types";

const ALL_MODES = [
  { id: "classic", name: "Classic Impostor", emoji: "🕵️", desc: "1 Impostor, guess word if caught" },
  { id: "double_trouble", name: "Double Trouble", emoji: "👯", desc: "2 Impostors who don't know each other" },
  { id: "undercover", name: "Undercover", emoji: "👥", desc: "Impostor gets similar secret word" },
  { id: "mr_white", name: "Mr. White", emoji: "👻", desc: "No word, Double Win on word guess" },
  { id: "ai_takeover", name: "AI Takeover", emoji: "🤖", desc: "Play with smart semantic AI bots" },
  { id: "team_battle", name: "Team Battle", emoji: "⚔️", desc: "Red vs Blue with secret infiltrators" },
  { id: "mystery_twist", name: "Mystery Twist", emoji: "🌀", desc: "Chaos Cards active every round" },
  { id: "daily_challenge", name: "Daily Challenge", emoji: "📅", desc: "Global daily secret word" },
  { id: "practice_arena", name: "Practice Arena", emoji: "🎯", desc: "Training mode with AI bots" }
];

const CATEGORIES = [
  "Random",
  "Technology",
  "Food & Drinks",
  "Animals",
  "Everyday Objects",
  "Sports & Entertainment",
  "Places"
];

const DIFFICULTIES = ["easy", "medium", "hard", "expert"] as const;

export default function LobbyRoomPage() {
  const router = useRouter();
  const params = useParams();
  const code = (params.code as string)?.toUpperCase();

  const { user, players, setPlayers, room } = useGameStore();

  // Host match setup state
  const [selectedMode, setSelectedMode] = useState("classic");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "expert">("medium");
  const [category, setCategory] = useState("Random");
  const [impostorMode, setImpostorMode] = useState<"auto" | "manual">("auto");
  const [manualImpostors, setManualImpostors] = useState(1);
  const [clueRounds, setClueRounds] = useState(2);
  const [enableChaos, setEnableChaos] = useState(false);

  const setupSocket = useCallback(() => {
    if (!user || !code) return;

    const token = getToken();
    const socket = connectSocket(token || undefined);

    // Join this lobby room
    socket.emit("lobby_join", {
      room_code: code,
      user_id: user.id,
      username: user.username,
      avatar: user.avatar,
    });

    // Listen for lobby state updates
    socket.on("lobby:state", (data: { players: Player[]; room_code: string }) => {
      setPlayers(data.players);
    });

    // Listen for game start
    socket.on("game:match_started", () => {
      router.push(`/game/${code}`);
    });

    socket.on("game:phase_changed", (data: { phase: string }) => {
      if (data.phase === "briefing" || data.phase === "role_reveal") {
        router.push(`/game/${code}`);
      }
    });

    socket.on("error", (data: { message: string }) => {
      console.error("Socket error:", data.message);
    });

    return () => {
      socket.off("lobby:state");
      socket.off("game:match_started");
      socket.off("game:phase_changed");
      socket.off("error");
    };
  }, [user, code, setPlayers, router]);

  useEffect(() => {
    if (!user) {
      router.push("/");
      return;
    }
    const cleanup = setupSocket();
    return cleanup;
  }, [user, router, setupSocket]);

  const setReady = (isReady: boolean) => {
    sound.playClick();
    getSocket()?.emit("lobby_ready", { ready: isReady });
  };

  const isHost = room?.host_id === user?.id || players.length === 1 || (players.length > 0 && players[0].user_id === user?.id);
  const myPlayer = players.find((p) => p.user_id === user?.id);
  const allReady = players.length >= 2 && players.every((p) => p.is_ready);

  const maxAllowedImpostors = Math.max(1, players.length - 2);
  const effectiveImpostors = useMemo(() => {
    if (selectedMode === "double_trouble") return Math.min(2, maxAllowedImpostors);
    if (impostorMode === "auto") {
      return players.length >= 8 ? Math.min(2, maxAllowedImpostors) : 1;
    }
    return Math.min(manualImpostors, maxAllowedImpostors);
  }, [selectedMode, impostorMode, players.length, maxAllowedImpostors, manualImpostors]);

  const startGame = () => {
    sound.playTurnChime();
    getSocket()?.emit("game_start", {
      mode: selectedMode,
      category,
      difficulty,
      impostor_count: impostorMode === "auto" ? null : manualImpostors,
      clue_rounds: clueRounds,
      enable_chaos: enableChaos || selectedMode === "mystery_twist",
    });
  };

  return (
    <main className="min-h-screen p-4 md:p-8 bg-game-dark text-white flex flex-col items-center">
      <div className="max-w-2xl w-full space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div>
            <h1 className="text-2xl font-black text-game-gold flex items-center gap-2">
              <span>🕵️</span> Online Match Lobby
            </h1>
            <p className="text-gray-400 text-xs">Share room code to invite teammates:</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-3xl font-black text-game-accent tracking-widest font-mono">
                {code}
              </span>
              <button
                onClick={() => {
                  sound.playClick();
                  navigator.clipboard.writeText(code || "");
                }}
                className="text-xs text-gray-400 hover:text-white border border-gray-700
                           rounded px-2.5 py-1 transition-colors bg-game-card hover:bg-gray-800"
              >
                📋 Copy
              </button>
            </div>
          </div>
          <div className="text-right text-xs text-gray-400">
            <span className="px-3 py-1 rounded-full bg-purple-950 border border-purple-800 text-purple-200 font-bold">
              {players.length} / 12 Connected
            </span>
          </div>
        </div>

        {/* Player Roster */}
        <div className="game-card">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-300 mb-3 flex items-center justify-between">
            <span>Players Roster</span>
            <span className="text-[10px] text-gray-500 font-normal">Min 2 to start</span>
          </h2>
          <div className="space-y-2">
            {players.length === 0 ? (
              <p className="text-gray-400 text-xs text-center py-4">
                Connecting to room server…
              </p>
            ) : (
              players.map((player) => (
                <div
                  key={player.sid}
                  className="flex items-center justify-between p-3 rounded-xl
                             bg-game-dark/80 border border-gray-800 hover:border-gray-700 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{player.avatar}</span>
                    <div>
                      <p className="font-bold text-xs text-white">
                        {player.username}
                        {player.user_id === user?.id && (
                          <span className="text-game-accent text-[10px] ml-1.5 font-bold">(You)</span>
                        )}
                        {player.is_bot && (
                          <span className="text-cyan-400 text-[10px] ml-1.5 font-semibold">🤖 Bot</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                      player.is_ready
                        ? "bg-emerald-950/80 border-emerald-600 text-emerald-300"
                        : "bg-gray-800/80 border-gray-700 text-gray-400"
                    }`}
                  >
                    {player.is_ready ? "✓ Ready" : "Waiting…"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Host Match Configuration Panel */}
        {isHost && (
          <div className="game-card space-y-4 text-left border border-purple-800/60 shadow-xl shadow-purple-950/30">
            <div className="flex items-center justify-between border-b border-gray-800 pb-2">
              <h3 className="text-sm font-bold text-game-gold flex items-center gap-1.5 uppercase tracking-wider">
                <span>⚙️</span> Match Rules (Host Controls)
              </h3>
              <span className="text-[10px] text-purple-300 bg-purple-900/50 px-2 py-0.5 rounded-full border border-purple-700">
                You are Host
              </span>
            </div>

            {/* Mode selection */}
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                Game Mode
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ALL_MODES.slice(0, 6).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { sound.playClick(); setSelectedMode(m.id); }}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      selectedMode === m.id
                        ? "bg-purple-950 border-game-accent text-white shadow-sm"
                        : "bg-game-dark border-gray-800 text-gray-400 hover:border-gray-700"
                    }`}
                  >
                    <p className="font-bold text-xs text-white flex items-center gap-1">
                      <span>{m.emoji}</span> {m.name}
                    </p>
                    <p className="text-[9px] text-gray-400 mt-0.5 line-clamp-1">{m.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Difficulty & Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Difficulty
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => { sound.playClick(); setDifficulty(d); }}
                      className={`py-1.5 rounded-lg text-xs font-bold capitalize border transition-all ${
                        difficulty === d
                          ? "bg-purple-900 border-game-accent text-white"
                          : "bg-game-dark border-gray-800 text-gray-400 hover:border-gray-700"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Word Category
                </label>
                <select
                  className="game-input text-xs py-1.5"
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
            </div>

            {/* Impostor & Rounds */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Impostors: <span className="text-game-accent font-bold">{effectiveImpostors}</span>
                  </label>
                  <span className="text-[10px] text-gray-500">
                    Innocents: {Math.max(2, players.length - effectiveImpostors)}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { sound.playClick(); setImpostorMode("auto"); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      impostorMode === "auto"
                        ? "bg-purple-900 border-game-accent text-white"
                        : "bg-game-dark border-gray-800 text-gray-400"
                    }`}
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => { sound.playClick(); setImpostorMode("manual"); }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                      impostorMode === "manual"
                        ? "bg-purple-900 border-game-accent text-white"
                        : "bg-game-dark border-gray-800 text-gray-400"
                    }`}
                  >
                    Manual ({manualImpostors})
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Clue Rounds: <span className="text-cyan-400 font-bold">{clueRounds}</span>
                </label>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => { sound.playClick(); setClueRounds(r); }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        clueRounds === r
                          ? "bg-cyan-950 border-cyan-500 text-cyan-200"
                          : "bg-game-dark border-gray-800 text-gray-400"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Chaos Cards Toggle */}
            <div className="p-2.5 rounded-xl bg-game-dark border border-gray-800 flex items-center justify-between">
              <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <span>⚡</span> Chaos Cards Modifiers
              </span>
              <button
                type="button"
                onClick={() => { sound.playClick(); setEnableChaos(!enableChaos); }}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all ${
                  enableChaos || selectedMode === "mystery_twist"
                    ? "bg-game-gold border-game-gold text-black shadow-sm"
                    : "bg-gray-800 border-gray-700 text-gray-400"
                }`}
              >
                {enableChaos || selectedMode === "mystery_twist" ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        )}

        {/* Ready / Start Action Bar */}
        <div className="flex gap-3">
          {!myPlayer?.is_ready ? (
            <button onClick={() => setReady(true)} className="btn-primary flex-1 py-3 text-sm font-bold">
              ✓ I'm Ready
            </button>
          ) : (
            <button onClick={() => setReady(false)} className="btn-secondary flex-1 py-3 text-sm font-bold">
              Not Ready
            </button>
          )}

          {isHost && (
            <button
              onClick={startGame}
              disabled={!allReady}
              className="btn-primary flex-1 py-3 text-sm font-bold shadow-lg shadow-game-accent/30 disabled:opacity-40"
            >
              {allReady ? "🚀 Start Match" : `Need ${Math.max(2, 2 - players.length)} More Ready`}
            </button>
          )}
        </div>

        {isHost && !allReady && players.length >= 2 && (
          <p className="text-gray-400 text-xs text-center">
            All players must click "I'm Ready" before the host can launch the match.
          </p>
        )}
      </div>
    </main>
  );
}
