/**
 * app/results/[roomId]/page.tsx
 * ──────────────────────────────
 * Post-game results screen. Shows:
 * - Who won (innocent team or impostor)
 * - All roles revealed
 * - Vote breakdown
 * - Play again button
 */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGameStore } from "@/lib/store";

export default function ResultsPage() {
  const router = useRouter();
  const { user, gameResult, players, myRole, resetGame } = useGameStore();

  useEffect(() => {
    if (!user) router.push("/");
  }, [user, router]);

  const playAgain = () => {
    resetGame();
    router.push("/lobby");
  };

  if (!gameResult) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Loading results…</p>
          <button onClick={playAgain} className="btn-secondary mt-4">
            Back to Lobby
          </button>
        </div>
      </main>
    );
  }

  const isWinner =
    (myRole?.team === "innocent" && gameResult.winner === "innocent") ||
    (myRole?.team === "impostor" && gameResult.winner === "impostor");

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full space-y-6">
        {/* Result Banner */}
        <div
          className={`game-card text-center py-8 border-2 ${
            isWinner ? "border-game-green" : "border-game-accent"
          }`}
        >
          <div className="text-6xl mb-4">{isWinner ? "🏆" : "💀"}</div>
          <h1 className="text-3xl font-black">
            {gameResult.winner === "innocent" ? "Innocents Win!" : "Impostor Wins!"}
          </h1>
          <p
            className={`text-lg mt-2 font-semibold ${
              isWinner ? "text-game-green" : "text-game-accent"
            }`}
          >
            {isWinner ? "You were on the winning side!" : "You lost this round."}
          </p>
        </div>

        {/* Role Reveals */}
        <div className="game-card">
          <h2 className="text-lg font-semibold mb-4">Role Reveals</h2>
          <div className="grid grid-cols-2 gap-3">
            {gameResult.players.map((player) => (
              <div
                key={player.sid}
                className="flex items-center gap-3 p-3 rounded-lg bg-game-dark"
              >
                <span className="text-2xl">{player.avatar}</span>
                <div>
                  <p className="font-medium text-sm">{player.username}</p>
                  <p className="text-xs text-gray-400">
                    {player.role?.emoji} {player.role?.name}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Play Again */}
        <button onClick={playAgain} className="btn-primary w-full text-lg py-4">
          🎮 Play Again
        </button>
      </div>
    </main>
  );
}
