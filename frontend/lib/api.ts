/**
 * lib/api.ts
 * ───────────
 * HTTP API client for communicating with the FastAPI backend.
 *
 * Uses the native fetch API (built into browsers and Node.js).
 * Automatically attaches the JWT token from localStorage.
 */

export function getApiUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
  if (typeof window !== "undefined") {
    if (envUrl && (envUrl.includes("localhost") || envUrl.includes("127.0.0.1"))) {
      return envUrl.replace(/localhost|127\.0\.0\.1/, window.location.hostname).replace(/\/$/, "");
    }
    if (envUrl) {
      return envUrl.replace(/\/$/, "");
    }
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
    }
    return window.location.origin;
  }
  return envUrl ? envUrl.replace(/\/$/, "") : "http://localhost:8000";
}

// ── Token Management ───────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("catchme_token");
}

export function setToken(token: string): void {
  localStorage.setItem("catchme_token", token);
}

export function clearToken(): void {
  localStorage.removeItem("catchme_token");
  localStorage.removeItem("catchme_user");
}

// ── Base Fetch Helper ──────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
  };

  const baseUrl = getApiUrl();
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...options, headers });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Network error";
    throw new Error(`Unable to reach game server (${baseUrl}). Please check if the server is running. (${msg})`);
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = errorData.detail || errorData.message;
    if (typeof detail === "string") {
      throw new Error(detail);
    } else if (Array.isArray(detail)) {
      const errList = detail.map((e: { msg?: string; loc?: string[] }) => e.msg || JSON.stringify(e)).join(", ");
      throw new Error(errList || `API error ${res.status}`);
    }
    throw new Error(`API error ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ── Auth Endpoints ─────────────────────────────────────────────────

import type { TokenResponse, AuthUser } from "@/types/game.types";

export const authApi = {
  register: (username: string, password: string, email?: string) =>
    apiFetch<TokenResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password, email }),
    }),

  login: (username: string, password: string) => {
    // The login endpoint uses form encoding (OAuth2 standard)
    const form = new URLSearchParams({ username, password });
    return apiFetch<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  guest: (display_name: string) =>
    apiFetch<TokenResponse>("/api/auth/guest", {
      method: "POST",
      body: JSON.stringify({ display_name }),
    }),

  me: () => apiFetch<AuthUser>("/api/auth/me"),
};

// ── Room Endpoints ─────────────────────────────────────────────────

import type { Room } from "@/types/game.types";

export const roomApi = {
  create: (options: { max_players?: number; allow_bots?: boolean }) =>
    apiFetch<Room>("/api/rooms/create", {
      method: "POST",
      body: JSON.stringify(options),
    }),

  join: (code: string) =>
    apiFetch<{ room: Room; message: string }>("/api/rooms/join", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  get: (code: string) => apiFetch<Room>(`/api/rooms/${code}`),
};

// ── Player Endpoints ───────────────────────────────────────────────

export const playerApi = {
  getProfile: (userId: string) => apiFetch<AuthUser>(`/api/players/${userId}`),

  leaderboard: (limit = 20) =>
    apiFetch<AuthUser[]>(`/api/players/leaderboard?limit=${limit}`),
};

// ── Health Check ───────────────────────────────────────────────────

export const healthCheck = () => apiFetch<{ status: string }>("/health");
