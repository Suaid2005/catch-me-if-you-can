/**
 * app/vault/page.tsx
 * ──────────────────
 * Cosmetic Vault, Progression & Daily Missions.
 * Players spend coins earned purely through gameplay to unlock
 * neon avatar frames, vote stamps, and custom titles.
 */
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sound } from "@/lib/sound";

const MISSIONS = [
  { id: 1, title: "Party Starter", desc: "Play 3 matches in any mode", progress: 2, total: 3, rewardCoins: 100, rewardXp: 200, done: false },
  { id: 2, title: "Master of Disguise", desc: "Win a match as Undercover Citizen", progress: 1, total: 1, rewardCoins: 150, rewardXp: 300, done: true },
  { id: 3, title: "Mind Reader", desc: "Guess the secret word correctly when caught", progress: 0, total: 1, rewardCoins: 200, rewardXp: 350, done: false }
];

const ITEMS = [
  { id: "frame_neon_cyan", name: "Neon Glitch Ring", type: "Avatar Frame", price: 250, rarity: "Rare", color: "#00F5D4", unlocked: false },
  { id: "frame_gold_detective", name: "Golden Detective Aura", type: "Avatar Frame", price: 500, rarity: "Epic", color: "#FFD166", unlocked: false },
  { id: "frame_crimson_shadow", name: "Crimson Shadow Cloak", type: "Avatar Frame", price: 750, rarity: "Legendary", color: "#FF2E63", unlocked: false },
  { id: "stamp_sus", name: "🚨 SUS! Stamp", type: "Vote Stamp", price: 150, rarity: "Common", color: "#E94560", unlocked: true },
  { id: "stamp_caught", name: "🔒 CAUGHT Stamp", type: "Vote Stamp", price: 300, rarity: "Rare", color: "#4A90D9", unlocked: false },
  { id: "stamp_guilty", name: "⚖️ GUILTY Stamp", type: "Vote Stamp", price: 450, rarity: "Epic", color: "#9B59B6", unlocked: false }
];

export default function VaultPage() {
  const router = useRouter();
  const [coins, setCoins] = useState(620);
  const [unlockedItems, setUnlockedItems] = useState<string[]>(["stamp_sus"]);
  const [activeTab, setActiveTab] = useState<"store" | "missions">("store");
  const [purchaseMsg, setPurchaseMsg] = useState("");

  const handleBuy = (item: typeof ITEMS[0]) => {
    sound.playClick();
    if (unlockedItems.includes(item.id)) return;
    if (coins < item.price) {
      setPurchaseMsg("Not enough coins! Play more matches to earn coins.");
      return;
    }
    setCoins(coins - item.price);
    setUnlockedItems([...unlockedItems, item.id]);
    sound.playVictory();
    setPurchaseMsg(`🎉 Unlocked ${item.name}!`);
    setTimeout(() => setPurchaseMsg(""), 3000);
  };

  return (
    <main className="min-h-screen bg-game-dark text-white p-4 md:p-8 flex flex-col items-center">
      {/* Top Bar */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-8">
        <button
          onClick={() => { sound.playClick(); router.push("/"); }}
          className="text-gray-400 hover:text-white text-xs font-semibold flex items-center gap-1.5"
        >
          ← Back to Home
        </button>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 bg-game-card border border-game-gold/40 px-3.5 py-1.5 rounded-full shadow-md shadow-game-gold/10">
            <span className="text-base">🪙</span>
            <span className="text-sm font-black text-game-gold tracking-wide">{coins}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-game-card border border-cyan-500/40 px-3.5 py-1.5 rounded-full">
            <span className="text-xs font-bold text-cyan-300">LVL 4</span>
            <div className="w-14 h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="w-3/4 h-full bg-cyan-400 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      <div className="w-full max-w-4xl space-y-6">
        {/* Title Header */}
        <div className="text-center">
          <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-game-gold via-white to-cyan-400">
            🏆 Cosmetic Vault & Missions
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Unlock neon frames, custom vote stamps, and badges. 100% free through gameplay!
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex justify-center gap-3">
          <button
            onClick={() => { sound.playClick(); setActiveTab("store"); }}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === "store"
                ? "bg-game-accent text-white shadow-lg shadow-game-accent/30"
                : "bg-game-card border border-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            🛍️ Cosmetic Store
          </button>
          <button
            onClick={() => { sound.playClick(); setActiveTab("missions"); }}
            className={`px-6 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
              activeTab === "missions"
                ? "bg-game-accent text-white shadow-lg shadow-game-accent/30"
                : "bg-game-card border border-gray-800 text-gray-400 hover:text-white"
            }`}
          >
            📋 Daily Missions
          </button>
        </div>

        {purchaseMsg && (
          <p className="p-3 bg-purple-900/40 border border-purple-500 text-center text-xs font-bold rounded-xl text-game-gold animate-bounce">
            {purchaseMsg}
          </p>
        )}

        {/* COSMETIC STORE */}
        {activeTab === "store" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {ITEMS.map((item) => {
              const isUnlocked = unlockedItems.includes(item.id);
              return (
                <div
                  key={item.id}
                  className="game-card flex flex-col justify-between hover:border-gray-500 transition-all p-5"
                >
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-gray-400">
                        {item.type}
                      </span>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                        style={{ borderColor: item.color, color: item.color }}
                      >
                        {item.rarity}
                      </span>
                    </div>

                    {/* Preview box */}
                    <div className="h-28 rounded-xl bg-game-dark flex items-center justify-center border border-gray-800 mb-4 relative overflow-hidden">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shadow-lg"
                        style={{
                          border: `3px solid ${item.color}`,
                          boxShadow: `0 0 15px ${item.color}40`,
                          backgroundColor: "#131629"
                        }}
                      >
                        🕵️
                      </div>
                    </div>

                    <h3 className="font-bold text-sm text-white">{item.name}</h3>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-800 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs">🪙</span>
                      <span className="text-xs font-bold text-game-gold">{item.price}</span>
                    </div>

                    <button
                      onClick={() => handleBuy(item)}
                      disabled={isUnlocked}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${
                        isUnlocked
                          ? "bg-green-950/60 text-green-300 border border-green-800 cursor-default"
                          : "bg-game-accent hover:brightness-110 text-white shadow-md shadow-game-accent/20 active:scale-95"
                      }`}
                    >
                      {isUnlocked ? "✓ Unlocked" : "Unlock"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DAILY MISSIONS */}
        {activeTab === "missions" && (
          <div className="space-y-3">
            {MISSIONS.map((m) => (
              <div
                key={m.id}
                className="game-card flex items-center justify-between p-4 bg-game-card/80 border border-gray-800"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-lg ${
                    m.done ? "bg-green-950 text-green-400 border border-green-800" : "bg-purple-950 text-purple-300 border border-purple-800"
                  }`}>
                    {m.done ? "✓" : "🎯"}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-white">{m.title}</h4>
                    <p className="text-xs text-gray-400 mt-0.5">{m.desc}</p>
                    {/* Progress bar */}
                    <div className="w-36 h-1.5 bg-gray-800 rounded-full mt-2 overflow-hidden">
                      <div
                        className="h-full bg-game-accent rounded-full"
                        style={{ width: `${(m.progress / m.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <span className="text-game-gold">+{m.rewardCoins} 🪙</span>
                    <span className="text-cyan-300">+{m.rewardXp} XP</span>
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1 block">
                    {m.progress}/{m.total} completed
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
