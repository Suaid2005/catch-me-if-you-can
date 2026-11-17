/**
 * app/lobby/page.tsx
 * ───────────────────
 * Online Multiplayer Entry Screen.
 * 
 * Features:
 * - Two large gaming options: CREATE ROOM and JOIN ROOM.
 * - Player avatar selection & display name input.
 * - Error handling for invalid codes, full rooms, or matches already in progress.
 * - Real-time transition to /lobby/[code].
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";
import { authApi, roomApi, getToken } from "@/lib/api";
import { sound } from "@/lib/sound";

const AVATARS = ["🕵️", "🦹", "🤖", "🦊", "🎭", "🕶️", "👩‍🔬", "🧙", "⚡", "👾"];

export default function OnlineMultiplayerEntryPage() {
  const router = useRouter();
  const { user, setAuth, setRoom } = useGameStore();

  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [displayName, setDisplayName] = useState(user?.username || "");
  const [selectedAvatar, setSelectedAvatar] = useState(user?.avatar || "🕵️");
  const [roomCode, setRoomCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.username && !displayName) {
      setDisplayName(user.username);
    }
  }, [user, displayName]);

  const ensureSession = async (): Promise<boolean> => {
    const token = getToken();
    if (user && token) return true;
    try {
      const name = displayName.trim() || user?.username || `Agent_${Math.floor(1000 + Math.random() * 9000)}`;
      const res = await authApi.guest(name);
      setAuth(res.user, res.access_token, res.refresh_token);
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
      const ok = await ensureSession();
      if (!ok) return;

      let room;
      try {
        room = await roomApi.create({ max_players: 8, allow_bots: true });
      } catch (createErr: any) {
        if (createErr?.status === 401 || createErr?.message?.toLowerCase().includes("authenticated")) {
          const name = displayName.trim() || user?.username || `Agent_${Math.floor(1000 + Math.random() * 9000)}`;
          const res = await authApi.guest(name);
          setAuth(res.user, res.access_token, res.refresh_token);
          room = await roomApi.create({ max_players: 8, allow_bots: true });
        } else {
          throw createErr;
        }
      }
      setRoom(room);
      sound.playVictory();
      router.push(`/lobby/${room.code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create online room");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    let code = roomCode.trim();
    // Support pasting full lobby URLs or raw codes with spaces/hyphens
    const urlMatch = code.match(/\/lobby\/([A-Za-z0-9]{6})/i);
    if (urlMatch) {
      code = urlMatch[1];
    } else {
      code = code.replace(/[^A-Za-z0-9]/g, "");
    }
    code = code.toUpperCase();

    if (!code || code.length !== 6) {
      setError("Please enter a valid 6-letter room code");
      return;
    }
    sound.playClick();
    setLoading(true);
    setError("");
    try {
      const ok = await ensureSession();
      if (!ok) return;

      let joinRes;
      try {
        joinRes = await roomApi.join(code);
      } catch (joinErr: any) {
        if (joinErr?.status === 401 || joinErr?.message?.toLowerCase().includes("authenticated")) {
          const name = displayName.trim() || user?.username || `Agent_${Math.floor(1000 + Math.random() * 9000)}`;
          const res = await authApi.guest(name);
          setAuth(res.user, res.access_token, res.refresh_token);
          joinRes = await roomApi.join(code);
        } else {
          throw joinErr;
        }
      }
      setRoom(joinRes.room);
      sound.playVictory();
      router.push(`/lobby/${joinRes.room.code}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Room not found or game already started");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-game-dark text-white relative overflow-hidden flex flex-col justify-between p-4 md:p-8">
      {/* Background Ambience */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-cyan-600/15 rounded-full blur-[140px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 w-full max-w-4xl mx-auto flex items-center justify-between pb-6">
        <button
          onClick={() => { sound.playClick(); router.push("/"); }}
          className="text-xs font-bold text-gray-400 hover:text-white flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-800 bg-slate-900/60 hover:bg-slate-800 transition-colors"
        >
          ← Back to Main Menu
        </button>
        <div className="text-right">
          <span className="text-xs font-mono text-purple-400 uppercase tracking-widest block">
            Online Multiplayer
          </span>
          <span className="text-sm font-black text-gray-200">
            Room Portal
          </span>
        </div>
      </header>

      {/* Center Gaming Card */}
      <div className="relative z-10 w-full max-w-xl mx-auto flex-1 flex flex-col justify-center">
        <div className="bg-slate-950/80 border border-purple-500/30 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl shadow-purple-950/40 space-y-6">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-tr from-purple-600 to-cyan-500 p-[2px] shadow-lg shadow-purple-500/20 mb-2">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-3xl">
                🌐
              </div>
            </div>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
              Live Multiplayer Game
            </h1>
            <p className="text-xs text-gray-400">
              Host a room for your friends or join an existing match with a room code.
            </p>
          </div>

          {/* Large Tab Switcher */}
          <div className="grid grid-cols-2 p-1 bg-slate-900/80 rounded-2xl border border-gray-800">
            <button
              type="button"
              onClick={() => { sound.playClick(); setActiveTab("create"); setError(""); }}
              className={`py-3 rounded-xl font-black text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${activeTab === "create"
                ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-600/30"
                : "text-gray-400 hover:text-gray-200"
                }`}
            >
              <span>👑</span> Create Room
            </button>
            <button
              type="button"
              onClick={() => { sound.playClick(); setActiveTab("join"); setError(""); }}
              className={`py-3 rounded-xl font-black text-sm uppercase tracking-wide transition-all flex items-center justify-center gap-2 ${activeTab === "join"
                ? "bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-lg shadow-cyan-600/30"
                : "text-gray-400 hover:text-gray-200"
                }`}
            >
              <span>🚀</span> Join Room
            </button>
          </div>

          {/* Form */}
          {activeTab === "create" ? (
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-2">
                  Select Your Identity Avatar
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {AVATARS.map((av) => (
                    <button
                      key={av}
                      type="button"
                      onClick={() => { sound.playClick(); setSelectedAvatar(av); }}
                      className={`text-2xl p-2.5 rounded-xl border transition-all ${selectedAvatar === av
                        ? "border-purple-500 bg-purple-950/80 scale-105 shadow-md shadow-purple-500/30"
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
                  Host Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DetectiveAlex"
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
                {loading ? "Creating Game Room..." : "👑 Generate Room & Enter Lobby"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  Room Code (6 Characters)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. S6ZR6H"
                  value={roomCode}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const urlMatch = raw.match(/\/lobby\/([A-Za-z0-9]{6})/i);
                    if (urlMatch) {
                      setRoomCode(urlMatch[1].toUpperCase());
                    } else {
                      setRoomCode(raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6));
                    }
                  }}
                  className="w-full text-center tracking-widest text-2xl font-mono uppercase bg-slate-900 border border-cyan-500/40 rounded-xl px-4 py-3 text-cyan-300 placeholder-gray-600 focus:outline-none focus:border-cyan-400 font-black"
                  maxLength={64}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-300 uppercase mb-1">
                  Your Display Name
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
                {loading ? "Validating Room..." : "🎮 Connect to Game Room"}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer hint */}
      <footer className="relative z-10 w-full max-w-4xl mx-auto text-center text-xs text-gray-500 pt-6">
        All connected players must be in the same room code to play together.
      </footer>
    </main>
  );
}
