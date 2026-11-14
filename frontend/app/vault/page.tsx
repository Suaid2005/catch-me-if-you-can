/**
 * app/vault/page.tsx
 * ──────────────────
 * Cosmetic Vault, Progression & Daily Missions.
 * Players spend coins earned purely through gameplay to unlock
 * authentic detective character avatars, subtle neon frames, and vote stamps.
 */
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { sound } from "@/lib/sound";
import GameHeader from "@/components/ui/GameHeader";
import PlayerAvatar, { AvatarId } from "@/components/ui/PlayerAvatar";

const AVATAR_ITEMS = [
  {
    id: "avatar_classic_detective",
    name: "Classic Detective",
    desc: "The quintessential sharp-eyed investigator with fedora, trench coat, and clue loupe.",
    price: 0,
    rarity: "Standard",
    color: "#b45309",
    isDefault: true,
  },
  {
    id: "avatar_cyber_detective",
    name: "Cyber Detective",
    desc: "Advanced neural operative equipped with cyan digital visor and quantum threat analyzer.",
    price: 150,
    rarity: "Rare",
    color: "#00F5D4",
    isDefault: false,
  },
  {
    id: "avatar_shadow_agent",
    name: "Shadow Agent",
    desc: "Silent operative concealed in obsidian cowl with razor-sharp violet slit optics.",
    price: 200,
    rarity: "Rare",
    color: "#a855f7",
    isDefault: false,
  },
  {
    id: "avatar_neon_hacker",
    name: "Neon Hacker",
    desc: "Synthwave infiltrator sporting electric amber visor goggles and street tech hoodie.",
    price: 250,
    rarity: "Epic",
    color: "#facc15",
    isDefault: false,
  },
  {
    id: "avatar_golden_investigator",
    name: "Golden Investigator",
    desc: "Prestige sleuth adorned in royal gold fedora and 5-point investigator star crest.",
    price: 400,
    rarity: "Legendary",
    color: "#FFD166",
    isDefault: false,
  },
  {
    id: "avatar_mystery_phantom",
    name: "Mystery Phantom",
    desc: "Enigmatic masquerade figure cloaked in midnight velvet and spectral emerald aura.",
    price: 500,
    rarity: "Legendary",
    color: "#10b981",
    isDefault: false,
  },
];

const FRAME_ITEMS = [
  { id: "frame_neon_cyan", name: "Neon Glitch Ring", type: "Avatar Frame", itemType: "frame", price: 250, rarity: "Rare", color: "#00F5D4" },
  { id: "frame_gold_detective", name: "Golden Detective Frame", type: "Avatar Frame", itemType: "frame", price: 500, rarity: "Epic", color: "#FFD166" },
  { id: "frame_crimson_shadow", name: "Crimson Shadow Frame", type: "Avatar Frame", itemType: "frame", price: 750, rarity: "Legendary", color: "#FF2E63" },
];

const STAMP_ITEMS = [
  { id: "stamp_sus", name: "🚨 SUS! Stamp", type: "Vote Stamp", itemType: "stamp", price: 150, rarity: "Common", color: "#E94560" },
  { id: "stamp_caught", name: "🔒 CAUGHT Stamp", type: "Vote Stamp", itemType: "stamp", price: 300, rarity: "Rare", color: "#4A90D9" },
  { id: "stamp_guilty", name: "⚖️ GUILTY Stamp", type: "Vote Stamp", itemType: "stamp", price: 450, rarity: "Epic", color: "#9B59B6" },
];

const MISSIONS = [
  { id: 1, title: "Party Starter", desc: "Play 3 matches in any mode", progress: 2, total: 3, rewardCoins: 100, rewardXp: 200, done: false },
  { id: 2, title: "Master of Disguise", desc: "Win a match as Undercover Citizen", progress: 1, total: 1, rewardCoins: 150, rewardXp: 300, done: true },
  { id: 3, title: "Mind Reader", desc: "Guess the secret word correctly when caught", progress: 0, total: 1, rewardCoins: 200, rewardXp: 350, done: false },
];

