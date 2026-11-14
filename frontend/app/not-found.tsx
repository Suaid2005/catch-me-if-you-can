import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-game-dark text-white flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <span className="text-6xl block">🕵️</span>
        <h1 className="text-3xl font-black text-white">404 - Clue Not Found</h1>
        <p className="text-sm text-gray-400">
          The secret room or page you are looking for has vanished into thin air.
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm uppercase transition-all shadow-lg"
        >
          Return to HQ
        </Link>
      </div>
    </main>
  );
}

