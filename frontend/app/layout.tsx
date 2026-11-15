/**
 * app/layout.tsx
 * ──────────────
 * Root layout — wraps every page in the app.
 * Sets the HTML document structure, metadata, and fonts.
 */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://catch-me-if-you-can-red.vercel.app"),
  alternates: {
    canonical: "https://catch-me-if-you-can-red.vercel.app",
  },
  title: "Catch Me If You Can? 🕵️",
  description:
    "A real-time multiplayer social deduction game. Can you catch the impostor — or stay hidden?",
  keywords: ["social deduction", "multiplayer", "game", "impostor", "word game", "party game"],
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico" },
      { url: "/logo.png", type: "image/png" },
    ],
    apple: [
      { url: "/logo.png" },
    ],
  },
  openGraph: {
    title: "Catch Me If You Can? 🕵️",
    description: "Real-time multiplayer social deduction game with AI players.",
    type: "website",
    images: [
      {
        url: "/hero-banner.png",
        width: 1200,
        height: 630,
        alt: "Catch Me If You Can Banner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Catch Me If You Can? 🕵️",
    description: "Real-time multiplayer social deduction game with AI players.",
    images: ["/hero-banner.png"],
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