export default function VaultPage() {
  const router = useRouter();
  const {
    user,
    progression,
    setProgression,
    equipItem,
    purchaseAvatar,
    purchaseCosmetic,
    equipAvatar,
    hydrateProgression,
    hydrateAuth,
  } = useGameStore();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"avatars" | "frames" | "stamps" | "missions">("avatars");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  useEffect(() => {
    hydrateAuth().then(() => {
      hydrateProgression();
      setMounted(true);
    });
  }, [hydrateAuth, hydrateProgression]);

  const currentCoins = progression?.coins ?? 150;
  const currentLevel = progression?.level ?? 1;
  const currentXp = progression?.xp ?? 0;
  const equippedFrame = progression?.equippedFrame ?? null;
  const equippedStamp = progression?.equippedStamp ?? "stamp_sus";
  const unlockedItems = progression?.unlockedItems ?? ["stamp_sus"];
  const unlockedAvatars = progression?.unlockedAvatars ?? ["avatar_classic_detective"];
  const equippedAvatar = progression?.equippedAvatar ?? "avatar_classic_detective";

  const handleBuyAvatar = (item: (typeof AVATAR_ITEMS)[0]) => {
    sound.playClick();
    if (unlockedAvatars.includes(item.id)) {
      setFeedbackMsg(`You already own ${item.name}!`);
      setTimeout(() => setFeedbackMsg(""), 2500);
      return;
    }
    if (currentCoins < item.price) {
      setFeedbackMsg("Not enough coins! Play matches or complete missions to earn more.");
      setTimeout(() => setFeedbackMsg(""), 3500);
      return;
    }

    const success = purchaseAvatar(item.id, item.price);
    if (success) {
      sound.playVictory();
      setFeedbackMsg(`🎉 Unlocked & equipped ${item.name}!`);
      setTimeout(() => setFeedbackMsg(""), 3500);
    }
  };

  const handleEquipAvatar = (item: (typeof AVATAR_ITEMS)[0]) => {
    sound.playClick();
    equipAvatar(item.id);
    setFeedbackMsg(`✨ Equipped ${item.name}!`);
    setTimeout(() => setFeedbackMsg(""), 2500);
  };

  const handleBuyCosmetic = (item: (typeof FRAME_ITEMS)[0]) => {
    sound.playClick();
    if (unlockedItems.includes(item.id)) return;
    if (currentCoins < item.price) {
      setFeedbackMsg("Not enough coins! Complete matches to earn coins.");
      setTimeout(() => setFeedbackMsg(""), 3500);
      return;
    }
    const success = purchaseCosmetic(item.id, item.itemType as "frame" | "stamp", item.price);
    if (success) {
      sound.playVictory();
      setFeedbackMsg(`🎉 Unlocked & equipped ${item.name}!`);
      setTimeout(() => setFeedbackMsg(""), 3500);
    }
  };

  const handleEquipCosmetic = (item: (typeof FRAME_ITEMS)[0]) => {
    sound.playClick();
    equipItem(item.itemType as "frame" | "stamp", item.id);
    setFeedbackMsg(`✨ Equipped ${item.name}!`);
    setTimeout(() => setFeedbackMsg(""), 2500);
  };

  const handleUnequipCosmetic = (item: (typeof FRAME_ITEMS)[0]) => {
    sound.playClick();
    equipItem(item.itemType as "frame" | "stamp", null);
    setFeedbackMsg(`Unequipped ${item.name}`);
    setTimeout(() => setFeedbackMsg(""), 2500);
  };

  const activeAvatarObj = AVATAR_ITEMS.find((a) => a.id === equippedAvatar) || AVATAR_ITEMS[0];
  const activeFrameObj = FRAME_ITEMS.find((f) => f.id === equippedFrame);
  const activeStampObj = STAMP_ITEMS.find((s) => s.id === equippedStamp);

  return (
    <main className="min-h-screen bg-game-dark text-white p-4 md:p-8 flex flex-col items-center">
      {/* Top Header */}
      <GameHeader showBack={true} backHref="/" backLabel="Back to Menu" />

      <div className="w-full max-w-4xl space-y-6">
        {/* Title Header */}
        <div className="text-center">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-game-gold via-white to-cyan-400">
            🏆 Cosmetic Vault & Detective Shop
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Collect authentic detective avatars, subtle frames, and vote stamps. Earn coins 100% free through gameplay!
          </p>
        </div>

        {/* Active Equipment & Currency HUD */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 md:p-5 rounded-2xl bg-slate-900/90 border border-purple-500/30 shadow-xl">
          <div className="flex items-center gap-4">
            <PlayerAvatar
              avatar={equippedAvatar}
              name={user?.username || "You"}
              size="md"
              frame={equippedFrame}
            />
            <div>
              <div className="text-sm font-black text-white flex items-center gap-2">
                <span>{user ? user.username : "Guest Agent"}</span>
                <span className="text-[10px] text-amber-400 font-mono px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40">
                  ⭐ Lvl {currentLevel}
                </span>
              </div>
              <div className="text-xs text-gray-400 flex flex-wrap items-center gap-2 mt-1">
                <span>
                  Avatar: <strong className="text-amber-300">{activeAvatarObj.name}</strong>
                </span>
                <span>•</span>
                <span>
                  Frame:{" "}
                  <strong className="text-cyan-300">
                    {activeFrameObj ? activeFrameObj.name : "None (Default)"}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Stamp:{" "}
                  <strong className="text-pink-400">
                    {activeStampObj ? activeStampObj.name : "Default"}
                  </strong>
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold px-4 py-2 bg-amber-500/10 border border-amber-500/40 rounded-xl text-amber-300 shadow-md">
            <span className="text-base">🪙</span>
            <span className="font-mono text-base font-black">{currentCoins}</span>
            <span className="text-[10px] uppercase font-black tracking-wider text-amber-400/80">Coins</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              sound.playClick();
              setActiveTab("avatars");
            }}
            className={`px-5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${activeTab === "avatars"
                ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black shadow-lg shadow-amber-500/30"
                : "bg-slate-900 border border-gray-800 text-gray-400 hover:text-white"
              }`}
          >
            🕵️ Detective Avatars
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setActiveTab("frames");
            }}
            className={`px-5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${activeTab === "frames"
                ? "bg-game-accent text-white shadow-lg shadow-game-accent/30 font-black"
                : "bg-slate-900 border border-gray-800 text-gray-400 hover:text-white"
              }`}
          >
            🖼️ Cosmetic Frames
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setActiveTab("stamps");
            }}
            className={`px-5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${activeTab === "stamps"
                ? "bg-game-accent text-white shadow-lg shadow-game-accent/30 font-black"
                : "bg-slate-900 border border-gray-800 text-gray-400 hover:text-white"
              }`}
          >
            🚨 Vote Stamps
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setActiveTab("missions");
            }}
            className={`px-5 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${activeTab === "missions"
                ? "bg-game-accent text-white shadow-lg shadow-game-accent/30 font-black"
                : "bg-slate-900 border border-gray-800 text-gray-400 hover:text-white"
              }`}
          >
            📋 Daily Missions
          </button>
        </div>

        {feedbackMsg && (
          <p className="p-3 bg-purple-950/80 border border-purple-500 text-center text-xs font-bold rounded-xl text-amber-300 animate-pulse">
            {feedbackMsg}
          </p>
        )}

        {/* 1. DETECTIVE AVATARS TAB */}
        {activeTab === "avatars" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {AVATAR_ITEMS.map((item) => {
              const isOwned = unlockedAvatars.includes(item.id);
              const isEquipped = equippedAvatar === item.id;

              return (
                <div
                  key={item.id}
                  className={`game-card flex flex-col justify-between transition-all p-5 rounded-2xl bg-slate-900/80 border ${isEquipped
                      ? "border-amber-400 shadow-lg shadow-amber-500/20"
                      : isOwned
                        ? "border-purple-500/40 hover:border-purple-400"
                        : "border-gray-800 hover:border-gray-600"
                    }`}
                >
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                        Character Avatar
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isEquipped && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50">
                            In Use
                          </span>
                        )}
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{ borderColor: item.color, color: item.color }}
                        >
                          {item.rarity}
                        </span>
                      </div>
                    </div>

                    {/* Preview box */}
                    <div className="h-28 rounded-xl bg-slate-950 flex items-center justify-center border border-gray-800/80 mb-3 relative overflow-hidden">
                      <PlayerAvatar
                        avatar={item.id as AvatarId}
                        size="xl"
                        frame={isEquipped ? equippedFrame : null}
                      />
                    </div>

                    <h3 className="font-bold text-sm text-white">{item.name}</h3>
                    <p className="text-xs text-gray-400 mt-1 leading-snug line-clamp-2">
                      {item.desc}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs">🪙</span>
                      <span className="text-xs font-bold text-amber-400">
                        {item.price === 0 ? "Free (Starter)" : item.price}
                      </span>
                    </div>

                    <div>
                      {isEquipped ? (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          In Use
                        </span>
                      ) : isOwned ? (
                        <button
                          onClick={() => handleEquipAvatar(item)}
                          className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-md active:scale-95"
                        >
                          Equip
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBuyAvatar(item)}
                          disabled={currentCoins < item.price}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Unlock 🪙
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 2. COSMETIC FRAMES TAB */}
        {activeTab === "frames" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {FRAME_ITEMS.map((item) => {
              const isUnlocked = unlockedItems.includes(item.id);
              const isEquipped = equippedFrame === item.id;

              return (
                <div
                  key={item.id}
                  className={`game-card flex flex-col justify-between transition-all p-5 rounded-2xl bg-slate-900/80 border ${isEquipped ? "border-cyan-400/80 shadow-lg shadow-cyan-500/10" : "border-gray-800 hover:border-gray-600"
                    }`}
                >
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                        Cosmetic Accessory
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isEquipped && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/50">
                            Equipped
                          </span>
                        )}
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{ borderColor: item.color, color: item.color }}
                        >
                          {item.rarity}
                        </span>
                      </div>
                    </div>

                    {/* Preview box */}
                    <div className="h-28 rounded-xl bg-slate-950 flex items-center justify-center border border-gray-800/80 mb-3 relative overflow-hidden">
                      <PlayerAvatar
                        avatar={equippedAvatar}
                        size="xl"
                        frame={item.id}
                      />
                    </div>

                    <h3 className="font-bold text-sm text-white">{item.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Tight animated border around your detective avatar.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs">🪙</span>
                      <span className="text-xs font-bold text-amber-400">{item.price}</span>
                    </div>

                    <div>
                      {isEquipped ? (
                        <button
                          onClick={() => handleUnequipCosmetic(item)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-gray-400 hover:text-white border border-gray-700 bg-gray-800/50 hover:bg-gray-800"
                        >
                          Unequip
                        </button>
                      ) : isUnlocked ? (
                        <button
                          onClick={() => handleEquipCosmetic(item)}
                          className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-md active:scale-95"
                        >
                          Equip
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBuyCosmetic(item)}
                          disabled={currentCoins < item.price}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Unlock 🪙
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 3. VOTE STAMPS TAB */}
        {activeTab === "stamps" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {STAMP_ITEMS.map((item) => {
              const isUnlocked = unlockedItems.includes(item.id);
              const isEquipped = equippedStamp === item.id;

              return (
                <div
                  key={item.id}
                  className={`game-card flex flex-col justify-between transition-all p-5 rounded-2xl bg-slate-900/80 border ${isEquipped ? "border-pink-500/80 shadow-lg shadow-pink-500/10" : "border-gray-800 hover:border-gray-600"
                    }`}
                >
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                        Voting Stamp
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isEquipped && (
                          <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-pink-950 text-pink-300 border border-pink-500/50">
                            Equipped
                          </span>
                        )}
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                          style={{ borderColor: item.color, color: item.color }}
                        >
                          {item.rarity}
                        </span>
                      </div>
                    </div>

                    <div className="h-28 rounded-xl bg-slate-950 flex items-center justify-center border border-gray-800/80 mb-3 relative overflow-hidden">
                      <div
                        className="px-4 py-2 rounded-xl text-xs font-black border shadow-lg uppercase tracking-wider"
                        style={{
                          borderColor: item.color,
                          color: item.color,
                          backgroundColor: `${item.color}15`,
                          boxShadow: `0 0 16px ${item.color}30`,
                        }}
                      >
                        {item.name}
                      </div>
                    </div>

                    <h3 className="font-bold text-sm text-white">{item.name}</h3>
                    <p className="text-xs text-gray-400 mt-1">
                      Custom stamp shown on ballot cards when casting your accusation.
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs">🪙</span>
                      <span className="text-xs font-bold text-amber-400">{item.price}</span>
                    </div>

                    <div>
                      {isEquipped ? (
                        <span className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-pink-500/20 text-pink-300 border border-pink-500/40">
                          In Use
                        </span>
                      ) : isUnlocked ? (
                        <button
                          onClick={() => handleEquipCosmetic(item)}
                          className="px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-md active:scale-95"
                        >
                          Equip
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBuyCosmetic(item)}
                          disabled={currentCoins < item.price}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Unlock 🪙
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 4. DAILY MISSIONS TAB */}
        {activeTab === "missions" && (
          <div className="space-y-3">
            {MISSIONS.map((m) => {
              const pct = Math.min(100, Math.round((m.progress / m.total) * 100));
              return (
                <div
                  key={m.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all ${m.done
                      ? "bg-slate-900/60 border-emerald-500/40 opacity-80"
                      : "bg-slate-900/90 border-purple-500/20 hover:border-purple-500/40"
                    }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{m.title}</span>
                      {m.done && (
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/50">
                          ✓ Completed
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{m.desc}</p>
                    <div className="flex items-center gap-3 pt-1">
                      <div className="w-32 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-amber-400"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-mono text-gray-400">
                        {m.progress}/{m.total}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className="text-xs font-bold px-2.5 py-1 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 flex items-center gap-1">
                      🪙 +{m.rewardCoins}
                    </span>
                    <span className="text-xs font-bold px-2.5 py-1 bg-purple-500/10 border border-purple-500/30 rounded-lg text-purple-300 flex items-center gap-1">
                      ⭐ +{m.rewardXp} XP
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
