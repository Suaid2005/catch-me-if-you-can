/**
 * app/game/[roomId]/page.tsx
 * ───────────────────────────
 * Authoritative Real-Time Online Multiplayer Game Room for 'Catch Me If You Can?'.
 *
 * Complete Synchronized Lifecycle:
 * 1. Role Reveal Screen (Private word delivered solely to each player)
 * 2. Real-Time Clue Rounds with Visual Progress Track Chips & Live Typing Indicators
 * 3. Grouped Clue Discussion with Live Suspicion Chat
 * 4. Safe 2-Step Secret Voting Booth (Misclick-Proof & Private)
 * 5. Dramatic Elimination & Caught Impostor Final Word Steal
 * 6. Synchronized Results Celebration & Return to Lobby Replay Loop
 */
"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useGameStore } from "@/lib/store";
import { connectSocket, getSocket } from "@/lib/socket";
import { getToken } from "@/lib/api";
import { sound } from "@/lib/sound";
import type { Player, Role } from "@/types/game.types";

const Avatar3D = dynamic(() => import("@/components/ui/Avatar3D"), { ssr: false });

interface RoleAssignment {
  role: string;
  card_title: string;
  secret_word: string | null;
  description: string;
  is_impostor: boolean;
}

interface ClueEntry {
  sid: string;
  username: string;
  clue: string;
  round: number;
  evaluation?: {
    similarity?: number;
    verdict?: string;
  };
}

interface ChatEntry {
  sid: string;
  username: string;
  avatar: string;
  message: string;
  suspicion_score?: number;
}

interface PlayerReward {
  xp_earned: number;
  coins_earned: number;
  breakdown: Record<string, number>;
  current_xp?: number;
  current_coins?: number;
  level?: number;
  level_progress_pct?: number;
  new_total_xp?: number;
  new_total_coins?: number;
  level_info?: {
    level: number;
    title?: string;
    xp_in_level?: number;
    xp_to_next?: number;
    pct?: number;
  };
}

interface FinalResult {
  match_id?: string;
  winner: string;
  secret_word: string;
  win_reason?: string;
  player_assignments: Record<string, any>;
  rewards?: Record<string, PlayerReward>;
  guessed_word?: string;
  is_correct?: boolean;
}

