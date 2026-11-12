/**
 * lib/store.ts
 * ─────────────
 * Global game state using Zustand.
 *
 * Zustand is like a lightweight Redux. It stores all the state that
 * multiple components need to share:
 *   - Who is logged in
 *   - What room we're in
 *   - Current players, chat messages, game phase, etc.
 *
 * Any component can read or update this state without prop drilling.
 *
 * Usage:
 *   const { user, players, phase } = useGameStore();
 *   const setPhase = useGameStore((s) => s.setPhase);
 */
import { create } from "zustand";
import type {
  AuthUser,
  Player,
  Room,
  GamePhase,
  ChatMessage,
  VoteState,
  Role,
  GameResult,
} from "@/types/game.types";

interface GameStore {
  // ── Auth ────────────────────────────────────────────────────────
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  clearAuth: () => void;

  // ── Room ────────────────────────────────────────────────────────
  room: Room | null;
  setRoom: (room: Room) => void;
  clearRoom: () => void;

  // ── Players ─────────────────────────────────────────────────────
  players: Player[];
  setPlayers: (players: Player[]) => void;
  updatePlayerSuspicion: (sid: string, score: number) => void;
  setPlayerAlive: (sid: string, is_alive: boolean) => void;

  // ── Game ─────────────────────────────────────────────────────────
  phase: GamePhase;
  setPhase: (phase: GamePhase) => void;

  myRole: Role | null;
  setMyRole: (role: Role) => void;

  phaseEndsAt: number | null; // Unix ms timestamp
  setPhaseTimer: (endsAt: number) => void;

  // ── Chat ────────────────────────────────────────────────────────
  messages: ChatMessage[];
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;

  // ── Voting ───────────────────────────────────────────────────────
  activeVote: VoteState | null;
  setActiveVote: (vote: VoteState | null) => void;
  castVote: (sid: string, choice: "guilty" | "innocent") => void;

  // ── Results ──────────────────────────────────────────────────────
  gameResult: GameResult | null;
  setGameResult: (result: GameResult) => void;

  // ── Reset ────────────────────────────────────────────────────────
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  // Auth
  user: null,
  token: null,
  setAuth: (user, token) => {
    set({ user, token });
    if (typeof window !== "undefined") {
      localStorage.setItem("catchme_token", token);
      localStorage.setItem("catchme_user", JSON.stringify(user));
    }
  },
  clearAuth: () => {
    set({ user: null, token: null });
    if (typeof window !== "undefined") {
      localStorage.removeItem("catchme_token");
      localStorage.removeItem("catchme_user");
    }
  },

  // Room
  room: null,
  setRoom: (room) => set({ room }),
  clearRoom: () => set({ room: null }),

  // Players
  players: [],
  setPlayers: (players) => set({ players }),
  updatePlayerSuspicion: (sid, score) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.sid === sid ? { ...p, suspicion_score: score } : p
      ),
    })),
  setPlayerAlive: (sid, is_alive) =>
    set((s) => ({
      players: s.players.map((p) =>
        p.sid === sid ? { ...p, is_alive } : p
      ),
    })),

  // Game
  phase: "lobby",
  setPhase: (phase) => set({ phase }),

  myRole: null,
  setMyRole: (role) => set({ myRole: role }),

  phaseEndsAt: null,
  setPhaseTimer: (endsAt) => set({ phaseEndsAt: endsAt }),

  // Chat
  messages: [],
  addMessage: (msg) =>
    set((s) => ({
      // Keep at most 200 messages in memory
      messages: [...s.messages.slice(-199), msg],
    })),
  clearMessages: () => set({ messages: [] }),

  // Voting
  activeVote: null,
  setActiveVote: (vote) => set({ activeVote: vote }),
  castVote: (sid, choice) =>
    set((s) =>
      s.activeVote
        ? {
            activeVote: {
              ...s.activeVote,
              votes: { ...s.activeVote.votes, [sid]: choice },
            },
          }
        : {}
    ),

  // Results
  gameResult: null,
  setGameResult: (result) => set({ gameResult: result }),

  // Reset everything for a new game
  resetGame: () =>
    set({
      phase: "lobby",
      myRole: null,
      phaseEndsAt: null,
      messages: [],
      activeVote: null,
      gameResult: null,
    }),
}));
