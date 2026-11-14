import { describe, it, expect, beforeEach, vi } from "vitest";
import { useGameStore, getStoredProgression, getProgressionStorageKey, saveProgressionToStorage } from "../store";
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

// Polyfill window for Node test environment
if (typeof (global as any).window === "undefined") {
  (global as any).window = {
    localStorage: localStorageMock,
    AudioContext: class {
      currentTime = 0;
      state = "running";
      destination = {};
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      createOscillator() {
        return {
          frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      createBiquadFilter() {
        return {
          frequency: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      resume() { return Promise.resolve(); }
    },
    setTimeout: global.setTimeout.bind(global),
    clearTimeout: global.clearTimeout.bind(global),
  };
}

describe("Account Identity, Persistent Auth & Cosmetic Equipment Tests", () => {
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
      },
    });
  });

  it("1. Scopes progression keys per user to isolate accounts from guests", () => {
    expect(getProgressionStorageKey(null)).toBe("catchme_practice_progression");
    expect(getProgressionStorageKey("user_suaid_123")).toBe("catchme_progression_user_suaid_123");
  });

  it("2. Sets and persists authenticated player identity (SuaidPuthrabail)", () => {
    const mockUser = {
      id: "suaid_uuid_999",
      username: "SuaidPuthrabail",
      avatar: "🧑",
      games_played: 12,
      games_won: 9,
      is_guest: false,
    };
    const mockToken = "jwt_token_sample_abc";

    useGameStore.getState().setAuth(mockUser, mockToken);

    expect(useGameStore.getState().user?.username).toBe("SuaidPuthrabail");
    expect(useGameStore.getState().token).toBe(mockToken);
    expect(localStorage.getItem("catchme_token")).toBe(mockToken);
    expect(JSON.parse(localStorage.getItem("catchme_user")!).username).toBe("SuaidPuthrabail");
  });

  it("3. Unlocks and equips Neon Glitch Ring with full persistence across reload", () => {
    const mockUser = {
      id: "suaid_uuid_999",
      username: "SuaidPuthrabail",
      avatar: "🧑",
      games_played: 12,
      games_won: 9,
      is_guest: false,
    };
    useGameStore.getState().setAuth(mockUser, "token_123");

    // Equip frame
    useGameStore.getState().equipItem("frame", "frame_neon_cyan");
    expect(useGameStore.getState().progression.equippedFrame).toBe("frame_neon_cyan");

    // Verify written to account-scoped localStorage
    const saved = JSON.parse(localStorage.getItem("catchme_progression_suaid_uuid_999")!);
    expect(saved.equippedFrame).toBe("frame_neon_cyan");

    // Simulate page reload by reading stored progression
    const reloaded = getStoredProgression("suaid_uuid_999");
    expect(reloaded.equippedFrame).toBe("frame_neon_cyan");

    // Unequip frame
    useGameStore.getState().equipItem("frame", null);
    expect(useGameStore.getState().progression.equippedFrame).toBeNull();
    const updated = JSON.parse(localStorage.getItem("catchme_progression_suaid_uuid_999")!);
    expect(updated.equippedFrame).toBeNull();
  });

  it("4. Explicit logout clears session and reverts to guest progression safely", () => {
    const mockUser = {
      id: "suaid_uuid_999",
      username: "SuaidPuthrabail",
      avatar: "🧑",
      games_played: 12,
      games_won: 9,
      is_guest: false,
    };
    useGameStore.getState().setAuth(mockUser, "token_123");
    useGameStore.getState().equipItem("frame", "frame_neon_cyan");

    expect(useGameStore.getState().user).not.toBeNull();

    // Call clearAuth
    useGameStore.getState().clearAuth();

    expect(useGameStore.getState().user).toBeNull();
    expect(useGameStore.getState().token).toBeNull();
    expect(localStorage.getItem("catchme_token")).toBeNull();
    expect(localStorage.getItem("catchme_user")).toBeNull();

    // Account-scoped cosmetics remain intact in storage for when they log back in
    const accountProg = JSON.parse(localStorage.getItem("catchme_progression_suaid_uuid_999")!);
    expect(accountProg.equippedFrame).toBe("frame_neon_cyan");
  });

  it("5. Sound engine handles independent music and SFX volume controls & preferences", () => {
    sound.setSfxVolume(0.65);
    expect(sound.getSfxVolume()).toBe(0.65);
    expect(localStorage.getItem("catchme_sfx_volume")).toBe("0.65");

    sound.setMusicVolume(0.45);
    expect(sound.getMusicVolume()).toBe(0.45);
    expect(localStorage.getItem("catchme_music_volume")).toBe("0.45");

    const initialMusicState = sound.isMusicEnabled();
    const toggled = sound.toggleMusic();
    expect(toggled).toBe(!initialMusicState);
    expect(sound.isMusicEnabled()).toBe(toggled);
    expect(localStorage.getItem("catchme_music_enabled")).toBe(String(toggled));
  });
});
