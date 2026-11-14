/**
 * types/game.types.ts
 * ───────────────────
 * Shared TypeScript types for the entire frontend.
 * Define shapes here once — use everywhere.
 */

// ── Players ────────────────────────────────────────────────────────

export type RoleKey = "impostor" | "detective" | "civilian" | "informant";

export interface Player {
  sid: string;
  user_id: string | null;
  username: string;
  avatar: string;
  is_ready: boolean;
  is_bot: boolean;
  is_alive: boolean;
  is_connected?: boolean;
  disconnected_at?: number | null;
  reconnecting?: boolean;
  suspicion_score: number; // 0.0 – 1.0
  role?: Role; // Only set after game starts, only your own role is visible
}

export interface Role {
  role_key: RoleKey;
  name: string;
  emoji: string;
  description: string;
  win_condition: string;
  team: "impostor" | "innocent";
}

// ── Rooms ──────────────────────────────────────────────────────────

export type RoomStatus = "waiting" | "playing" | "finished";

export interface Room {
  id: string;
  code: string;
  host_id: string;
  status: RoomStatus;
  max_players: number;
  current_players: number;
  allow_bots: boolean;
  created_at: string;
}

// ── Game Phases ────────────────────────────────────────────────────

export type GamePhase =
  | "lobby"
  | "briefing"
  | "gameplay"
  | "voting"
  | "reveal"
  | "results";

// ── Chat ──────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  user_id: string | null;
  username: string;
  avatar: string;
  message: string;
  timestamp: number; // Unix ms
  suspicion_delta?: number; // How much this message changed the score
}

// ── Voting ────────────────────────────────────────────────────────

export interface VoteState {
  accuser: string;
  target: string;
  target_sid: string;
  duration_seconds: number;
  started_at: number; // Unix ms
  votes: Record<string, "guilty" | "innocent">; // sid → choice
}

// ── Auth ──────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  username: string;
  avatar: string;
  games_played: number;
  games_won: number;
  is_guest: boolean;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  user: AuthUser;
}

export interface ServerProgression {
  xp: number;
  coins: number;
  level: number;
  unlocked_avatars: string[];
  equipped_avatar: string;
  unlocked_items: string[];
  equipped_frame: string | null;
  equipped_stamp: string | null;
}

// ── Game Results & Progression ─────────────────────────────────────

export interface PlayerReward {
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

export interface GameResult {
  match_id?: string;
  winner: "innocent" | "impostor" | string;
  players: (Player & { role: Role })[];
  secret_word?: string;
  win_reason?: string;
  player_assignments?: Record<string, any>;
  rewards?: Record<string, PlayerReward>;
  vote_record?: VoteState[];
  chat_log?: ChatMessage[];
  duration_seconds?: number;
  guessed_word?: string;
  is_correct?: boolean;
}
