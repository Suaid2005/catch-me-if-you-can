/**
 * components/ui/SettingsModal.tsx
 * ───────────────────────────────
 * Audio, Theming & Accessibility Controls:
 * - Sound Effects Volume & Mute Toggle
 * - Background Ambient Music (Synthesized via Web Audio API, zero assets needed!)
 * - Theme Selector (Dark Cyber, Neon Light, System)
 * - Reduced Motion Toggle
 * - LocalStorage persistence for user preferences
 */
"use client";

import { useState, useEffect } from "react";
import { sound } from "@/lib/sound";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [sfxMuted, setSfxMuted] = useState(false);
  const [sfxVolume, setSfxVolumeState] = useState(0.8);
  const [bgmMuted, setBgmMuted] = useState(true);
  const [musicVolume, setMusicVolumeState] = useState(0.4);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedTheme = (localStorage.getItem("catchme_theme") as "dark" | "light" | "system") || "dark";
      const savedSfxMute = localStorage.getItem("catchme_sfx_muted") === "true";
      const savedBgmMute = localStorage.getItem("catchme_music_enabled") !== "true";
      const savedReducedMotion = localStorage.getItem("catchme_reduced_motion") === "true";
      const savedSfxVol = sound.getSfxVolume();
      const savedMusicVol = sound.getMusicVolume();

      setTheme(savedTheme);
      setSfxMuted(savedSfxMute);
      setBgmMuted(savedBgmMute);
      setSfxVolumeState(savedSfxVol);
      setMusicVolumeState(savedMusicVol);
      setReducedMotion(savedReducedMotion);

      sound.setMuted(savedSfxMute);
      applyTheme(savedTheme);
    }
  }, []);

  const applyTheme = (selectedTheme: "dark" | "light" | "system") => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (selectedTheme === "light") {
      root.classList.add("light-theme");
      root.classList.remove("dark");
    } else {
      root.classList.remove("light-theme");
      root.classList.add("dark");
    }
    localStorage.setItem("catchme_theme", selectedTheme);
  };

  const handleThemeChange = (newTheme: "dark" | "light" | "system") => {
    sound.playClick();
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  const toggleSfx = () => {
    const nextVal = !sfxMuted;
    setSfxMuted(nextVal);
    sound.setMuted(nextVal);
    if (!nextVal) sound.playClick();
  };

  const handleSfxVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setSfxVolumeState(vol);
    sound.setSfxVolume(vol);
    if (sfxMuted && vol > 0) {
      setSfxMuted(false);
      sound.setMuted(false);
    }
  };

  const toggleBgm = () => {
    sound.playClick();
    const isEnabled = sound.toggleMusic();
    setBgmMuted(!isEnabled);
  };

  const handleMusicVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setMusicVolumeState(vol);
    sound.setMusicVolume(vol);
    if (bgmMuted && vol > 0) {
      sound.toggleMusic();
      setBgmMuted(false);
    }
  };

  const toggleMotion = () => {
    sound.playClick();
    const nextVal = !reducedMotion;
    setReducedMotion(nextVal);
    localStorage.setItem("catchme_reduced_motion", String(nextVal));
    if (typeof document !== "undefined") {
      if (nextVal) {
        document.documentElement.classList.add("reduced-motion");
      } else {
        document.documentElement.classList.remove("reduced-motion");
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-game-card/95 border border-purple-800/60 rounded-2xl p-6 shadow-2xl text-white space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-xl font-black text-game-gold flex items-center gap-2">
            <span>⚙️</span> Game Settings
          </h2>
          <button
            onClick={() => { sound.playClick(); onClose(); }}
            className="text-gray-400 hover:text-white text-lg font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-800"
          >
            ✕
          </button>
        </div>

        {/* Audio Controls */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Audio Settings</h3>

          {/* Sound Effects */}
          <div className="p-3.5 rounded-xl bg-game-dark border border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{sfxMuted ? "🔇" : "🔊"}</span>
                <div>
                  <p className="text-sm font-bold text-white">Sound Effects (SFX)</p>
                  <p className="text-[10px] text-gray-400">Buttons, turn chimes, voting fanfare</p>
                </div>
              </div>
              <button
                onClick={toggleSfx}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  !sfxMuted
                    ? "bg-game-green/20 text-game-green border-game-green/50"
                    : "bg-gray-800 text-gray-400 border-gray-700"
                }`}
              >
                {!sfxMuted ? "ON" : "MUTED"}
              </button>
            </div>
            {/* SFX Volume Slider */}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[10px] text-gray-400 font-mono w-12">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={sfxMuted ? 0 : sfxVolume}
                onChange={handleSfxVolumeChange}
                aria-label="Sound Effects Volume"
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-game-green"
              />
              <span className="text-[10px] text-gray-400 font-mono w-8 text-right">
                {sfxMuted ? "0%" : `${Math.round(sfxVolume * 100)}%`}
              </span>
            </div>
          </div>

          {/* Background Music */}
          <div className="p-3.5 rounded-xl bg-game-dark border border-gray-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{bgmMuted ? "🔇" : "🎵"}</span>
                <div>
                  <p className="text-sm font-bold text-white">Mystery Soundtrack (112 BPM)</p>
                  <p className="text-[10px] text-gray-400">Continuous procedural detective synth theme</p>
                </div>
              </div>
              <button
                onClick={toggleBgm}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                  !bgmMuted
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50"
                    : "bg-gray-800 text-gray-400 border-gray-700"
                }`}
              >
                {!bgmMuted ? "ON" : "OFF"}
              </button>
            </div>
            {/* Music Volume Slider */}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[10px] text-gray-400 font-mono w-12">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={bgmMuted ? 0 : musicVolume}
                onChange={handleMusicVolumeChange}
                aria-label="Background Music Volume"
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-400"
              />
              <span className="text-[10px] text-gray-400 font-mono w-8 text-right">
                {bgmMuted ? "0%" : `${Math.round(musicVolume * 100)}%`}
              </span>
            </div>
          </div>
        </div>

        {/* Theme Settings */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Theme Preference</h3>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: "dark", label: "Dark Cyber", icon: "🌙" },
              { id: "light", label: "Neon Light", icon: "☀️" },
              { id: "system", label: "System", icon: "💻" }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => handleThemeChange(t.id as "dark" | "light" | "system")}
                className={`p-2.5 rounded-xl border text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                  theme === t.id
                    ? "bg-purple-950 border-game-accent text-white shadow-md shadow-game-accent/20"
                    : "bg-game-dark border-gray-800 text-gray-400 hover:border-gray-600"
                }`}
              >
                <span className="text-lg">{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Accessibility Settings */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Accessibility</h3>
          <div className="flex items-center justify-between p-3 rounded-xl bg-game-dark border border-gray-800">
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🏃</span>
              <div>
                <p className="text-sm font-bold text-white">Reduced Motion</p>
                <p className="text-[10px] text-gray-400">Disables intense bouncing and card flips</p>
              </div>
            </div>
            <button
              onClick={toggleMotion}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                reducedMotion
                  ? "bg-purple-900/60 text-purple-200 border-purple-600"
                  : "bg-gray-800 text-gray-400 border-gray-700"
              }`}
            >
              {reducedMotion ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={() => { sound.playClick(); onClose(); }}
          className="btn-primary w-full py-3 text-sm font-bold shadow-md shadow-game-accent/20"
        >
          Done
        </button>
      </div>
    </div>
  );
}
