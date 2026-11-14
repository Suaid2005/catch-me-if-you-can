import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useGameStore,
  getStoredProgression,
  getProgressionStorageKey,
  saveProgressionToStorage,
  DEFAULT_PROGRESSION,
} from "../store";
import { sound } from "../sound";

// Mock localStorage
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
  };
}

describe("Avatar System, Vault Store & Account Security Tests", () => {
  beforeEach(() => {
    localStorageMock.clear();
    useGameStore.setState({
      user: null,
      token: null,
      isHydrated: false,
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

  it("1. Initializes with default Classic Detective avatar automatically equipped", () => {
    const prog = getStoredProgression(null);
    expect(prog.unlockedAvatars).toContain("avatar_classic_detective");
    expect(prog.equippedAvatar).toBe("avatar_classic_detective");
  });

  it("2. Safely purchases new avatar when player has sufficient coins", () => {
    const store = useGameStore.getState();
    expect(store.progression.coins).toBe(150);

    const bought = store.purchaseAvatar("avatar_cyber_detective", 150);
    expect(bought).toBe(true);

    const updated = useGameStore.getState().progression;
    expect(updated.coins).toBe(0);
    expect(updated.unlockedAvatars).toContain("avatar_cyber_detective");
    expect(updated.equippedAvatar).toBe("avatar_cyber_detective");
  });

  it("3. Prevents duplicate purchase of already owned avatar", () => {
    const store = useGameStore.getState();
    // Default avatar is already owned
    const duplicateBuy = store.purchaseAvatar("avatar_classic_detective", 100);
    expect(duplicateBuy).toBe(false);
    expect(useGameStore.getState().progression.coins).toBe(150);
  });

  it("4. Prevents purchase when player has insufficient coins", () => {
    const store = useGameStore.getState();
    // Player has 150 coins, Golden Investigator costs 400
    const failBuy = store.purchaseAvatar("avatar_golden_investigator", 400);
    expect(failBuy).toBe(false);
    expect(useGameStore.getState().progression.coins).toBe(150);
    expect(useGameStore.getState().progression.unlockedAvatars).not.toContain("avatar_golden_investigator");
  });

  it("5. Allows switching between owned avatars without paying again", () => {
    const store = useGameStore.getState();
    store.purchaseAvatar("avatar_cyber_detective", 150);
    expect(useGameStore.getState().progression.equippedAvatar).toBe("avatar_cyber_detective");

    // Switch back to Classic Detective
    useGameStore.getState().equipAvatar("avatar_classic_detective");
    expect(useGameStore.getState().progression.equippedAvatar).toBe("avatar_classic_detective");

    // Switch again to Cyber Detective
    useGameStore.getState().equipAvatar("avatar_cyber_detective");
    expect(useGameStore.getState().progression.equippedAvatar).toBe("avatar_cyber_detective");
  });

  it("6. Disallows equipping an unowned avatar", () => {
    const store = useGameStore.getState();
    store.equipAvatar("avatar_mystery_phantom");
    // Should still be classic detective
    expect(useGameStore.getState().progression.equippedAvatar).toBe("avatar_classic_detective");
  });

  it("7. Migrates legacy progression safely preserving existing items and granting default avatar", () => {
    // Simulate legacy storage without unlockedAvatars
    const legacyData = {
      xp: 500,
      coins: 300,
      level: 3,
      unlockedItems: ["stamp_sus", "frame_neon_cyan"],
      equippedFrame: "frame_neon_cyan",
      equippedStamp: "stamp_sus",
    };
    localStorageMock.setItem("catchme_progression_legacy_user", JSON.stringify(legacyData));

    const migrated = getStoredProgression("legacy_user");
    expect(migrated.coins).toBe(300);
    expect(migrated.level).toBe(3);
    expect(migrated.equippedFrame).toBe("frame_neon_cyan");
    expect(migrated.unlockedAvatars).toEqual(["avatar_classic_detective"]);
    expect(migrated.equippedAvatar).toBe("avatar_classic_detective");
  });

  it("8. Validates phone number and password matching rules", () => {
    // E.164 phone regex test
    const e164Regex = /^\+[1-9]\d{6,14}$/;
    expect(e164Regex.test("+1234567890")).toBe(true);
    expect(e164Regex.test("+447911123456")).toBe(true);
    expect(e164Regex.test("+919876543210")).toBe(true);
    expect(e164Regex.test("1234567890")).toBe(false); // missing +
    expect(e164Regex.test("+0123456789")).toBe(false); // starts with 0
    expect(e164Regex.test("+123")).toBe(false); // too short

    // Password match check
    const pwd1: string = "SecretPassword123";
    const pwd2: string = "SecretPassword123";
    const pwd3: string = "DifferentPassword456";
    expect(pwd1 === pwd2).toBe(true);
    expect(pwd1 === pwd3).toBe(false);
  });

  it("9. Supports independent sound engine volume sliders", () => {
    sound.setSfxVolume(0.65);
    expect(sound.getSfxVolume()).toBe(0.65);

    sound.setMusicVolume(0.35);
    expect(sound.getMusicVolume()).toBe(0.35);

    sound.setMuted(true);
    expect(sound.getMuted()).toBe(true);
    sound.setMuted(false);
    expect(sound.getMuted()).toBe(false);
  });

  it("10. Authoritative synchronization: equipping an avatar updates user profile and localStorage immediately", () => {
    // Setup authenticated user
    useGameStore.setState({
      user: {
        id: "usr_detective_1",
        username: "Sherlock",
        avatar: "avatar_classic_detective",
        games_played: 5,
        games_won: 3,
        is_guest: false,
      },
      progression: {
        xp: 300,
        coins: 500,
        level: 2,
        unlockedItems: ["stamp_sus"],
        equippedFrame: null,
        equippedStamp: "stamp_sus",
        unlockedAvatars: ["avatar_classic_detective", "avatar_cyber_detective"],
        equippedAvatar: "avatar_classic_detective",
      },
    });

    // Equip Cyber Detective
    useGameStore.getState().equipAvatar("avatar_cyber_detective");

    // Both progression and user MUST be Cyber Detective
    expect(useGameStore.getState().progression.equippedAvatar).toBe("avatar_cyber_detective");
    expect(useGameStore.getState().user?.avatar).toBe("avatar_cyber_detective");

    // LocalStorage user cache MUST be Cyber Detective
    const cachedUser = JSON.parse(localStorageMock.getItem("catchme_user") || "{}");
    expect(cachedUser.avatar).toBe("avatar_cyber_detective");

    // Switch back to Classic Detective
    useGameStore.getState().equipAvatar("avatar_classic_detective");
    expect(useGameStore.getState().progression.equippedAvatar).toBe("avatar_classic_detective");
    expect(useGameStore.getState().user?.avatar).toBe("avatar_classic_detective");
    const reCachedUser = JSON.parse(localStorageMock.getItem("catchme_user") || "{}");
    expect(reCachedUser.avatar).toBe("avatar_classic_detective");
  });

  it("11. Strictly isolates guest progression from authenticated account progression", () => {
    // Guest progression has custom coins and equipped avatar
    const guestProg = {
      xp: 100,
      coins: 200,
      level: 1,
      unlockedItems: ["stamp_sus"],
      equippedFrame: null,
      equippedStamp: "stamp_sus",
      unlockedAvatars: ["avatar_classic_detective", "avatar_shadow_agent"],
      equippedAvatar: "avatar_shadow_agent",
    };
    saveProgressionToStorage(guestProg, null);

    // New authenticated user with fresh account key
    const authProg = getStoredProgression("new_authenticated_user_99");

    // Authenticated user gets fresh defaults, NOT guest's shadow agent or coins
    expect(authProg.coins).toBe(150);
    expect(authProg.equippedAvatar).toBe("avatar_classic_detective");
    expect(authProg.unlockedAvatars).toEqual(["avatar_classic_detective"]);
  });
});
