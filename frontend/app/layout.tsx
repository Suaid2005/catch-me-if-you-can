/**
 * app/layout.tsx
 * ──────────────
 * Root layout — wraps every page in the app.
 * Sets the HTML document structure, metadata, and fonts.
 */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Catch Me If You Can? 🕵️",
  description:
    "A real-time multiplayer social deduction game. Can you catch the impostor — or stay hidden?",
  keywords: ["social deduction", "multiplayer", "game", "impostor"],
  openGraph: {
    title: "Catch Me If You Can?",
    description: "Real-time multiplayer social deduction game with AI players.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-game-dark text-white antialiased">
        {children}
      </body>
    </html>
  );
}
