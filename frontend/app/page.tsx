/**
 * app/page.tsx
 * ─────────────
 * Ultimate Gaming Home Screen for 'Catch Me If You Can?'.
 *
 * Primary Architecture:
 * 1. ONLINE MULTIPLAYER (Dominant Hero Action)
 * 2. LOCAL PASS & PLAY (Single device party mode)
 * 3. PRACTICE VS AI (Neural AI training arena)
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useGameStore } from "@/lib/store";
import { authApi, roomApi } from "@/lib/api";
import { sound } from "@/lib/sound";
import SettingsModal from "@/components/ui/SettingsModal";
import type { TokenResponse } from "@/types/game.types";

const AVATARS = ["🕵️", "🦹", "🤖", "🦊", "🎭", "🕶️", "👩‍🔬", "🧙", "⚡", "👾"];

type ModalType = null | "create_room" | "join_room" | "auth" | "settings";

export default function HomePage() {
  const router = useRouter();
  const { user, setAuth, setRoom } = useGameStore();

  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [soundMuted, setSoundMuted] = useState(false);

  // Forms
  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("🕵️");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.username) {
      setDisplayName(user.username);
    }
    if (user?.avatar) {
      setSelectedAvatar(user.avatar);
    }
  }, [user]);

  const toggleSound = () => {
    const isMuted = sound.toggleMute();
    setSoundMuted(isMuted);
    if (!isMuted) sound.playClick();
  };

  // Ensure user is authenticated (as guest or existing member) before creating/joining
  const ensureUserSession = async (): Promise<boolean> => {
    if (user) return true;
    try {
      const name = displayName.trim() || `Agent_${Math.floor(1000 + Math.random() * 9000)}`;
      const res = await authApi.guest(name);
      setAuth(res.user, res.access_token);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to establish player session");
      return false;
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const ok = await ensureUserSession();
      if (!ok) return;

      const room = await roomApi.create({ max_players: 8, allow_bots: true });
      setRoom(room);
      sound.playVictory();
      router.push(`/lobby/${room.code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create multiplayer room");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCodeInput.trim().toUpperCase();
    if (!code) {
      setError("Please enter a 6-letter room code");
      return;
    }
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const ok = await ensureUserSession();
      if (!ok) return;

      const { room } = await roomApi.join(code);
      setRoom(room);
      sound.playVictory();
      router.push(`/lobby/${room.code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Room not found or match already started");
    } finally {
      setLoading(false);
    }
  };

  const handleAccountAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      let res: TokenResponse;
      if (authMode === "login") {
        res = await authApi.login(username, password);
      } else {
        res = await authApi.register(username, password, email || undefined);
      }
      setAuth(res.user, res.access_token);
      sound.playVictory();
      setActiveModal(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-game-dark text-white relative overflow-hidden flex flex-col justify-between selection:bg-purple-600 selection:text-white">
      {/* Background Ambience & Lighting */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/4 -right-32 w-[32rem] h-[32rem] bg-blue-600/15 rounded-full blur-[140px]" />
        <div className="absolute -bottom-32 left-1/3 w-[36rem] h-[36rem] bg-red-600/15 rounded-full blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
      </div>

      {/* TOP NAVIGATION / GAMING HUD HEADER */}
      <header className="relative z-20 w-full max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        {/* Brand Chip */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 p-[2px] shadow-lg shadow-purple-500/20">
            <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center text-xl">
              🕵️
            </div>
          </div>
          <div>
            <div className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-amber-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
              Catch Me If You Can?
            </div>
            <div className="text-[10px] text-gray-400 font-mono tracking-widest uppercase">
              Live Party Game
            </div>
          </div>
        </div>

        {/* Player Profile & Actions */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2 bg-slate-900/80 border border-purple-500/30 rounded-full pl-2 pr-4 py-1 backdrop-blur-md">
              <span className="text-xl">{user.avatar || "🕵️"}</span>
              <div className="text-left leading-tight">
                <span className="block text-xs font-bold text-gray-200">
                  {user.username}
                </span>
                <span className="block text-[10px] text-purple-400 font-medium">
                  {user.is_guest ? "Guest Player" : "Agent"}
                </span>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { sound.playClick(); setActiveModal("auth"); }}
              className="text-xs font-bold px-3 py-1.5 rounded-lg border border-purple-500/40 bg-purple-950/40 hover:bg-purple-900/60 text-purple-200 transition-colors"
            >
              Sign In / Register
            </button>
          )}

          {/* Sound Toggle */}
          <button
            onClick={toggleSound}
            aria-label="Toggle Sound"
            className="w-9 h-9 rounded-xl bg-slate-900/80 border border-gray-800 hover:border-gray-700 flex items-center justify-center text-sm text-gray-300 transition-colors"
          >
            {soundMuted ? "🔇" : "🔊"}
          </button>

          {/* Settings */}
          <button
            onClick={() => { sound.playClick(); setActiveModal("settings"); }}
            aria-label="Settings"
            className="w-9 h-9 rounded-xl bg-slate-900/80 border border-gray-800 hover:border-gray-700 flex items-center justify-center text-sm text-gray-300 transition-colors"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* MAIN HERO CONTENT */}
      <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-6 flex-1 flex flex-col items-center justify-center">
        {/* Official Game Logo Hero Banner */}
        <div className="text-center mb-8 relative group">
          <div className="relative inline-block w-full max-w-md md:max-w-lg aspect-[16/10] drop-shadow-[0_12px_36px_rgba(168,85,247,0.35)] transition-transform duration-300 group-hover:scale-[1.02]">
            <Image
              src="/logo.jpg"
              alt="Catch Me If You Can? - Think alike. Speak wisely. Catch the one who doesn't!"
              fill
              priority
              className="object-contain"
            />
          </div>
          <p className="mt-2 text-sm md:text-base font-bold text-amber-300 tracking-wide uppercase drop-shadow">
            Think alike. Speak wisely. Catch the one who doesn&apos;t!
          </p>
        </div>

        {/* 3 PRIMARY WAYS TO PLAY */}
        <div className="w-full max-w-4xl space-y-6">
          {/* 1. DOMINANT HERO: ONLINE MULTIPLAYER */}
          <div className="relative group overflow-hidden rounded-3xl p-[2px] bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 shadow-2xl shadow-purple-900/40">
            <div className="relative bg-gradient-to-br from-slate-950 via-purple-950/60 to-slate-900 rounded-[22px] p-6 md:p-8 backdrop-blur-xl">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="text-center md:text-left space-y-2 max-w-md">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-xs font-black uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    Primary Game Mode · Real-Time Rooms
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center justify-center md:justify-start gap-2">
                    <span>🌐</span> Online Multiplayer
                  </h2>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    Create a private room and share the 6-letter code. Friends join on their own phones or computers for real-time clue rounds and secret voting!
                  </p>
                </div>

                {/* Primary Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                  <button
                    onClick={() => { sound.playClick(); setActiveModal("create_room"); }}
                    className="px-6 py-4 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 text-white font-black text-sm tracking-wide uppercase shadow-lg shadow-purple-600/30 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>👑</span> Create Room
                  </button>
                  <button
                    onClick={() => { sound.playClick(); setActiveModal("join_room"); }}
                    className="px-6 py-4 rounded-xl bg-slate-900/90 hover:bg-slate-800 border-2 border-cyan-500/50 hover:border-cyan-400 text-cyan-300 font-black text-sm tracking-wide uppercase shadow-lg shadow-cyan-900/20 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <span>🚀</span> Join with Code
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2 & 3: SECONDARY OPTIONS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* LOCAL PASS & PLAY */}
            <div
              onClick={() => { sound.playClick(); router.push("/pass-and-play"); }}
              className="cursor-pointer group relative overflow-hidden rounded-2xl border border-gray-800 hover:border-amber-500/60 bg-slate-900/60 hover:bg-slate-900/90 p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-amber-500/10"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  📱
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg text-white group-hover:text-amber-400 transition-colors">
                      Local Pass & Play
                    </h3>
                    <span className="text-xs font-mono text-amber-400 font-semibold bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
                      3–12 Players
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Gather around one device. Privacy screen with eye-shield keeps roles secret while passing the phone!
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 pt-2 group-hover:translate-x-1 transition-transform">
                    Start Local Party →
                  </span>
                </div>
              </div>
            </div>

            {/* PRACTICE VS AI */}
            <div
              onClick={() => { sound.playClick(); router.push("/practice"); }}
              className="cursor-pointer group relative overflow-hidden rounded-2xl border border-gray-800 hover:border-blue-500/60 bg-slate-900/60 hover:bg-slate-900/90 p-5 backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-500/10"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
                  🎯
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors">
                      Practice vs AI
                    </h3>
                    <span className="text-xs font-mono text-cyan-400 font-semibold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
                      Solo Training
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    Train your subtle clues and bluff-detection against smart neural AI bots before facing real friends!
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-cyan-400 pt-2 group-hover:translate-x-1 transition-transform">
                    Enter Practice Arena →
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 30-SECOND HOW TO PLAY VISUAL INFOGRAPHIC */}
        <div className="w-full max-w-4xl mt-10 pt-8 border-t border-gray-800/80">
          <div className="text-center mb-6">
            <span className="text-xs font-mono tracking-widest text-purple-400 uppercase">
              Quick Guide
            </span>
            <h3 className="text-lg font-black text-white tracking-wide">
              How to Play in 3 Simple Steps
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/40 border border-gray-800 rounded-xl p-4 text-center space-y-2">
              <div className="text-3xl">🤫</div>
              <h4 className="text-sm font-bold text-amber-400">1. Peek Your Secret</h4>
              <p className="text-xs text-gray-400">
                Civilians receive the secret word. The Impostor receives no word and must fake it!
              </p>
            </div>
            <div className="bg-slate-900/40 border border-gray-800 rounded-xl p-4 text-center space-y-2">
              <div className="text-3xl">💬</div>
              <h4 className="text-sm font-bold text-purple-400">2. Give Subtle Clues</h4>
              <p className="text-xs text-gray-400">
                Describe the word without naming it. The impostor listens closely and attempts to blend in.
              </p>
            </div>
            <div className="bg-slate-900/40 border border-gray-800 rounded-xl p-4 text-center space-y-2">
              <div className="text-3xl">🗳️</div>
              <h4 className="text-sm font-bold text-rose-400">3. Debate & Vote</h4>
              <p className="text-xs text-gray-400">
                Debate the clues, vote out the suspect! If caught, the impostor can steal the win by guessing the word.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-4 py-4 text-center text-xs text-gray-500 flex flex-col sm:flex-row items-center justify-between gap-2 border-t border-gray-800/50">
        <div>
          🎮 <strong className="text-gray-400">Catch Me If You Can?</strong> — Multiplayer Social Deduction Party Game
        </div>
        <div className="flex items-center gap-4 text-gray-400">
          <span>📱 Mobile & Tablet Ready</span>
          <span>•</span>
          <span>💻 Desktop Browser</span>
        </div>
      </footer>

      {/* MODAL: CREATE ROOM */}
      {activeModal === "create_room" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-purple-500/40 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl relative animate-slide-up">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold"
            >
              ✕
            </button>
            <div className="text-center space-y-1">
              <span className="text-4xl">👑</span>
              <h3 className="text-xl font-black text-white">Create Game Room</h3>
              <p className="text-xs text-gray-400">
                Set your player identity and start a private room for your group.
              </p>
            </div>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                  Choose Your Avatar
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {AVATARS.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => { sound.playClick(); setSelectedAvatar(av); }}
                      className={`text-2xl p-2 rounded-xl border transition-all ${
                        selectedAvatar === av
                          ? "border-purple-500 bg-purple-950/80 scale-110 shadow-lg shadow-purple-500/30"
                          : "border-gray-800 bg-slate-900/60 hover:border-gray-700"
                      }`}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  Your Nickname
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MasterDetective"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold"
                  maxLength={18}
                />
              </div>

              {error && (
                <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 font-black text-sm uppercase tracking-wider text-white shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
              >
                {loading ? "Generating Room..." : "🚀 Launch Room Lobby"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: JOIN ROOM */}
      {activeModal === "join_room" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-cyan-500/40 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl relative animate-slide-up">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold"
            >
              ✕
            </button>
            <div className="text-center space-y-1">
              <span className="text-4xl">🚀</span>
              <h3 className="text-xl font-black text-white">Join Game Room</h3>
              <p className="text-xs text-gray-400">
                Enter the 6-letter room code shared by your match host.
              </p>
            </div>

            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  6-Letter Room Code
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. S6ZR6H"
                  value={roomCodeInput}
                  onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                  className="w-full text-center tracking-widest text-2xl font-mono uppercase bg-slate-900 border border-cyan-500/40 rounded-xl px-4 py-3 text-cyan-300 placeholder-gray-600 focus:outline-none focus:border-cyan-400 font-black"
                  maxLength={6}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  Your Nickname
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Alex"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 font-bold"
                  maxLength={18}
                />
              </div>

              {error && (
                <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 font-black text-sm uppercase tracking-wider text-white shadow-lg shadow-cyan-600/30 transition-all disabled:opacity-50"
              >
                {loading ? "Connecting..." : "🎮 Connect to Room"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: AUTH / SIGN IN */}
      {activeModal === "auth" && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-purple-500/40 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl relative animate-slide-up">
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl font-bold"
            >
              ✕
            </button>
            <div className="flex border-b border-gray-800">
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${
                  authMode === "login"
                    ? "border-purple-500 text-purple-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${
                  authMode === "register"
                    ? "border-purple-500 text-purple-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                Register New Agent
              </button>
            </div>

            <form onSubmit={handleAccountAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  placeholder="DetectiveAlex"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold"
                />
              </div>

              {authMode === "register" && (
                <div>
                  <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                    Email (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="alex@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-900 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 font-bold"
                />
              </div>

              {error && (
                <div className="text-xs font-bold text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-2.5">
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 hover:from-purple-500 hover:to-rose-500 font-black text-sm uppercase tracking-wider text-white shadow-lg shadow-purple-600/30 transition-all disabled:opacity-50"
              >
                {loading ? "Authenticating..." : authMode === "login" ? "Sign In" : "Create Account"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SETTINGS MODAL */}
      <SettingsModal isOpen={activeModal === "settings"} onClose={() => setActiveModal(null)} />
    </main>
  );
}
