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
  if (typeof window !== "undefined" && window?.location?.hostname) {
    if (envUrl && (envUrl.includes("localhost") || envUrl.includes("127.0.0.1"))) {
      return envUrl.replace(/localhost|127\.0\.0\.1/, window.location.hostname).replace(/\/$/, "");
    }
    if (envUrl) {
      return envUrl.replace(/\/$/, "");
    }
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return `${window.location.protocol || "http:"}//${window.location.hostname}:8000`;
    }
    return window.location.origin || "http://localhost:8000";
  }
  return envUrl ? envUrl.replace(/\/$/, "") : "http://localhost:8000";
}

// ── Token Management ───────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("catchme_token");
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("catchme_refresh_token");
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("catchme_token", accessToken);
  if (refreshToken) {
    localStorage.setItem("catchme_refresh_token", refreshToken);
  }
}

export function setToken(token: string, refreshToken?: string): void {
  setTokens(token, refreshToken);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("catchme_token");
  localStorage.removeItem("catchme_refresh_token");
  localStorage.removeItem("catchme_user");
}

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// ── Base Fetch Helper ──────────────────────────────────────────────

interface FetchOptions extends RequestInit {
  _isRetry?: boolean;
}

async function refreshSessionToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;
  try {
    const baseUrl = getApiUrl();
    const res = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clearToken();
      return null;
    }
    const data: TokenResponse = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

async function apiFetch<T>(
  path: string,
  options: FetchOptions = {}
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
    throw new ApiError(`Unable to reach game server (${baseUrl}). Please check if the server is running. (${msg})`, 0);
  }

  // Automatic token refresh on 401 Unauthorized for non-auth endpoints
  if (
    res.status === 401 &&
    !options._isRetry &&
    path !== "/api/auth/refresh" &&
    path !== "/api/auth/login" &&
    path !== "/api/auth/register"
  ) {
    const freshToken = await refreshSessionToken();
    if (freshToken) {
      return apiFetch<T>(path, { ...options, _isRetry: true });
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = errorData.detail || errorData.message;
    let message = `API error ${res.status}`;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail.map((e: { msg?: string; loc?: string[] }) => e.msg || JSON.stringify(e)).join(", ");
    }
    throw new ApiError(message, res.status, errorData);
  }

  return res.json() as Promise<T>;
}

// ── Auth Endpoints ─────────────────────────────────────────────────

import type { TokenResponse, AuthUser } from "../types/game.types";

export interface RegisterResponse {
  success: boolean;
  message: string;
  registration_token: string;
  user_id: string;
  username: string;
  email: string;
  phone_number: string;
  is_active: boolean;
  email_verified: boolean;
  phone_verified: boolean;
  dev_email_otp?: string | null;
  dev_phone_otp?: string | null;
}

export interface VerificationResponse {
  success: boolean;
  message: string;
  email_verified: boolean;
  phone_verified: boolean;
  is_active: boolean;
  tokens?: TokenResponse | null;
  user?: AuthUser | null;
}

export interface ResendOtpResponse {
  success: boolean;
  message: string;
  channel: string;
  resend_available_at: string;
  dev_otp?: string | null;
}

export interface ChangeContactResponse {
  success: boolean;
  message: string;
  email?: string;
  phone_number?: string;
  dev_email_otp?: string | null;
  dev_phone_otp?: string | null;
}

export interface VerificationStatusResponse {
  user_id: string;
  username: string;
  email: string;
  phone_number: string;
  email_verified: boolean;
  phone_verified: boolean;
  is_active: boolean;
  message: string;
  dev_email_otp?: string | null;
  dev_phone_otp?: string | null;
  tokens?: TokenResponse | null;
}

export interface ForgotPasswordResponse {
  message: string;
  challenge_id: string;
  channel: string;
  target_masked: string;
  dev_otp?: string | null;
}

export interface VerifyForgotPasswordResponse {
  message: string;
  reset_token: string;
}

