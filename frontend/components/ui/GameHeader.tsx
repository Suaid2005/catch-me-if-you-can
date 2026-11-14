"use client";

import React, { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { sound } from "@/lib/sound";
import Avatar3D from "./Avatar3D";
import BrandIcon from "./BrandIcon";

interface GameHeaderProps {
  showBack?: boolean;
  backHref?: string;
  backLabel?: string;
  onOpenAuth?: () => void;
  onOpenSettings?: () => void;
}

export default function GameHeader({
  showBack = false,
  backHref = "/",
  backLabel = "Main Menu",
  onOpenAuth,
  onOpenSettings,
}: GameHeaderProps) {
  const router = useRouter();
  const { user, progression, hydrateProgression, hydrateAuth, clearAuth } = useGameStore();
  const [mounted, setMounted] = useState(false);
  const [soundMuted, setSoundMuted] = useState(false);
  const [musicActive, setMusicActive] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hydrateAuth().then((authUser) => {
      hydrateProgression(authUser?.id);
      setMounted(true);
    });

    if (typeof window !== "undefined") {
      setSoundMuted(sound.getMuted());
      setMusicActive(sound.isMusicEnabled());

      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === "catchme_token" || e.key === "catchme_user") {
          hydrateAuth().then((u) => hydrateProgression(u?.id));
        } else if (
          e.key &&
          (e.key.startsWith("catchme_progression") || e.key === "catchme_practice_progression")
        ) {
          hydrateProgression();
        }
      };

      const handleOutsideClick = (e: MouseEvent) => {
        if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
          setUserMenuOpen(false);
        }
      };

      window.addEventListener("storage", handleStorageChange);
      document.addEventListener("mousedown", handleOutsideClick);
      return () => {
        window.removeEventListener("storage", handleStorageChange);
        document.removeEventListener("mousedown", handleOutsideClick);
      };
    }
  }, [hydrateAuth, hydrateProgression]);

  useEffect(() => {
    if (user?.id) {
      hydrateProgression(user.id);
    }
  }, [user?.id, hydrateProgression]);

  const toggleSound = () => {
    const isMuted = sound.toggleMute();
    setSoundMuted(isMuted);
    if (!isMuted) sound.playClick();
  };

  const toggleMusic = () => {
    const isEnabled = sound.toggleMusic();
    setMusicActive(isEnabled);
    if (isEnabled) sound.playClick();
  };

  const handleConfirmLogout = () => {
    sound.playClick();
    clearAuth();
    setShowLogoutModal(false);
    setUserMenuOpen(false);
  };

  const coins = mounted ? progression?.coins ?? 150 : 150;
  const level = mounted ? progression?.level ?? 1 : 1;
  const xp = mounted ? progression?.xp ?? 0 : 0;
  const levelProgress = Math.round(((xp % 250) / 250) * 100);
  const equippedFrame = progression?.equippedFrame ?? null;
  const equippedAvatar = progression?.equippedAvatar ?? user?.avatar ?? "avatar_classic_detective";

  return (
    <>
      <header className="relative z-20 w-full max-w-6xl mx-auto px-4 py-3 md:py-4 flex flex-wrap items-center justify-between gap-3 border-b border-gray-800/80 bg-slate-950/40 backdrop-blur-xl rounded-2xl mb-4 shadow-xl shadow-black/40">
        {/* LEFT: Brand Identity or Back Button */}
        <div className="flex items-center gap-3">
          {showBack ? (
            <button
              onClick={() => {
                sound.playClick();
                router.push(backHref);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-800 bg-slate-900/80 hover:bg-slate-800 text-xs font-black uppercase text-gray-300 hover:text-white transition-all shadow-sm active:scale-95"
            >
              <span>←</span> {backLabel}
            </button>
          ) : (
            <div
              onClick={() => router.push("/")}
              className="flex items-center gap-3 cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-purple-600 to-cyan-500 p-[2px] shadow-lg shadow-purple-500/20 group-hover:scale-105 transition-transform flex items-center justify-center">
                <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center overflow-hidden">
                  <BrandIcon size={26} />
                </div>
              </div>
              <div>
                <div className="text-sm md:text-base font-black tracking-wider uppercase bg-gradient-to-r from-amber-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                  Catch Me If You Can?
                </div>
                <div className="text-[10px] text-gray-400 font-mono tracking-widest uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Live Social Deduction
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Unified Progression & Profile HUD */}
        <div className="flex items-center flex-wrap gap-2 md:gap-3">
          {/* Level & XP Indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-purple-500/30 text-xs shadow-md">
            <span className="text-amber-400 font-bold">⭐ Lvl {level}</span>
            <div className="w-14 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-amber-400 transition-all duration-500"
                style={{ width: `${Math.max(5, levelProgress)}%` }}
              />
            </div>
            <span className="text-[10px] font-mono text-gray-400">{xp % 250}/250 XP</span>
          </div>

          {/* Vault / Store Button */}
          <button
            onClick={() => {
              sound.playClick();
              router.push("/vault");
            }}
            aria-label="Cosmetic Vault"
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-950/80 via-slate-900 to-purple-950/80 hover:from-amber-900/80 hover:to-purple-900/80 border border-amber-500/50 hover:border-amber-400 text-amber-300 font-bold text-xs shadow-md shadow-amber-500/10 transition-all hover:scale-105 active:scale-95"
          >
            <span className="text-sm">🪙</span>
            <span className="font-mono text-xs">{coins}</span>
            <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border border-amber-500/30">
              Vault
            </span>
          </button>

          {/* Player Profile or Register/Login Button */}
          {user ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => {
                  sound.playClick();
                  setUserMenuOpen((prev) => !prev);
                }}
                className="flex items-center gap-2.5 bg-slate-900/90 hover:bg-slate-800/90 border border-purple-500/40 hover:border-purple-400 rounded-xl px-2.5 py-1.5 backdrop-blur-md shadow-md transition-all active:scale-95 group"
                aria-label="User Account Menu"
              >
                <Avatar3D
                  avatar={equippedAvatar}
                  name={user.username}
                  size="sm"
                  interactive={false}
                  animated={false}
                  frame={equippedFrame}
                />
                <div className="text-left leading-tight pr-1">
                  <span className="block text-xs font-black text-gray-100 group-hover:text-cyan-300 transition-colors max-w-[130px] sm:max-w-[180px] truncate">
                    {user.username}
                  </span>
                  <span className="block text-[9px] text-purple-400 font-mono font-bold uppercase tracking-wider">
                    {user.is_guest ? "Guest Agent" : "Authenticated Agent"}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 group-hover:text-white transition-colors">
                  {userMenuOpen ? "▲" : "▼"}
                </span>
              </button>

              {/* User Dropdown Menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-purple-500/40 rounded-2xl shadow-2xl p-3 z-50 animate-fade-in space-y-3">
                  <div className="pb-2.5 border-b border-gray-800 flex items-center gap-2.5">
                    <Avatar3D
                      avatar={equippedAvatar}
                      name={user.username}
                      size="sm"
                      interactive={false}
                      animated={false}
                      frame={equippedFrame}
                    />
                    <div className="overflow-hidden">
                      <p className="text-xs font-black text-white truncate">{user.username}</p>
                      <p className="text-[10px] text-gray-400 font-mono">
                        Level {level} • {coins} Coins
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <button
                      onClick={() => {
                        sound.playClick();
                        setUserMenuOpen(false);
                        router.push("/vault");
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center justify-between"
                    >
                      <span>🏆 Cosmetic Vault</span>
                      <span className="text-[10px] text-amber-400 font-mono">Equip / Shop</span>
                    </button>

                    {onOpenSettings && (
                      <button
                        onClick={() => {
                          sound.playClick();
                          setUserMenuOpen(false);
                          onOpenSettings();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-gray-300 hover:text-white hover:bg-slate-800/80 transition-colors flex items-center justify-between"
                      >
                        <span>⚙️ Settings & Audio</span>
                        <span className="text-[10px] text-gray-400">Controls</span>
                      </button>
                    )}
                  </div>

                  <div className="pt-2 border-t border-gray-800">
                    <button
                      onClick={() => {
                        sound.playClick();
                        setShowLogoutModal(true);
                        setUserMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-bold text-red-300 hover:text-white bg-red-950/40 hover:bg-red-900/60 border border-red-900/50 transition-all flex items-center justify-center gap-1.5 active:scale-95"
                    >
                      <span>🚪</span> Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => {
                sound.playClick();
                if (onOpenAuth) onOpenAuth();
                else router.push("/login");
              }}
              className="text-xs font-bold px-3.5 py-2 rounded-xl border border-purple-500/50 bg-purple-950/60 hover:bg-purple-900/80 text-purple-200 transition-all shadow-md shadow-purple-950/40 hover:scale-105 active:scale-95"
            >
              Sign In / Register
            </button>
          )}

          {/* Sound Effects Mute Toggle */}
          <button
            onClick={toggleSound}
            aria-label="Toggle Sound Effects"
            title={soundMuted ? "Unmute SFX" : "Mute SFX"}
            className="w-9 h-9 rounded-xl bg-slate-900/80 border border-gray-800 hover:border-gray-700 flex items-center justify-center text-sm text-gray-300 hover:text-white transition-colors shadow-sm active:scale-95"
          >
            {soundMuted ? "🔇" : "🔊"}
          </button>

          {/* Procedural Mystery Soundtrack Toggle (112 BPM) */}
          <button
            onClick={toggleMusic}
            aria-label="Toggle Background Music"
            title={musicActive ? "Music Playing (112 BPM Detective Theme)" : "Start Background Music"}
            className={`w-9 h-9 rounded-xl border transition-all flex items-center justify-center text-sm shadow-sm active:scale-95 ${
              musicActive
                ? "bg-cyan-950/80 border-cyan-500/60 text-cyan-300 shadow-cyan-500/20 shadow-md animate-pulse"
                : "bg-slate-900/80 border-gray-800 hover:border-gray-700 text-gray-400 hover:text-gray-200"
            }`}
          >
            🎵
          </button>

          {/* Settings Modal Toggle */}
          {onOpenSettings && (
            <button
              onClick={() => {
                sound.playClick();
                onOpenSettings();
              }}
              aria-label="Settings"
              title="Game Settings"
              className="w-9 h-9 rounded-xl bg-slate-900/80 border border-gray-800 hover:border-gray-700 flex items-center justify-center text-sm text-gray-300 hover:text-white transition-colors shadow-sm active:scale-95"
            >
              ⚙️
            </button>
          )}
        </div>
      </header>

      {/* Explicit Logout Confirmation Dialog */}
      {showLogoutModal && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-purple-500/40 rounded-2xl p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-purple-950 border border-purple-500/50 flex items-center justify-center text-2xl shadow-inner">
                🕵️
              </div>
              <div>
                <h3 className="text-base font-black text-white">Sign Out?</h3>
                <p className="text-xs text-gray-400">
                  Signed in as <strong className="text-cyan-300">{user.username}</strong>
                </p>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Are you sure you want to log out? Your progression, unlocked Vault cosmetics, and match stats will remain safely stored.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                onClick={() => {
                  sound.playClick();
                  setShowLogoutModal(false);
                }}
                className="px-4 py-2 rounded-xl border border-gray-700 hover:bg-slate-800 text-xs font-bold text-gray-300 hover:text-white transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLogout}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-bold text-white shadow-md shadow-red-600/30 transition-all active:scale-95"
              >
                Confirm Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
