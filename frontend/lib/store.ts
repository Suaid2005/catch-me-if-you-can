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
import { authApi, progressionApi, setTokens, clearToken } from "./api";
import type {
  AuthUser,
  Player,
  Room,
  GamePhase,
  ChatMessage,
  VoteState,
  Role,
  GameResult,
} from "../types/game.types";

export interface ProgressionState {
  xp: number;
  coins: number;
  level: number;
  unlockedItems: string[];
  equippedFrame?: string | null;
  equippedStamp?: string | null;
  unlockedAvatars?: string[];
  equippedAvatar?: string;
}

export const DEFAULT_AVATAR = "avatar_classic_detective";

export const DEFAULT_PROGRESSION: ProgressionState = {
  xp: 0,
  coins: 150,
  level: 1,
  unlockedItems: ["stamp_sus"],
  equippedFrame: null,
  equippedStamp: "stamp_sus",
  unlockedAvatars: ["avatar_classic_detective"],
  equippedAvatar: "avatar_classic_detective",
};

export const getProgressionStorageKey = (userId?: string | null): string => {
  if (userId) return `catchme_progression_${userId}`;
  return "catchme_practice_progression";
};

export const getStoredProgression = (userId?: string | null): ProgressionState => {
  if (typeof window === "undefined") {
    return DEFAULT_PROGRESSION;
  }
  try {
    const key = getProgressionStorageKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULT_PROGRESSION;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PROGRESSION;

    const xp =
      typeof parsed.xp === "number" && Number.isFinite(parsed.xp) && parsed.xp >= 0
        ? Math.floor(parsed.xp)
        : DEFAULT_PROGRESSION.xp;
    const coins =
      typeof parsed.coins === "number" && Number.isFinite(parsed.coins) && parsed.coins >= 0
        ? Math.floor(parsed.coins)
        : DEFAULT_PROGRESSION.coins;
    const level =
      typeof parsed.level === "number" && Number.isFinite(parsed.level) && parsed.level >= 1
        ? Math.floor(parsed.level)
        : Math.floor(xp / 250) + 1;
    const unlockedItems =
      Array.isArray(parsed.unlockedItems) && parsed.unlockedItems.every((x: any) => typeof x === "string")
        ? parsed.unlockedItems
        : DEFAULT_PROGRESSION.unlockedItems;
    const equippedFrame =
      typeof parsed.equippedFrame === "string" || parsed.equippedFrame === null
        ? parsed.equippedFrame
        : null;
    const equippedStamp =
      typeof parsed.equippedStamp === "string" || parsed.equippedStamp === null
        ? parsed.equippedStamp
        : "stamp_sus";

    const unlockedAvatars =
      Array.isArray(parsed.unlockedAvatars) && parsed.unlockedAvatars.every((x: any) => typeof x === "string") && parsed.unlockedAvatars.length > 0
        ? (parsed.unlockedAvatars.includes("avatar_classic_detective") ? parsed.unlockedAvatars : ["avatar_classic_detective", ...parsed.unlockedAvatars])
        : ["avatar_classic_detective"];
    const equippedAvatar =
      typeof parsed.equippedAvatar === "string" && parsed.equippedAvatar.length > 0
        ? parsed.equippedAvatar
        : "avatar_classic_detective";

    return { xp, coins, level, unlockedItems, equippedFrame, equippedStamp, unlockedAvatars, equippedAvatar };
  } catch {
    return DEFAULT_PROGRESSION;
  }
};

export const saveProgressionToStorage = (prog: ProgressionState, userId?: string | null) => {
  if (typeof window === "undefined") return;
  try {
    const key = getProgressionStorageKey(userId);
    localStorage.setItem(key, JSON.stringify(prog));
    if (!userId) {
      localStorage.setItem("catchme_practice_progression", JSON.stringify(prog));
    }
  } catch {
    // ignore
  }
};

interface GameStore {
  // ── Auth ────────────────────────────────────────────────────────
  user: AuthUser | null;
  token: string | null;
  isHydrated: boolean;
  setAuth: (user: AuthUser, token: string, refreshToken?: string) => void;
  clearAuth: () => void;
  hydrateAuth: () => Promise<AuthUser | null>;

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