export const authApi = {
  register: (
    dataOrUsername:
      | string
      | {
          username: string;
          password: string;
          email: string;
          phone_number: string;
          confirm_password?: string;
        },
    password?: string,
    email?: string,
    phone_number?: string,
    confirm_password?: string
  ): Promise<RegisterResponse> => {
    let payload: Record<string, any>;
    if (typeof dataOrUsername === "object" && dataOrUsername !== null) {
      payload = dataOrUsername;
    } else {
      payload = {
        username: dataOrUsername,
        password,
        email,
        phone_number,
        confirm_password: confirm_password ?? password,
      };
    }
    return apiFetch<RegisterResponse>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  verifyEmailOtp: (registration_token: string, otp: string): Promise<VerificationResponse> =>
    apiFetch<VerificationResponse>("/api/auth/register/verify-email", {
      method: "POST",
      body: JSON.stringify({ registration_token, otp }),
    }),

  verifyPhoneOtp: (registration_token: string, otp: string): Promise<VerificationResponse> =>
    apiFetch<VerificationResponse>("/api/auth/register/verify-phone", {
      method: "POST",
      body: JSON.stringify({ registration_token, otp }),
    }),

  resendRegisterOtp: (registration_token: string, channel: "email" | "phone"): Promise<ResendOtpResponse> =>
    apiFetch<ResendOtpResponse>("/api/auth/register/resend-otp", {
      method: "POST",
      body: JSON.stringify({ registration_token, channel }),
    }),

  changeRegisterEmail: (registration_token: string, email: string): Promise<ChangeContactResponse> =>
    apiFetch<ChangeContactResponse>("/api/auth/register/change-email", {
      method: "POST",
      body: JSON.stringify({ registration_token, email }),
    }),

  changeRegisterPhone: (registration_token: string, phone_number: string): Promise<ChangeContactResponse> =>
    apiFetch<ChangeContactResponse>("/api/auth/register/change-phone", {
      method: "POST",
      body: JSON.stringify({ registration_token, phone_number }),
    }),

  getRegisterStatus: (registration_token: string): Promise<VerificationStatusResponse> =>
    apiFetch<VerificationStatusResponse>(`/api/auth/register/status?registration_token=${encodeURIComponent(registration_token)}`),

  login: (username: string, password: string): Promise<TokenResponse> => {
    // The login endpoint uses form encoding (OAuth2 standard)
    const form = new URLSearchParams({ username, password });
    return apiFetch<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: form,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  },

  guest: (display_name: string): Promise<TokenResponse> =>
    apiFetch<TokenResponse>("/api/auth/guest", {
      method: "POST",
      body: JSON.stringify({ display_name }),
    }),

  me: (): Promise<AuthUser> => apiFetch<AuthUser>("/api/auth/me"),

  recoverUsername: (
    identifierOrPayload: string | { channel: "email" | "phone"; identifier: string }
  ): Promise<{ message: string }> => {
    let body: Record<string, string>;
    if (typeof identifierOrPayload === "string") {
      body = identifierOrPayload.includes("@")
        ? { channel: "email", identifier: identifierOrPayload }
        : { channel: "phone", identifier: identifierOrPayload };
    } else {
      body = identifierOrPayload;
    }
    return apiFetch<{ message: string }>("/api/auth/recover-username", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  forgotPassword: (
    identifierOrPayload: string | { channel: "email" | "phone"; identifier: string }
  ): Promise<ForgotPasswordResponse> => {
    let body: Record<string, string>;
    if (typeof identifierOrPayload === "string") {
      body = identifierOrPayload.includes("@")
        ? { channel: "email", identifier: identifierOrPayload }
        : { channel: "phone", identifier: identifierOrPayload };
    } else {
      body = identifierOrPayload;
    }
    return apiFetch<ForgotPasswordResponse>("/api/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  verifyForgotPasswordOtp: (challenge_id: string, otp: string): Promise<VerifyForgotPasswordResponse> =>
    apiFetch<VerifyForgotPasswordResponse>("/api/auth/forgot-password/verify", {
      method: "POST",
      body: JSON.stringify({ challenge_id, otp }),
    }),

  resetPassword: (payload: { token?: string; reset_token?: string; new_password: string; confirm_password: string }): Promise<{ message: string }> => {
    const formatted = {
      reset_token: payload.reset_token || payload.token || "",
      new_password: payload.new_password,
      confirm_password: payload.confirm_password,
    };
    return apiFetch<{ message: string }>("/api/auth/reset-password", {
      method: "POST",
      body: JSON.stringify(formatted),
    });
  },

  refresh: (refreshToken: string): Promise<TokenResponse> =>
    apiFetch<TokenResponse>("/api/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  logout: (refreshToken?: string): Promise<{ message: string }> =>
    apiFetch<{ message: string }>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken || getRefreshToken() }),
    }).catch(() => ({ message: "Logged out" })),

  requestPhoneOtp: (phoneNumber: string): Promise<{ success: boolean; message: string; provider_configured: boolean }> =>
    apiFetch<{ success: boolean; message: string; provider_configured: boolean }>("/api/auth/phone-otp-request", {
      method: "POST",
      body: JSON.stringify({ phone_number: phoneNumber }),
    }),

  verifyStandalonePhoneOtp: (phoneNumber: string, otp: string): Promise<{ message: string }> =>
    apiFetch<{ message: string }>("/api/auth/phone-otp-verify", {
      method: "POST",
      body: JSON.stringify({ phone_number: phoneNumber, otp }),
    }),
};

// ── Progression & Cosmetic Vault Endpoints ─────────────────────────

import type { ServerProgression } from "../types/game.types";

export const progressionApi = {
  get: () => apiFetch<ServerProgression>("/api/progression"),

  purchaseAvatar: (avatarId: string) =>
    apiFetch<ServerProgression>("/api/progression/purchase-avatar", {
      method: "POST",
      body: JSON.stringify({ avatar_id: avatarId }),
    }),

  equipAvatar: (avatarId: string) =>
    apiFetch<ServerProgression>("/api/progression/equip-avatar", {
      method: "POST",
      body: JSON.stringify({ avatar_id: avatarId }),
    }),

  purchaseCosmetic: (itemId: string) =>
    apiFetch<ServerProgression>("/api/progression/purchase-cosmetic", {
      method: "POST",
      body: JSON.stringify({ item_id: itemId }),
    }),

  equipCosmetic: (type: "frame" | "stamp", itemId: string | null) =>
    apiFetch<ServerProgression>("/api/progression/equip-cosmetic", {
      method: "POST",
      body: JSON.stringify({ item_type: type, item_id: itemId }),
    }),

  recordPracticeMatch: (payload: {
    won: boolean;
    role?: string;
    was_impostor?: boolean;
    guessed_word_correctly?: boolean;
    rounds_survived?: number;
    difficulty?: string;
  }) =>
    apiFetch<ServerProgression>("/api/progression/practice-complete", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /**
   * @deprecated Server-authoritative match rewards are awarded exclusively by the backend during match finalization.
   */
  addRewards: (xp: number, coins: number) =>
    apiFetch<ServerProgression>("/api/progression/rewards", {
      method: "POST",
      body: JSON.stringify({ xp_earned: xp, coins_earned: coins }),
    }),
};

// ── Room Endpoints ─────────────────────────────────────────────────

import type { Room } from "../types/game.types";

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