export default function OnlineGamePage() {
  const router = useRouter();
  const params = useParams();
  const roomId = (params.roomId as string)?.toUpperCase();

  const { user, players, setPlayers, addRewards, syncAuthoritativeRewards } = useGameStore();
  const [mySid, setMySid] = useState<string | null>(null);
  const lastHandledMatchIdRef = useRef<string | null>(null);

  // Authoritative Match State
  const [phase, setPhase] = useState<
    "role_reveal" | "clues" | "discussion" | "voting" | "final_guess" | "results"
  >("role_reveal");
  const [roleData, setRoleData] = useState<RoleAssignment | null>(null);
  const [roleAcknowledged, setRoleAcknowledged] = useState(false);
  const [roleAckProgress, setRoleAckProgress] = useState({ acks: 0, total: 0 });

  const [category, setCategory] = useState("Random");
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(2);
  const [turnOrder, setTurnOrder] = useState<string[]>([]);
  const [currentTurnSid, setCurrentTurnSid] = useState<string | null>(null);
  const [chaosCard, setChaosCard] = useState<any>(null);

  // Clues & Timeline
  const [allClues, setAllClues] = useState<ClueEntry[]>([]);
  const [myClueDraft, setMyClueDraft] = useState("");
  const [typingPlayer, setTypingPlayer] = useState<string | null>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Discussion & Chat
  const [chatMessages, setChatMessages] = useState<ChatEntry[]>([]);
  const [chatDraft, setChatDraft] = useState("");

  // Voting
  const [selectedSuspectSid, setSelectedSuspectSid] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [voteProgress, setVoteProgress] = useState({ cast: 0, needed: 0 });
  const [eliminatedSid, setEliminatedSid] = useState<string | null>(null);
  const [eliminationInfo, setEliminationInfo] = useState<any>(null);

  // Final Guess & Results
  const [finalGuessDraft, setFinalGuessDraft] = useState("");
  const [finalGuessImpostorSid, setFinalGuessImpostorSid] = useState<string | null>(null);
  const [gameResult, setGameResult] = useState<FinalResult | null>(null);

  // Authoritative 60-Second Clue Timer & Leave Modal State
  const [turnExpiresAt, setTurnExpiresAt] = useState<number | null>(null);
  const [turnRemainingSeconds, setTurnRemainingSeconds] = useState<number>(60);
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false);

  // Active match exit protection (warn before accidental tab closure or refresh)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (phase !== "results") {
        e.preventDefault();
        e.returnValue = "An active multiplayer match is in progress. Leaving now will abandon the match.";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [phase]);

  // Setup Real-Time Socket Connection
  const setupGameSocket = useCallback(() => {
    if (!user || !roomId) return;

    const token = getToken();
    const socket = connectSocket(token || undefined);
    setMySid(socket.id || null);

    const joinPayload = {
      room_code: roomId,
      user_id: user.id,
      username: user.username,
      avatar: user.avatar,
      token: token || undefined,
    };

    // Ensure socket is joined to this room and request match sync with authentication token
    socket.emit("lobby_join", joinPayload);
    socket.emit("game_request_sync", {
      room_code: roomId,
      user_id: user.id,
      username: user.username,
      token: token || undefined,
    });

    socket.on("connect", () => {
      setMySid(socket.id || null);
      socket.emit("lobby_join", joinPayload);
      socket.emit("game_request_sync", {
        room_code: roomId,
        user_id: user.id,
        username: user.username,
        token: token || undefined,
      });
    });

    // 1. Private Role Delivery
    socket.on("game:role_assigned", (data: RoleAssignment) => {
      setRoleData(data);
      sound.playTurnChime();
    });

    // 2. Public Match Setup & Recovery Sync
    socket.on("game:match_started", (data: any) => {
      lastHandledMatchIdRef.current = null;
      if (data.players) setPlayers(data.players);
      setCategory(data.category || "Random");
      setCurrentRound(data.current_round || 1);
      setTotalRounds(data.total_rounds || 2);
      setTurnOrder(data.turn_order || []);
      setCurrentTurnSid(data.current_turn_sid || null);
      setChaosCard(data.chaos_card || null);
      if (data.phase) setPhase(data.phase);
      if (data.turn_expires_at) setTurnExpiresAt(data.turn_expires_at * 1000);
      if (data.remaining_seconds !== undefined) {
        setTurnRemainingSeconds(data.remaining_seconds);
      } else if (data.duration_seconds) {
        setTurnRemainingSeconds(data.duration_seconds);
      }
    });

    // Role ack progress
    socket.on("game:role_ack_progress", (data: { acks: number; total: number }) => {
      setRoleAckProgress(data);
    });

    // 3. Phase Changes & Authoritative Timer Initialization
    socket.on("game:phase_changed", (data: {
      phase: string;
      current_turn_sid?: string;
      current_round?: number;
      total_rounds?: number;
      all_clues?: ClueEntry[];
      impostor_sid?: string;
      duration_seconds?: number;
      turn_expires_at?: number;
    }) => {
      const nextPhase = data.phase as any;
      setPhase(nextPhase);

      if (data.current_turn_sid) setCurrentTurnSid(data.current_turn_sid);
      if (data.current_round) setCurrentRound(data.current_round);
      if (data.total_rounds) setTotalRounds(data.total_rounds);
      if (data.all_clues) setAllClues(data.all_clues);
      if (data.impostor_sid) setFinalGuessImpostorSid(data.impostor_sid);
      if (data.turn_expires_at) setTurnExpiresAt(data.turn_expires_at * 1000);
      if (data.duration_seconds) setTurnRemainingSeconds(data.duration_seconds);

      if (nextPhase === "clues") sound.playTurnChime();
      if (nextPhase === "discussion") sound.playNotification();
      if (nextPhase === "voting") sound.playSuspense();
      if (nextPhase === "final_guess") sound.playCaughtBuzzer();
    });

    // 4. Live Typing Indicators
    socket.on("game:player_typing", (data: { sid: string; username: string; is_typing: boolean }) => {
      if (data.is_typing) {
        setTypingPlayer(data.username);
      } else {
        setTypingPlayer(null);
      }
    });

    // 5. Clue Broadcast & Turn Advancement with Synchronized Timer
    socket.on("game:clue_broadcast", (data: ClueEntry) => {
      setAllClues((prev) => [...prev, data]);
      setTypingPlayer(null);
      sound.playNotification();
    });

    socket.on("game:turn_advanced", (data: {
      current_turn_sid: string;
      current_round: number;
      duration_seconds?: number;
      turn_expires_at?: number;
    }) => {
      setCurrentTurnSid(data.current_turn_sid);
      setCurrentRound(data.current_round);
      if (data.turn_expires_at) setTurnExpiresAt(data.turn_expires_at * 1000);
      if (data.duration_seconds) setTurnRemainingSeconds(data.duration_seconds);
      sound.playTurnChime();
    });

    // Player Reconnection Status & Host Migration
    socket.on("player:status_changed", (data: { sid: string; user_id?: string; username?: string; status: string }) => {
      const current = useGameStore.getState().players;
      setPlayers(
        current.map((p) => {
          if (p.sid === data.sid || (data.user_id && p.user_id === data.user_id)) {
            return {
              ...p,
              is_connected: data.status === "connected",
              reconnecting: data.status === "reconnecting",
            };
          }
          return p;
        })
      );
    });

    socket.on("room:host_changed", (data: { host_sid: string; host_username?: string }) => {
      console.log("Host changed to", data);
    });

    // 6. Discussion Chat
    socket.on("game:chat_message", (data: ChatEntry) => {
      setChatMessages((prev) => [...prev, data]);
    });

    // 7. Secret Voting Events
    socket.on("game:vote_recorded", () => {
      setHasVoted(true);
      sound.playClick();
    });

    socket.on("game:vote_progress", (data: { total_votes_cast: number; total_voters_needed: number }) => {
      setVoteProgress({ cast: data.total_votes_cast, needed: data.total_voters_needed });
    });

    socket.on("game:vote_reveal", (data: any) => {
      setEliminatedSid(data.eliminated_sid);
      setEliminationInfo(data);
      sound.playCaughtBuzzer();
    });

    // 8. Final Guess Result & Match End (Idempotent Handler)
    const handleMatchConclusion = (data: FinalResult) => {
      // Always keep UI synchronized with authoritative backend result
      setGameResult(data);
      setPhase("results");

      const matchId = data.match_id;
      if (!matchId) {
        console.warn("[Protocol Warning] Match conclusion payload missing match_id:", data);
        if (!lastHandledMatchIdRef.current) {
          lastHandledMatchIdRef.current = "unidentified_match";
          sound.playVictory();
        }
        return;
      }

      // Play victory audio and apply rewards only once per match_id
      if (lastHandledMatchIdRef.current !== matchId) {
        lastHandledMatchIdRef.current = matchId;
        sound.playVictory();

        // Sync authoritative multiplayer progression
        if (data.rewards) {
          const myReward = (mySid && data.rewards[mySid]) ||
            (user?.id && data.rewards[user.id]) ||
            (user?.username && Object.values(data.rewards).find((r: any) => r.username === user.username));
          if (myReward) {
            if (myReward.new_total_xp !== undefined && myReward.new_total_coins !== undefined) {
              syncAuthoritativeRewards(
                myReward.new_total_xp,
                myReward.new_total_coins,
                myReward.level_info?.level
              );
            } else {
              addRewards(myReward.xp_earned, myReward.coins_earned);
            }
          }
        }
      }
    };

    socket.on("game:final_guess_result", (data: FinalResult) => {
      handleMatchConclusion(data);
    });

    socket.on("game:match_ended", (data: FinalResult) => {
      handleMatchConclusion(data);
    });

    // 9. Replay return to lobby
    socket.on("game:returned_to_lobby", () => {
      lastHandledMatchIdRef.current = null;
      sound.playClick();
      router.push(`/lobby/${roomId}`);
    });

    return () => {
      socket.off("game:role_assigned");
      socket.off("game:match_started");
      socket.off("game:role_ack_progress");
      socket.off("game:phase_changed");
      socket.off("game:player_typing");
      socket.off("game:clue_broadcast");
      socket.off("game:turn_advanced");
      socket.off("game:chat_message");
      socket.off("game:vote_recorded");
      socket.off("game:vote_progress");
      socket.off("game:vote_reveal");
      socket.off("game:final_guess_result");
      socket.off("game:match_ended");
      socket.off("game:returned_to_lobby");
      socket.off("player:status_changed");
      socket.off("room:host_changed");
    };
  }, [user, roomId, router, setPlayers]);

  // Synchronized countdown ticker for clues phase
  useEffect(() => {
    if (phase !== "clues" || !turnExpiresAt) return;

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((turnExpiresAt - now) / 1000));
      setTurnRemainingSeconds(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 250);
    return () => clearInterval(interval);
  }, [phase, turnExpiresAt]);

  useEffect(() => {
    if (!user) {
      router.push("/");
      return;
    }
    const cleanup = setupGameSocket();
    return cleanup;
  }, [user, router, setupGameSocket]);

  // Effective Socket ID
  const effectiveSid = mySid || getSocket()?.id;
  const isMyTurn = Boolean(currentTurnSid && effectiveSid && currentTurnSid === effectiveSid);
  const isHost = players.length > 0 && players[0].user_id === user?.id;

  // Active Player Info
  const activePlayer = useMemo(() => {
    return players.find((p) => p.sid === currentTurnSid);
  }, [players, currentTurnSid]);

  // Handlers
  const handleAcknowledgeRole = () => {
    sound.playClick();
    setRoleAcknowledged(true);
    getSocket()?.emit("game_role_acknowledged", {});
  };

  const handleClueTyping = (text: string) => {
    setMyClueDraft(text);
    getSocket()?.emit("game_typing", { is_typing: text.length > 0 });

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      getSocket()?.emit("game_typing", { is_typing: false });
    }, 2000);
  };

  const handleSubmitClue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!myClueDraft.trim()) return;
    sound.playClick();
    getSocket()?.emit("game_clue_submit", { clue: myClueDraft.trim() });
    getSocket()?.emit("game_typing", { is_typing: false });
    setMyClueDraft("");
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatDraft.trim()) return;
    getSocket()?.emit("game_chat", { message: chatDraft.trim() });
    setChatDraft("");
  };

  const handleCastVote = () => {
    if (!selectedSuspectSid || hasVoted) return;
    sound.playClick();
    getSocket()?.emit("game_vote_cast", { target_sid: selectedSuspectSid });
  };

  const handleSubmitFinalGuess = (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalGuessDraft.trim()) return;
    sound.playClick();
    getSocket()?.emit("game_final_guess", { guess: finalGuessDraft.trim() });
  };

  const handleReturnToLobby = () => {
    sound.playClick();
    getSocket()?.emit("game_return_to_lobby", {});
  };

  return (
    <main className="min-h-screen bg-game-dark text-white relative overflow-hidden flex flex-col justify-between selection:bg-purple-600 selection:text-white">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-600/15 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-32 w-[32rem] h-[32rem] bg-blue-600/10 rounded-full blur-[150px]" />
        <div className="absolute -bottom-32 left-1/3 w-[36rem] h-[36rem] bg-red-600/10 rounded-full blur-[150px]" />
      </div>

      {/* GAMING HUD HEADER */}
      <header className="relative z-20 w-full max-w-5xl mx-auto px-4 py-3 border-b border-gray-800/80 bg-slate-950/40 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl">🕵️</span>
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-purple-400">
              Live Match · Room {roomId}
            </span>
            <div className="text-[10px] text-gray-400 font-mono">
              Category: <strong className="text-amber-300">{category}</strong>
            </div>
          </div>
        </div>

        {/* Phase Indicator Breadcrumb */}
        <div className="hidden sm:flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
          <span className={`px-2.5 py-1 rounded-full border ${phase === "role_reveal" ? "bg-purple-950 border-purple-500 text-purple-300" : "border-gray-800 text-gray-500"}`}>
            1. Role
          </span>
          <span className="text-gray-600">→</span>
          <span className={`px-2.5 py-1 rounded-full border ${phase === "clues" ? "bg-cyan-950 border-cyan-500 text-cyan-300" : "border-gray-800 text-gray-500"}`}>
            2. Clues
          </span>
          <span className="text-gray-600">→</span>
          <span className={`px-2.5 py-1 rounded-full border ${phase === "discussion" ? "bg-amber-950 border-amber-500 text-amber-300" : "border-gray-800 text-gray-500"}`}>
            3. Debate
          </span>
          <span className="text-gray-600">→</span>
          <span className={`px-2.5 py-1 rounded-full border ${phase === "voting" || phase === "final_guess" ? "bg-rose-950 border-rose-500 text-rose-300" : "border-gray-800 text-gray-500"}`}>
            4. Vote
          </span>
        </div>

        {/* Actions & Player Badge */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowLeaveConfirmModal(true)}
            className="px-2.5 py-1 rounded-full border border-gray-800 hover:border-rose-500/60 bg-slate-900/80 hover:bg-rose-950/40 text-xs font-bold text-gray-400 hover:text-rose-300 transition-all flex items-center gap-1"
            title="Leave Match"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">Leave</span>
          </button>

          <div className="flex items-center gap-2 bg-slate-900 border border-gray-800 rounded-full px-2.5 py-1 text-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <Avatar3D avatar={user?.avatar} name={user?.username} size="xs" interactive={false} animated={false} />
            <span className="font-bold">{user?.username}</span>
          </div>
        </div>
      </header>

      {/* MATCH MAIN VIEWPORT */}
      <div className="relative z-10 w-full max-w-4xl mx-auto px-4 py-6 flex-1 flex flex-col justify-center">

        {/* ──────────────── PHASE 1: PRIVATE ROLE REVEAL ──────────────── */}
        {phase === "role_reveal" && (
          <div className="max-w-md w-full mx-auto space-y-6 text-center animate-slide-up">
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-widest text-purple-400">
                Step 1 of 4 · Private Identity
              </span>
              <h2 className="text-2xl font-black text-white">Your Secret Assignment</h2>
              <p className="text-xs text-gray-400">
                Delivered privately to your device only. Keep your screen guarded!
              </p>
            </div>

            {/* Private Role Card */}
            {roleData ? (
              <div
                className={`p-6 rounded-3xl border-2 backdrop-blur-xl shadow-2xl relative overflow-hidden text-left transition-all ${
                  roleData.is_impostor
                    ? "bg-gradient-to-br from-rose-950/80 via-slate-950 to-slate-900 border-rose-500/80 shadow-rose-950/50"
                    : "bg-gradient-to-br from-purple-950/80 via-slate-950 to-slate-900 border-purple-500/80 shadow-purple-950/50"
                }`}
              >
                <div className="flex items-center justify-between mb-4 border-b border-gray-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl">{roleData.is_impostor ? "🦹" : "🕵️"}</span>
                    <div>
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest block">
                        Assigned Role
                      </span>
                      <strong className="text-base font-black text-white">
                        {roleData.card_title || (roleData.is_impostor ? "The Impostor" : "Innocent Civilian")}
                      </strong>
                    </div>
                  </div>
                  <span className={`text-xs font-black uppercase px-2.5 py-1 rounded-full border ${
                    roleData.is_impostor
                      ? "bg-rose-900/60 border-rose-500 text-rose-300"
                      : "bg-purple-900/60 border-purple-500 text-purple-300"
                  }`}>
                    {roleData.is_impostor ? "Bluff & Blend In" : "Knows Secret Word"}
                  </span>
                </div>

                {/* Secret Word Box */}
                <div className="my-5 p-5 rounded-2xl bg-black/50 border border-gray-800 text-center space-y-1">
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-400">
                    {roleData.is_impostor ? "Secret Word Status" : "Your Secret Word"}
                  </span>
                  <div className={`text-3xl md:text-4xl font-black tracking-wider ${
                    roleData.is_impostor ? "text-rose-400" : "text-amber-400 drop-shadow-[0_4px_16px_rgba(245,158,11,0.4)]"
                  }`}>
                    {roleData.secret_word ? roleData.secret_word : "❌ NO SECRET WORD"}
                  </div>
                </div>

                <p className="text-xs text-gray-300 leading-relaxed">
                  {roleData.description || (
                    roleData.is_impostor
                      ? "Listen carefully to the clues given by other players. Give plausible, subtle clues to avoid suspicion!"
                      : "Describe this secret word subtly on your turn. Do not give it away directly!"
                  )}
                </p>

                {/* Confirmation Button */}
                <div className="mt-6 pt-4 border-t border-gray-800/80">
                  <button
                    onClick={handleAcknowledgeRole}
                    disabled={roleAcknowledged}
                    className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-wider transition-all shadow-lg ${
                      roleAcknowledged
                        ? "bg-emerald-950 border border-emerald-600 text-emerald-300 cursor-default"
                        : "bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white shadow-purple-600/30 active:scale-95"
                    }`}
                  >
                    {roleAcknowledged
                      ? "✓ Memorised! Waiting for teammates..."
                      : "🔒 I've Memorised It — Ready!"}
                  </button>
                  <p className="text-[10px] text-gray-500 text-center mt-2 font-mono">
                    Ready Players: {roleAckProgress.acks} / {roleAckProgress.total || players.length}
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-8 bg-slate-900 border border-gray-800 rounded-2xl">
                <span className="animate-spin text-2xl inline-block mb-2">⏳</span>
                <p className="text-xs text-gray-400">Receiving private role from match server...</p>
              </div>
            )}
          </div>
        )}

        {/* ──────────────── PHASE 2: CLUE ROUNDS ──────────────── */}
        {phase === "clues" && (
          <div className="w-full space-y-6 animate-slide-up">
            {/* Round Tracker & Turn Chips */}
            <div className="bg-slate-950/70 border border-gray-800 rounded-2xl p-4 backdrop-blur-md space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-purple-400 font-mono uppercase tracking-widest">
                  Round {currentRound} of {totalRounds} · Clue Phase
                </span>

                {/* 60s Authoritative Timer Pill */}
                <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-mono font-black tracking-wider transition-all shadow-md ${
                  turnRemainingSeconds <= 10
                    ? "border-rose-500 bg-rose-950/80 text-rose-300 shadow-rose-500/30 animate-pulse"
                    : turnRemainingSeconds <= 20
                    ? "border-amber-500 bg-amber-950/60 text-amber-300 shadow-amber-500/20"
                    : "border-cyan-500 bg-cyan-950/60 text-cyan-300 shadow-cyan-500/20"
                }`}>
                  <span className="text-sm">⏱️</span>
                  <span>{turnRemainingSeconds}s</span>
                  {turnRemainingSeconds <= 10 && <span className="text-[10px] uppercase font-bold text-rose-400">Hurry!</span>}
                </div>
              </div>

              {/* Turn Sequence Track Chips with Reconnecting Status */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {turnOrder.map((sid, idx) => {
                  const p = players.find((pl) => pl.sid === sid);
                  const isCurrent = sid === currentTurnSid;
                  const isReconnecting = p?.reconnecting || p?.is_connected === false;
                  const hasGivenClueThisRound = allClues.some(
                    (c) => c.sid === sid && c.round === currentRound
                  );

                  return (
                    <div
                      key={sid}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all whitespace-nowrap ${
                        isCurrent
                          ? "border-cyan-400 bg-cyan-950 text-cyan-200 shadow-md shadow-cyan-500/20 scale-105"
                          : hasGivenClueThisRound
                          ? "border-emerald-600/60 bg-emerald-950/40 text-emerald-300"
                          : "border-gray-800 bg-slate-900/60 text-gray-500"
                      }`}
                    >
                      <span>{p?.avatar || "👤"}</span>
                      <span>{p?.username || `Player ${idx + 1}`}</span>
                      {isReconnecting && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 border border-amber-500 text-amber-300 animate-pulse">
                          Reconnecting...
                        </span>
                      )}
                      {hasGivenClueThisRound && <span className="text-emerald-400">✓</span>}
                      {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
                    </div>
                  );
                })}
              </div>

              {/* Chaos Card Modifier Banner */}
              {chaosCard && (
                <div className="p-2.5 rounded-xl bg-gradient-to-r from-amber-950/60 to-purple-950/60 border border-amber-500/40 text-xs flex items-center gap-2 text-amber-200">
                  <span className="text-lg">🌀</span>
                  <div>
                    <strong>Chaos Rule: {chaosCard.name}</strong> — {chaosCard.description}
                  </div>
                </div>
              )}
            </div>

            {/* ACTIVE TURN HERO INPUT OR WAITING NOTICE */}
            <div className="bg-slate-950 border border-purple-500/30 rounded-3xl p-6 backdrop-blur-xl shadow-xl">
              {isMyTurn ? (
                <form onSubmit={handleSubmitClue} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center text-xl">
                      ✍️
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-black text-lg text-white">Your Turn to Speak!</h3>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold border ${
                          turnRemainingSeconds <= 10
                            ? "bg-rose-950 border-rose-500 text-rose-300 animate-pulse"
                            : turnRemainingSeconds <= 20
                            ? "bg-amber-950 border-amber-500 text-amber-300"
                            : "bg-cyan-950 border-cyan-500 text-cyan-300"
                        }`}>
                          ⏱️ {turnRemainingSeconds}s remaining
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {roleData?.is_impostor
                          ? "You don't know the word! Give a subtle, general clue to blend in."
                          : `Secret Word: ${roleData?.secret_word}. Give a subtle 1-sentence clue!`}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      autoFocus
                      placeholder="e.g. It helps people stay connected every day..."
                      value={myClueDraft}
                      onChange={(e) => handleClueTyping(e.target.value)}
                      className="flex-1 bg-slate-900 border border-cyan-500/40 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 font-bold"
                      maxLength={140}
                    />
                    <button
                      type="submit"
                      onClick={handleSubmitClue}
                      className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 font-black text-xs uppercase tracking-wider text-white shadow-lg shadow-cyan-600/30"
                    >
                      💬 Submit
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{activePlayer?.avatar || "⏳"}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-white">
                          Waiting for {activePlayer?.username || "teammate"} to submit a clue...
                        </h3>
                        <span className="text-xs font-mono font-bold text-cyan-400">
                          ({turnRemainingSeconds}s)
                        </span>
                      </div>
                      {typingPlayer ? (
                        <p className="text-xs font-bold text-cyan-400 flex items-center gap-1.5 animate-pulse">
                          <span>✍️</span> {typingPlayer} is writing a clue...
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500">Listen closely to catch any inconsistencies!</p>
                      )}
                    </div>
                  </div>
                  <div className="w-8 h-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
                </div>
              )}
            </div>

            {/* SHARED CLUE TIMELINE */}
            <div className="bg-slate-950/60 border border-gray-800 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                Submitted Clues Timeline ({allClues.length})
              </h4>
              {allClues.length === 0 ? (
                <p className="text-xs text-gray-500 italic py-4 text-center">
                  No clues submitted yet this round.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {allClues.map((c, i) => {
                    const p = players.find((pl) => pl.sid === c.sid);
                    return (
                      <div
                        key={i}
                        className="p-2 sm:p-2.5 rounded-xl bg-slate-900/80 border border-gray-800/80 hover:border-gray-700/80 flex items-center gap-3 transition-colors"
                      >
                        <div className="shrink-0 flex items-center justify-center">
                          <Avatar3D
                            avatar={p?.avatar}
                            name={c.username}
                            size="lg"
                            interactive={false}
                            animated={false}
                          />
                        </div>
                        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                          <div className="flex items-center gap-2 shrink-0">
                            <strong className="text-xs font-bold text-white tracking-tight truncate max-w-[110px]">
                              {c.username}
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
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ──────────────── PHASE 3: DISCUSSION & DEBATE ──────────────── */}
        {phase === "discussion" && (
          <div className="w-full space-y-6 animate-slide-up">
            <div className="text-center space-y-1">
              <span className="text-xs font-mono uppercase tracking-widest text-amber-400">
                Step 3 of 4 · Group Debate
              </span>
              <h2 className="text-2xl md:text-3xl font-black text-white">
                Who Is The Impostor?
              </h2>
              <p className="text-xs text-gray-400">
                Analyze everyone&apos;s clues. Who gave vague or contradictory answers?
              </p>
            </div>

            {/* Clue Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {players.map((p) => {
                const playerClues = allClues.filter((c) => c.sid === p.sid);
                return (
                  <div key={p.sid} className="p-4 rounded-2xl bg-slate-950/80 border border-gray-800 space-y-2">
                    <div className="flex items-center gap-2 border-b border-gray-800 pb-2">
                      <Avatar3D avatar={p.avatar} name={p.username} size="sm" interactive={false} animated={false} />
                      <strong className="text-sm text-white">{p.username}</strong>
                    </div>
                    <div className="space-y-1">
                      {playerClues.map((c, i) => (
                        <p key={i} className="text-xs text-gray-300 italic">
                          • &ldquo;{c.clue}&rdquo;
                        </p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Discussion Chat */}
            <div className="bg-slate-950 border border-purple-500/30 rounded-2xl p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                Live Accusations & Discussion Feed
              </h4>
              <div className="h-40 overflow-y-auto space-y-2 pr-1">
                {chatMessages.length === 0 ? (
                  <p className="text-xs text-gray-500 italic text-center py-6">
                    Type your suspicions below to share with everyone!
                  </p>
                ) : (
                  chatMessages.map((m, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <Avatar3D avatar={m.avatar} name={m.username} size="xs" interactive={false} animated={false} />
                      <div>
                        <strong className="text-purple-300">{m.username}: </strong>
                        <span className="text-gray-200">{m.message}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <form onSubmit={handleSendChat} className="flex gap-2">
                <input
                  type="text"
                  placeholder="Share who you find suspicious..."
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  className="flex-1 bg-slate-900 border border-gray-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white"
                >
                  Send
                </button>
              </form>
            </div>

            {/* Proceed to Vote Trigger (Host or Group) */}
            <div className="text-center pt-2">
              <button
                onClick={() => {
                  sound.playClick();
                  getSocket()?.emit("game_start_vote", {});
                }}
                className="px-8 py-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-rose-900/30"
              >
                🗳️ Ready to Accuse? Proceed to Secret Voting
              </button>
            </div>
          </div>
        )}

        {/* ──────────────── PHASE 4: SECRET VOTING BOOTH ──────────────── */}
        {phase === "voting" && (
          <div className="max-w-xl w-full mx-auto space-y-6 text-center animate-slide-up">
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-widest text-rose-400">
                Step 4 of 4 · Secret Ballot
              </span>
              <h2 className="text-2xl font-black text-white">Cast Your Secret Vote</h2>
              <p className="text-xs text-gray-400">
                Select the suspect you believe is the Impostor. Votes remain secret until all ballots are cast!
              </p>
            </div>

            {hasVoted ? (
              <div className="p-8 rounded-3xl bg-slate-950 border border-emerald-500/40 text-center space-y-3">
                <span className="text-5xl">🗳️</span>
                <h3 className="text-xl font-black text-emerald-400">Secret Ballot Cast!</h3>
                <p className="text-xs text-gray-400">
                  Waiting for remaining players to submit their votes...
                </p>
                <div className="text-xs font-mono text-gray-400 pt-2">
                  Votes Cast: <strong className="text-white">{voteProgress.cast}</strong> / {voteProgress.needed || players.length}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {players
                    .filter((p) => p.sid !== mySid)
                    .map((p) => {
                      const isSelected = selectedSuspectSid === p.sid;
                      return (
                        <button
                          key={p.sid}
                          type="button"
                          onClick={() => {
                            sound.playClick();
                            setSelectedSuspectSid(p.sid);
                          }}
                          className={`p-3.5 rounded-2xl border flex flex-col items-center justify-center text-center transition-all ${
                            isSelected
                              ? "border-rose-500 bg-rose-950/80 shadow-lg shadow-rose-600/30 scale-102 ring-2 ring-rose-400"
                              : "border-gray-800 bg-slate-950/80 hover:border-gray-700"
                          }`}
                        >
                          <div className="mb-2 flex items-center justify-center">
                            <Avatar3D
                              avatar={p.avatar}
                              name={p.username}
                              size="sm"
                              interactive={false}
                              animated={isSelected}
                            />
                          </div>
                          <strong className="text-xs sm:text-sm font-bold text-white block truncate max-w-full">
                            {p.username}
                          </strong>
                          {isSelected && (
                            <span className="text-[10px] font-bold text-rose-300 uppercase tracking-widest block mt-1">
                              ✓ Selected
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>

                {selectedSuspectSid && (
                  <button
                    onClick={handleCastVote}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-rose-600 via-pink-600 to-amber-600 font-black text-sm uppercase tracking-wider text-white shadow-xl shadow-rose-950/50 hover:scale-102 active:scale-98 transition-all"
                  >
                    🎯 Confirm Secret Vote for {players.find((p) => p.sid === selectedSuspectSid)?.username}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* ──────────────── PHASE 5: FINAL GUESS (WORD STEAL) ──────────────── */}
        {phase === "final_guess" && (
          <div className="max-w-md w-full mx-auto space-y-6 text-center animate-slide-up">
            <div className="space-y-1">
              <span className="text-xs font-mono uppercase tracking-widest text-rose-400">
                Final Word Steal Opportunity
              </span>
              <h2 className="text-2xl font-black text-white">The Impostor Was Caught!</h2>
              <p className="text-xs text-gray-400">
                Can the Impostor deduce the secret word from the clues and steal victory?
              </p>
            </div>

            {mySid === finalGuessImpostorSid ? (
              <form onSubmit={handleSubmitFinalGuess} className="p-6 rounded-3xl bg-slate-950 border-2 border-rose-500 space-y-4">
                <span className="text-4xl block">🦹</span>
                <h3 className="text-lg font-black text-rose-400">You Were Caught!</h3>
                <p className="text-xs text-gray-300">
                  You have one final chance: If you correctly guess the secret word, you win!
                </p>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Enter your secret word guess..."
                  value={finalGuessDraft}
                  onChange={(e) => setFinalGuessDraft(e.target.value)}
                  className="w-full bg-slate-900 border border-rose-500 rounded-xl px-4 py-3 text-white text-center font-black text-lg focus:outline-none"
                />
                <button
                  type="submit"
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 font-black text-sm uppercase text-white shadow-lg shadow-rose-600/30"
                >
                  🎯 Submit Final Word Guess
                </button>
              </form>
            ) : (
              <div className="p-8 rounded-3xl bg-slate-950 border border-gray-800 space-y-3">
                <div className="w-10 h-10 mx-auto rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
                <h3 className="text-base font-bold text-white">
                  The Impostor is attempting their final guess...
                </h3>
                <p className="text-xs text-gray-400">
                  If they name the secret word, they steal the match!
                </p>
              </div>
            )}
          </div>
        )}

        {/* ──────────────── PHASE 6: RESULTS CELEBRATION ──────────────── */}
        {phase === "results" && gameResult && (
          <div className="max-w-xl w-full mx-auto space-y-6 text-center animate-slide-up">
            {/* Grand Winner Header */}
            <div className="space-y-2">
              <span className="text-5xl block animate-bounce">
                {gameResult.winner.toLowerCase().includes("impostor") ? "🦹" : "🏆"}
              </span>
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-white">
                {gameResult.winner.toLowerCase().includes("impostor")
                  ? "Impostor Victory!"
                  : "Innocents Win!"}
              </h2>
              <p className="text-sm font-bold text-gray-300">
                {gameResult.win_reason || "The match has concluded!"}
              </p>
            </div>

            {/* Revealed Secret Word Hero */}
            <div className="p-5 rounded-2xl bg-black/60 border border-amber-500/40 text-center space-y-1">
              <span className="text-xs font-mono uppercase tracking-widest text-gray-400">
                The Secret Word Was:
              </span>
              <div className="text-4xl font-black text-amber-400 tracking-wider drop-shadow-[0_4px_20px_rgba(245,158,11,0.5)]">
                {gameResult.secret_word}
              </div>
            </div>

            {/* Authoritative Gamification Reward Card */}
            {(() => {
              const myReward = gameResult.rewards ? (
                (mySid && gameResult.rewards[mySid]) ||
                (user?.id && gameResult.rewards[user.id]) ||
                Object.values(gameResult.rewards)[0]
              ) : null;

              if (!myReward) return null;

              return (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-950/70 via-slate-900 to-slate-950 border border-purple-500/40 shadow-xl space-y-4 text-left">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">
                        Match Progression & Rewards
                      </span>
                      <h3 className="text-lg font-black text-white flex items-center gap-2">
                        <span>⭐</span> Level {myReward.level || 1} Agent
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="bg-purple-900/40 border border-purple-500/50 px-3 py-1 rounded-full text-xs font-black text-purple-300">
                        +{myReward.xp_earned} XP
                      </div>
                      <div className="bg-amber-900/40 border border-amber-500/50 px-3 py-1 rounded-full text-xs font-black text-amber-300">
                        +{myReward.coins_earned} 🪙
                      </div>
                    </div>
                  </div>

                  {/* Level progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] font-semibold text-gray-400">
                      <span>Level Progress</span>
                      <span>{myReward.level_progress_pct || 0}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-900 rounded-full overflow-hidden border border-gray-800">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-amber-400 rounded-full transition-all duration-1000 ease-out"
                        style={{ width: `${Math.min(100, Math.max(5, myReward.level_progress_pct || 0))}%` }}
                      />
                    </div>
                  </div>

                  {/* Reward breakdown */}
                  {myReward.breakdown && (
                    <div className="pt-2 border-t border-gray-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                      <div className="bg-slate-900/90 rounded-lg p-2 border border-gray-800">
                        <span className="text-[10px] text-gray-400 block">Match Complete</span>
                        <strong className="text-purple-300">+{myReward.breakdown.base_completion || 75} XP</strong>
                      </div>
                      <div className="bg-slate-900/90 rounded-lg p-2 border border-gray-800">
                        <span className="text-[10px] text-gray-400 block">Match Victory</span>
                        <strong className="text-emerald-300">+{myReward.breakdown.victory || 0} XP</strong>
                      </div>
                      <div className="bg-slate-900/90 rounded-lg p-2 border border-gray-800">
                        <span className="text-[10px] text-gray-400 block">Role Mastery</span>
                        <strong className="text-amber-300">+{myReward.breakdown.role_bonus || 0} XP</strong>
                      </div>
                      <div className="bg-slate-900/90 rounded-lg p-2 border border-gray-800">
                        <span className="text-[10px] text-gray-400 block">Clean Vote</span>
                        <strong className="text-cyan-300">+{myReward.breakdown.clean_vote || 0} XP</strong>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* True Identities Roster */}
            <div className="bg-slate-950/80 border border-gray-800 rounded-2xl p-4 text-left space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                True Player Identities
              </h4>
              <div className="space-y-2">
                {players.map((p) => {
                  const assignment = gameResult.player_assignments[p.sid];
                  const isImp = assignment?.is_impostor;
                  const pReward = gameResult.rewards ? (
                    gameResult.rewards[p.sid] ||
                    (p.user_id && gameResult.rewards[p.user_id])
                  ) : null;

                  return (
                    <div
                      key={p.sid}
                      className="p-3 rounded-xl bg-slate-900 border border-gray-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar3D avatar={p.avatar} name={p.username} size="sm" interactive={false} animated={false} />
                        <div>
                          <strong className="text-sm text-white">{p.username}</strong>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-gray-400 block font-mono">
                              {assignment?.card_title || (isImp ? "Impostor" : "Civilian")}
                            </span>
                            {pReward && (
                              <span className="text-[10px] text-amber-400 font-bold font-mono">
                                • +{pReward.xp_earned} XP / +{pReward.coins_earned} 🪙
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-black uppercase px-2.5 py-1 rounded-full border ${
                          isImp
                            ? "bg-rose-950 border-rose-500 text-rose-300"
                            : "bg-purple-950 border-purple-500 text-purple-300"
                        }`}
                      >
                        {isImp ? "🦹 Impostor" : "🕵️ Innocent"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Replay / Return Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {isHost ? (
                <button
                  onClick={handleReturnToLobby}
                  className="flex-1 py-4 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-purple-900/30"
                >
                  🔄 Play Again (Return Room to Lobby)
                </button>
              ) : (
                <p className="text-xs text-gray-400 italic py-2">
                  Waiting for host to restart match or return room to lobby...
                </p>
              )}
              <button
                onClick={() => {
                  sound.playClick();
                  router.push("/");
                }}
                className="py-4 px-6 rounded-xl bg-slate-900 hover:bg-slate-800 border border-gray-700 text-xs font-bold text-gray-300 hover:text-white uppercase"
              >
                🏠 Main Menu
              </button>
            </div>
          </div>
        )}

      </div>
      {/* ──────────────── VOLUNTARY LEAVE CONFIRMATION MODAL ──────────────── */}
      {showLeaveConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="max-w-md w-full bg-slate-950 border border-rose-500/40 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-950 border border-rose-500 flex items-center justify-center text-xl">
                ⚠️
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Abandon Mission?</h3>
                <p className="text-xs text-gray-400">
                  Are you sure you want to leave? Your role will be abandoned and your teammates will continue without you.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/20 text-xs text-rose-300">
              💡 If you only refreshed or experienced connection lag, you can stay and continue playing smoothly.
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowLeaveConfirmModal(false)}
                className="px-4 py-2.5 rounded-xl border border-gray-700 bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition-colors"
              >
                Stay & Play
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  getSocket()?.emit("lobby_leave", {});
                  router.push("/");
                }}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition-all"
              >
                Confirm Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
