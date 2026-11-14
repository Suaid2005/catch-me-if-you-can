import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage for Node test runner
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});

if (typeof (global as any).window === "undefined") {
  (global as any).window = {
    localStorage: localStorageMock,
    location: {
      hostname: "localhost",
      protocol: "http:",
      origin: "http://localhost:3000",
    },
  };
}

import {
  getToken,
  getRefreshToken,
  setTokens,
  clearToken,
  progressionApi,
} from "../api";
import { useGameStore, saveProgressionToStorage } from "../store";

describe("Phase 8 — Session Security & Server Progression Client Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    useGameStore.setState({
      user: null,
      token: null,
      progression: {
        xp: 0,
        coins: 150,
        level: 1,
        unlockedItems: ["stamp_sus"],
        equippedFrame: null,
        equippedStamp: "stamp_sus",
        unlockedAvatars: ["avatar_classic_detective"],
        equippedAvatar: "avatar_classic_detective",
      },
    });
  });

  it("stores and retrieves short-lived access token and 30-day refresh token in localStorage", () => {
    const accessToken = "access_token_mock_12345";
    const refreshToken = "refresh_token_mock_67890";

    setTokens(accessToken, refreshToken);

    expect(getToken()).toBe(accessToken);
    expect(getRefreshToken()).toBe(refreshToken);

    clearToken();

    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("hydrates store with refresh token and supports logout cleanup", async () => {
    const user = {
      id: "u-session-test",
      username: "InspectorGadget",
      avatar: "avatar_classic_detective",
      games_played: 10,
      games_won: 5,
      is_guest: false,
    };
    const access = "access-xyz";
    const refresh = "refresh-abc";

    useGameStore.getState().setAuth(user, access, refresh);

    expect(useGameStore.getState().user?.username).toBe("InspectorGadget");
    expect(useGameStore.getState().token).toBe(access);
    expect(getToken()).toBe(access);
    expect(getRefreshToken()).toBe(refresh);

    useGameStore.getState().clearAuth();

    expect(useGameStore.getState().user).toBeNull();
    expect(useGameStore.getState().token).toBeNull();
    expect(getToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
  });

  it("progression methods update state and cache accurately", () => {
    // Starting with 150 coins
    expect(useGameStore.getState().progression.coins).toBe(150);

    // Purchase Cyber Detective for 150 coins
    const bought = useGameStore.getState().purchaseAvatar("avatar_cyber_detective", 150);
    expect(bought).toBe(true);
    expect(useGameStore.getState().progression.coins).toBe(0);
    expect(useGameStore.getState().progression.unlockedAvatars).toContain("avatar_cyber_detective");
    expect(useGameStore.getState().progression.equippedAvatar).toBe("avatar_cyber_detective");

    // Cannot buy again
    const boughtAgain = useGameStore.getState().purchaseAvatar("avatar_cyber_detective", 150);
    expect(boughtAgain).toBe(false);

    // Cannot buy without sufficient coins
    const brokeBuy = useGameStore.getState().purchaseAvatar("avatar_shadow_agent", 200);
    expect(brokeBuy).toBe(false);

    // Earn rewards
    useGameStore.getState().addRewards(500, 300);
    expect(useGameStore.getState().progression.coins).toBe(300);
    expect(useGameStore.getState().progression.xp).toBe(500);
    expect(useGameStore.getState().progression.level).toBe(3);
  });

  it("SEC-06: Practice rewards strictly do NOT alter authenticated account progression", () => {
    const authUser = {
      id: "u-auth-investigator",
      username: "SherlockHolmes",
      avatar: "avatar_classic_detective",
      games_played: 12,
      games_won: 8,
      is_guest: false,
    };
    saveProgressionToStorage(useGameStore.getState().progression, authUser.id);
    useGameStore.getState().setAuth(authUser, "token-sec06", "refresh-sec06");

    // Authenticated starting balance: 150 coins, 0 XP, level 1
    expect(useGameStore.getState().progression.coins).toBe(150);
    expect(useGameStore.getState().progression.xp).toBe(0);
    expect(useGameStore.getState().progression.level).toBe(1);

    // Play practice match and award rewards via addPracticeRewards
    useGameStore.getState().addPracticeRewards(600, 300);

    // Authenticated account balance MUST remain unchanged
    expect(useGameStore.getState().progression.coins).toBe(150);
    expect(useGameStore.getState().progression.xp).toBe(0);
    expect(useGameStore.getState().progression.level).toBe(1);

    // Isolated practice progression MUST hold the earned practice rewards
    expect(useGameStore.getState().practiceProgression.coins).toBe(150 + 300);
    expect(useGameStore.getState().practiceProgression.xp).toBe(600);
    expect(useGameStore.getState().practiceProgression.level).toBe(3);

    // Practice storage key is isolated from user progression storage key
    expect(localStorage.getItem("catchme_practice_progression")).not.toBeNull();
    const storedUserProg = JSON.parse(localStorage.getItem("catchme_progression_u-auth-investigator") || "{}");
    expect(storedUserProg.coins).toBe(150);
  });

  it("SEC-06: Failed avatar purchase rolls back optimistic state to snapshot", async () => {
    const authUser = {
      id: "u-auth-buyer",
      username: "CoinHoarder",
      avatar: "avatar_classic_detective",
      games_played: 5,
      games_won: 2,
      is_guest: false,
    };
    useGameStore.getState().setAuth(authUser, "token-buyer", "refresh-buyer");

    // Mock backend rejection (e.g. 400 Bad Request or server validation failure)
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const purchaseSpy = vi.spyOn(progressionApi, "purchaseAvatar").mockRejectedValue(new Error("HTTP 400: Insufficient coins"));

    expect(useGameStore.getState().progression.coins).toBe(150);
    expect(useGameStore.getState().progression.unlockedAvatars).toEqual(["avatar_classic_detective"]);

    // Attempt purchase
    const optimisticResult = useGameStore.getState().purchaseAvatar("avatar_cyber_detective", 150);
    expect(optimisticResult).toBe(true);

    // Optimistically updated
    expect(useGameStore.getState().progression.coins).toBe(0);
    expect(useGameStore.getState().progression.unlockedAvatars).toContain("avatar_cyber_detective");

    // Wait for async rejection and catch rollback handler to execute
    await new Promise((r) => setTimeout(r, 20));

    // Must be rolled back to snapshot state
    expect(useGameStore.getState().progression.coins).toBe(150);
    expect(useGameStore.getState().progression.unlockedAvatars).toEqual(["avatar_classic_detective"]);
    expect(useGameStore.getState().progression.equippedAvatar).toBe("avatar_classic_detective");

    purchaseSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("SEC-06: Failed cosmetic purchase rolls back optimistic state to snapshot", async () => {
    const authUser = {
      id: "u-auth-cosmetics",
      username: "CosmeticFan",
      avatar: "avatar_classic_detective",
      games_played: 1,
      games_won: 1,
      is_guest: false,
    };
    useGameStore.getState().setAuth(authUser, "token-cos", "refresh-cos");

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const cosmeticSpy = vi.spyOn(progressionApi, "purchaseCosmetic").mockRejectedValue(new Error("HTTP 400: Not found"));

    expect(useGameStore.getState().progression.coins).toBe(150);
    expect(useGameStore.getState().progression.unlockedItems).toEqual(["stamp_sus"]);

    const optimisticResult = useGameStore.getState().purchaseCosmetic("frame_neon_cyan", "frame", 100);
    expect(optimisticResult).toBe(true);

    // Optimistically modified
    expect(useGameStore.getState().progression.coins).toBe(50);
    expect(useGameStore.getState().progression.unlockedItems).toContain("frame_neon_cyan");
    expect(useGameStore.getState().progression.equippedFrame).toBe("frame_neon_cyan");

    // Wait for rejection rollback
    await new Promise((r) => setTimeout(r, 20));

    // Rolled back
    expect(useGameStore.getState().progression.coins).toBe(150);
    expect(useGameStore.getState().progression.unlockedItems).toEqual(["stamp_sus"]);
    expect(useGameStore.getState().progression.equippedFrame).toBeNull();

    cosmeticSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it("SEC-06: Successful avatar purchase synchronizes with authoritative server response", async () => {
    const authUser = {
      id: "u-auth-sync",
      username: "SyncMaster",
      avatar: "avatar_classic_detective",
      games_played: 10,
      games_won: 5,
      is_guest: false,
    };
    useGameStore.getState().setAuth(authUser, "token-sync", "refresh-sync");

    const serverProg = {
      xp: 450,
      coins: 50, // 200 - 150 = 50
      level: 2,
      unlocked_items: ["stamp_sus", "stamp_verified"],
      equipped_frame: null,
      equipped_stamp: "stamp_verified",
      unlocked_avatars: ["avatar_classic_detective", "avatar_cyber_detective"],
      equipped_avatar: "avatar_cyber_detective",
    };
    const purchaseSpy = vi.spyOn(progressionApi, "purchaseAvatar").mockResolvedValue(serverProg);

    useGameStore.getState().purchaseAvatar("avatar_cyber_detective", 150);

    // Wait for promise resolution
    await new Promise((r) => setTimeout(r, 20));

    expect(useGameStore.getState().progression.coins).toBe(50);
    expect(useGameStore.getState().progression.unlockedAvatars).toEqual(["avatar_classic_detective", "avatar_cyber_detective"]);
    expect(useGameStore.getState().progression.equippedStamp).toBe("stamp_verified");

    purchaseSpy.mockRestore();
  });

  it("SEC-06: Multiplayer authoritative reward synchronization sets totals directly", () => {
    useGameStore.getState().syncAuthoritativeRewards(1200, 850, 5);

    expect(useGameStore.getState().progression.xp).toBe(1200);
    expect(useGameStore.getState().progression.coins).toBe(850);
    expect(useGameStore.getState().progression.level).toBe(5);
  });
});