  // ── Progression (Local / Practice / Vault) ───────────────────────
  progression: ProgressionState;
  practiceProgression: ProgressionState;
  hydrateProgression: (userId?: string | null) => ProgressionState;
  addRewards: (xp: number, coins: number) => void;
  addPracticeRewards: (
    xp: number,
    coins: number,
    matchDetails?: {
      won: boolean;
      role?: string;
      was_impostor?: boolean;
      guessed_word_correctly?: boolean;
      difficulty?: string;
    }
  ) => void;
  syncAuthoritativeRewards: (newTotalXp: number, newTotalCoins: number, level?: number) => void;
  setProgression: (
    xp: number,
    coins: number,
    level: number,
    unlockedItems?: string[],
    equippedFrame?: string | null,
    equippedStamp?: string | null
  ) => void;
  equipItem: (type: "frame" | "stamp", itemId: string | null) => void;
  purchaseAvatar: (avatarId: string, cost: number) => boolean;
  purchaseCosmetic: (itemId: string, itemType: "frame" | "stamp", cost: number) => boolean;
  equipAvatar: (avatarId: string) => void;

  // ── Reset ────────────────────────────────────────────────────────
  resetGame: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  // Auth
  user: null,
  token: null,
  isHydrated: false,
  setAuth: (user, token, refreshToken) => {
    const userProgression = getStoredProgression(user.id);
    const effectiveAvatar = userProgression.equippedAvatar || user.avatar || "avatar_classic_detective";
    const userWithAvatar = { ...user, avatar: effectiveAvatar };
    if (typeof window !== "undefined") {
      setTokens(token, refreshToken);
      localStorage.setItem("catchme_user", JSON.stringify(userWithAvatar));
    }
    set({ user: userWithAvatar, token, progression: userProgression, isHydrated: true });

    // Sync with server-side progression if not a guest
    if (!user.is_guest) {
      progressionApi.get().then((serverProg) => {
        const syncedProg: ProgressionState = {
          xp: serverProg.xp,
          coins: serverProg.coins,
          level: serverProg.level,
          unlockedItems: serverProg.unlocked_items,
          equippedFrame: serverProg.equipped_frame,
          equippedStamp: serverProg.equipped_stamp,
          unlockedAvatars: serverProg.unlocked_avatars,
          equippedAvatar: serverProg.equipped_avatar || userProgression.equippedAvatar || "avatar_classic_detective",
        };
        saveProgressionToStorage(syncedProg, user.id);
        const updatedUser: AuthUser = { ...userWithAvatar, avatar: syncedProg.equippedAvatar || "avatar_classic_detective" };
        if (typeof window !== "undefined") {
          localStorage.setItem("catchme_user", JSON.stringify(updatedUser));
        }
        set({ user: updatedUser, progression: syncedProg });
      }).catch(() => {
        // Fallback to cached progression if offline
      });
    }
  },
  clearAuth: () => {
    authApi.logout().catch(() => {});
    clearToken();
    const guestProgression = getStoredProgression(null);
    set({ user: null, token: null, progression: guestProgression, practiceProgression: guestProgression, isHydrated: true });
  },
  hydrateAuth: async () => {
    if (typeof window === "undefined") {
      set({ isHydrated: true });
      return null;
    }
    try {
      const storedToken = localStorage.getItem("catchme_token");
      const storedUserRaw = localStorage.getItem("catchme_user");
      let cachedUser: AuthUser | null = null;
      if (storedUserRaw) {
        try {
          cachedUser = JSON.parse(storedUserRaw);
        } catch {
          cachedUser = null;
        }
      }

      if (storedToken && cachedUser) {
        // Immediate optimistic hydration so header displays immediately without flickering
        const userProgression = getStoredProgression(cachedUser.id);
        const effectiveAvatar = userProgression.equippedAvatar || cachedUser.avatar || "avatar_classic_detective";
        const userWithAvatar = { ...cachedUser, avatar: effectiveAvatar };
        set({ user: userWithAvatar, token: storedToken, progression: userProgression, isHydrated: true });

        // Background session verification & server progression sync
        try {
          const freshUser = await authApi.me();
          if (!freshUser.is_guest) {
            try {
              const serverProg = await progressionApi.get();
              const syncedProg: ProgressionState = {
                xp: serverProg.xp,
                coins: serverProg.coins,
                level: serverProg.level,
                unlockedItems: serverProg.unlocked_items,
                equippedFrame: serverProg.equipped_frame,
                equippedStamp: serverProg.equipped_stamp,
                unlockedAvatars: serverProg.unlocked_avatars,
                equippedAvatar: serverProg.equipped_avatar || userProgression.equippedAvatar || "avatar_classic_detective",
              };
              saveProgressionToStorage(syncedProg, freshUser.id);
              const refreshedUser: AuthUser = { ...freshUser, avatar: syncedProg.equippedAvatar || "avatar_classic_detective" };
              localStorage.setItem("catchme_user", JSON.stringify(refreshedUser));
              set({ user: refreshedUser, progression: syncedProg });
              return refreshedUser;
            } catch {
              // Fallback to local cache
            }
          }

          const freshProgression = getStoredProgression(freshUser.id);
          const refreshedUser = { ...freshUser, avatar: freshProgression.equippedAvatar || "avatar_classic_detective" };
          localStorage.setItem("catchme_user", JSON.stringify(refreshedUser));
          set({ user: refreshedUser, progression: freshProgression });
          return refreshedUser;
        } catch (err: any) {
          const msg = err?.message || "";
          if (msg.includes("401") || msg.includes("Could not validate credentials") || msg.includes("Unauthorized")) {
            clearToken();
            const guestProg = getStoredProgression(null);
            set({ user: null, token: null, progression: guestProg, isHydrated: true });
            return null;
          }
          // Network hiccup or offline play: preserve cached credentials
          return cachedUser;
        }
      } else {
        const guestProg = getStoredProgression(null);
        set({ user: null, token: null, progression: guestProg, isHydrated: true });
        return null;
      }
    } catch {
      set({ isHydrated: true });
      return null;
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

  // Progression
  progression: getStoredProgression(),
  practiceProgression: getStoredProgression(null),
  hydrateProgression: (userId?: string | null) => {
    const currentUserId = userId !== undefined ? userId : get().user?.id;
    const stored = getStoredProgression(currentUserId);
    const practiceStored = getStoredProgression(null);
    set({ progression: stored, practiceProgression: practiceStored });
    return stored;
  },
  addRewards: (earnedXp, earnedCoins) => {
    set((s) => {
      const current = s.progression;
      const xp = (current?.xp || 0) + earnedXp;
      const coins = (current?.coins || 0) + earnedCoins;
      const level = Math.floor(xp / 250) + 1;
      const unlockedItems = current?.unlockedItems || ["stamp_sus"];
      const unlockedAvatars = current?.unlockedAvatars || ["avatar_classic_detective"];
      const equippedAvatar = current?.equippedAvatar || "avatar_classic_detective";
      const prog: ProgressionState = {
        xp,
        coins,
        level,
        unlockedItems,
        equippedFrame: current?.equippedFrame ?? null,
        equippedStamp: current?.equippedStamp ?? "stamp_sus",
        unlockedAvatars,
        equippedAvatar,
      };
      saveProgressionToStorage(prog, s.user?.id);
      return { progression: prog };
    });
  },
  addPracticeRewards: (earnedXp, earnedCoins, matchDetails) => {
    set((s) => {
      const current = s.practiceProgression || getStoredProgression(null);
      const xp = (current?.xp || 0) + earnedXp;
      const coins = (current?.coins || 0) + earnedCoins;
      const level = Math.floor(xp / 250) + 1;
      const prog: ProgressionState = {
        ...current,
        xp,
        coins,
        level,
      };

      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("catchme_practice_progression", JSON.stringify(prog));
        } catch {}
      }

      // If user is a guest, update their active displayed progression as well
      if (!s.user || s.user.is_guest) {
        saveProgressionToStorage(prog, s.user?.id);
        return { practiceProgression: prog, progression: prog };
      }

      // Authenticated users: persist authoritatively to backend so legitimate rewards update account progression
      if (matchDetails) {
        progressionApi.recordPracticeMatch(matchDetails).then((serverProg) => {
          const authoritative: ProgressionState = {
            ...(s.progression || getStoredProgression(s.user?.id)),
            xp: serverProg.xp,
            coins: serverProg.coins,
            level: serverProg.level,
            unlockedAvatars: serverProg.unlocked_avatars || s.progression?.unlockedAvatars,
            equippedAvatar: serverProg.equipped_avatar || s.progression?.equippedAvatar,
            unlockedItems: serverProg.unlocked_items || s.progression?.unlockedItems,
            equippedFrame: serverProg.equipped_frame ?? s.progression?.equippedFrame,
            equippedStamp: serverProg.equipped_stamp ?? s.progression?.equippedStamp,
          };
          saveProgressionToStorage(authoritative, s.user?.id);
          set({ progression: authoritative });
        }).catch((err) => {
          console.warn("[Practice] Background sync failed, local state preserved:", err);
        });
      }

      // Synchronously, authenticated account balance remains protected from arbitrary client injection (SEC-06)
      return { practiceProgression: prog };
    });
  },
  syncAuthoritativeRewards: (newTotalXp, newTotalCoins, level) => {
    set((s) => {
      const current = s.progression;
      const xp = Math.max(0, newTotalXp);
      const coins = Math.max(0, newTotalCoins);
      const computedLevel = level !== undefined ? level : Math.floor(xp / 250) + 1;
      const prog: ProgressionState = {
        ...current,
        xp,
        coins,
        level: computedLevel,
      };
      saveProgressionToStorage(prog, s.user?.id);
      return { progression: prog };
    });
  },
  setProgression: (xp, coins, level, unlockedItems, equippedFrame, equippedStamp) =>
    set((s) => {
      const items = unlockedItems ?? s.progression?.unlockedItems ?? ["stamp_sus"];
      const frame = equippedFrame !== undefined ? equippedFrame : s.progression?.equippedFrame ?? null;
      const stamp = equippedStamp !== undefined ? equippedStamp : s.progression?.equippedStamp ?? "stamp_sus";
      const unlockedAvatars = s.progression?.unlockedAvatars || ["avatar_classic_detective"];
      const equippedAvatar = s.progression?.equippedAvatar || "avatar_classic_detective";
      const prog: ProgressionState = {
        xp,
        coins,
        level,
        unlockedItems: items,
        equippedFrame: frame,
        equippedStamp: stamp,
        unlockedAvatars,
        equippedAvatar,
      };
      saveProgressionToStorage(prog, s.user?.id);
      return { progression: prog };
    }),
  equipItem: (type, itemId) => {
    const current = get().progression;
    const previousProgression = { ...current };
    const updated: ProgressionState = {
      ...current,
      equippedFrame: type === "frame" ? itemId : current.equippedFrame ?? null,
      equippedStamp: type === "stamp" ? itemId : current.equippedStamp ?? "stamp_sus",
    };
    saveProgressionToStorage(updated, get().user?.id);
    set({ progression: updated });

    const currentUser = get().user;
    if (currentUser && !currentUser.is_guest) {
      progressionApi
        .equipCosmetic(type, itemId)
        .then((serverProg) => {
          if (serverProg) {
            const authoritative: ProgressionState = {
              xp: serverProg.xp,
              coins: serverProg.coins,
              level: serverProg.level,
              unlockedItems: serverProg.unlocked_items,
              equippedFrame: serverProg.equipped_frame,
              equippedStamp: serverProg.equipped_stamp,
              unlockedAvatars: serverProg.unlocked_avatars,
              equippedAvatar: serverProg.equipped_avatar,
            };
            saveProgressionToStorage(authoritative, currentUser.id);
            set({ progression: authoritative });
          }
        })
        .catch((err) => {
          console.error("Failed to sync cosmetic equipment to server, rolling back:", err);
          saveProgressionToStorage(previousProgression, currentUser.id);
          set({ progression: previousProgression });
        });
    }
  },
  purchaseAvatar: (avatarId, cost) => {
    const current = get().progression;
    const currentAvatars = current?.unlockedAvatars || ["avatar_classic_detective"];
    if (currentAvatars.includes(avatarId)) {
      return false; // Already owned, prevent duplicate purchase
    }
    if ((current?.coins ?? 0) < cost) {
      return false; // Insufficient coins
    }
    const previousProgression = { ...current };
    const updatedCoins = (current.coins || 0) - cost;
    const updatedAvatars = [...currentAvatars, avatarId];
    const updated: ProgressionState = {
      ...current,
      coins: updatedCoins,
      unlockedAvatars: updatedAvatars,
      equippedAvatar: avatarId, // Automatically equip newly unlocked avatar
    };
    saveProgressionToStorage(updated, get().user?.id);
    const currentUser = get().user;
    const updatedUser = currentUser ? { ...currentUser, avatar: avatarId } : null;
    if (updatedUser && typeof window !== "undefined") {
      localStorage.setItem("catchme_user", JSON.stringify(updatedUser));
    }
    set({ progression: updated, user: updatedUser ?? currentUser });

    if (currentUser && !currentUser.is_guest) {
      progressionApi
        .purchaseAvatar(avatarId)
        .then((serverProg) => {
          if (serverProg) {
            const authoritative: ProgressionState = {
              xp: serverProg.xp,
              coins: serverProg.coins,
              level: serverProg.level,
              unlockedItems: serverProg.unlocked_items,
              equippedFrame: serverProg.equipped_frame,
              equippedStamp: serverProg.equipped_stamp,
              unlockedAvatars: serverProg.unlocked_avatars,
              equippedAvatar: serverProg.equipped_avatar || avatarId,
            };
            saveProgressionToStorage(authoritative, currentUser.id);
            const verifiedUser: AuthUser = { ...currentUser, avatar: authoritative.equippedAvatar || "avatar_classic_detective" };
            if (typeof window !== "undefined") {
              localStorage.setItem("catchme_user", JSON.stringify(verifiedUser));
            }
            set({ progression: authoritative, user: verifiedUser });
          }
        })
        .catch((err) => {
          console.error("Failed to sync avatar purchase to server, rolling back:", err);
          saveProgressionToStorage(previousProgression, currentUser.id);
          const revertedUser: AuthUser = { ...currentUser, avatar: previousProgression.equippedAvatar || "avatar_classic_detective" };
          if (typeof window !== "undefined") {
            localStorage.setItem("catchme_user", JSON.stringify(revertedUser));
          }
          set({ progression: previousProgression, user: revertedUser });
        });
    }

    return true;
  },
  purchaseCosmetic: (itemId, itemType, cost) => {
    const current = get().progression;
    const currentItems = current?.unlockedItems || ["stamp_sus"];
    if (currentItems.includes(itemId)) {
      return false; // Already owned
    }
    if ((current?.coins ?? 0) < cost) {
      return false; // Insufficient coins
    }
    const previousProgression = { ...current };
    const updatedCoins = (current.coins || 0) - cost;
    const updatedItems = [...currentItems, itemId];
    const updated: ProgressionState = {
      ...current,
      coins: updatedCoins,
      unlockedItems: updatedItems,
      equippedFrame: itemType === "frame" ? itemId : current.equippedFrame ?? null,
      equippedStamp: itemType === "stamp" ? itemId : current.equippedStamp ?? "stamp_sus",
    };
    saveProgressionToStorage(updated, get().user?.id);
    set({ progression: updated });

    const currentUser = get().user;
    if (currentUser && !currentUser.is_guest) {
      progressionApi
        .purchaseCosmetic(itemId)
        .then((serverProg) => {
          if (serverProg) {
            const authoritative: ProgressionState = {
              xp: serverProg.xp,
              coins: serverProg.coins,
              level: serverProg.level,
              unlockedItems: serverProg.unlocked_items,
              equippedFrame: serverProg.equipped_frame,
              equippedStamp: serverProg.equipped_stamp,
              unlockedAvatars: serverProg.unlocked_avatars,
              equippedAvatar: serverProg.equipped_avatar,
            };
            saveProgressionToStorage(authoritative, currentUser.id);
            set({ progression: authoritative });
          }
        })
        .catch((err) => {
          console.error("Failed to sync cosmetic purchase to server, rolling back:", err);
          saveProgressionToStorage(previousProgression, currentUser.id);
          set({ progression: previousProgression });
        });
    }

    return true;
  },
  equipAvatar: (avatarId) => {
    const current = get().progression;
    const currentAvatars = current?.unlockedAvatars || ["avatar_classic_detective"];
    if (!currentAvatars.includes(avatarId)) {
      return; // Cannot equip unowned avatar
    }
    const previousProgression = { ...current };
    const updated: ProgressionState = {
      ...current,
      equippedAvatar: avatarId,
    };
    saveProgressionToStorage(updated, get().user?.id);
    const currentUser = get().user;
    const updatedUser = currentUser ? { ...currentUser, avatar: avatarId } : null;
    if (updatedUser && typeof window !== "undefined") {
      localStorage.setItem("catchme_user", JSON.stringify(updatedUser));
    }
    set({ progression: updated, user: updatedUser ?? currentUser });

    if (currentUser && !currentUser.is_guest) {
      progressionApi
        .equipAvatar(avatarId)
        .then((serverProg) => {
          if (serverProg) {
            const authoritative: ProgressionState = {
              xp: serverProg.xp,
              coins: serverProg.coins,
              level: serverProg.level,
              unlockedItems: serverProg.unlocked_items,
              equippedFrame: serverProg.equipped_frame,
              equippedStamp: serverProg.equipped_stamp,
              unlockedAvatars: serverProg.unlocked_avatars,
              equippedAvatar: serverProg.equipped_avatar || avatarId,
            };
            saveProgressionToStorage(authoritative, currentUser.id);
            const verifiedUser: AuthUser = { ...currentUser, avatar: authoritative.equippedAvatar || "avatar_classic_detective" };
            if (typeof window !== "undefined") {
              localStorage.setItem("catchme_user", JSON.stringify(verifiedUser));
            }
            set({ progression: authoritative, user: verifiedUser });
          }
        })
        .catch((err) => {
          // Graceful fallback for offline play or server unavailability:
          // Keep local authoritative equipment since the avatar is verified in unlockedAvatars
          console.warn("Could not sync avatar equipment to server (operating in offline/cached mode):", err);
        });
    }
  },

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
