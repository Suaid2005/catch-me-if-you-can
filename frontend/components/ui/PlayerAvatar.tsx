"use client";

import React from "react";

export type AvatarId =
  | "avatar_classic_detective"
  | "avatar_cyber_detective"
  | "avatar_shadow_agent"
  | "avatar_neon_hacker"
  | "avatar_golden_investigator"
  | "avatar_mystery_phantom"
  | "avatar_impostor";

export interface PlayerAvatarProps {
  avatar?: string | null;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  frame?: string | null;
  isImpostor?: boolean;
  badge?: string;
  className?: string;
  onClick?: () => void;
}

const SIZE_CLASSES = {
  xs: "w-7 h-7 min-w-[28px] min-h-[28px]",     // 28px
  sm: "w-9 h-9 min-w-[36px] min-h-[36px]",     // 36px (Target: Header profile 36-40px, Voting cards 32-40px)
  md: "w-10 h-10 min-w-[40px] min-h-[40px]",   // 40px (Target: Gameplay player cards 36-48px, Vault summary 36-44px)
  lg: "w-12 h-12 min-w-[48px] min-h-[48px]",   // 48px (Target: Clue history 44-52px)
  xl: "w-20 h-20 min-w-[80px] min-h-[80px]",   // 80px (Target: Avatar shop previews - visually prominent)
};

export function resolveAvatarId(avatar?: string | null, name?: string, isImpostor?: boolean): AvatarId {
  if (isImpostor) return "avatar_impostor";
  const raw = `${avatar || ""} ${name || ""}`.toLowerCase();

  if (raw.includes("cyber") || raw.includes("robot") || raw.includes("🤖")) {
    return "avatar_cyber_detective";
  }
  if (raw.includes("shadow") || raw.includes("ninja") || raw.includes("cowl") || raw.includes("🕶️")) {
    return "avatar_shadow_agent";
  }
  if (raw.includes("hacker") || raw.includes("neon") || raw.includes("synth") || raw.includes("⚡")) {
    return "avatar_neon_hacker";
  }
  if (raw.includes("gold") || raw.includes("golden") || raw.includes("star") || raw.includes("prestige")) {
    return "avatar_golden_investigator";
  }
  if (raw.includes("phantom") || raw.includes("ghost") || raw.includes("mask") || raw.includes("mystery") || raw.includes("🎭")) {
    return "avatar_mystery_phantom";
  }
  if (raw.includes("impostor") || raw.includes("🦹")) {
    return "avatar_impostor";
  }
  // Default to Classic Detective
  return "avatar_classic_detective";
}

export default function PlayerAvatar({
  avatar,
  name,
  size = "md",
  frame = null,
  isImpostor = false,
  badge,
  className = "",
  onClick,
}: PlayerAvatarProps) {
  const avatarId = resolveAvatarId(avatar, name, isImpostor);
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md;

  // Frame styles: tight borders directly on the avatar container without detached corners or text overlap
  let frameBorder = "border border-gray-700/60";
  let frameGlow = "";

  if (frame === "frame_neon_cyan") {
    frameBorder = "border-2 border-[#00F5D4]";
    frameGlow = "shadow-[0_0_10px_rgba(0,245,212,0.45)] ring-1 ring-[#00F5D4]/40";
  } else if (frame === "frame_gold_detective") {
    frameBorder = "border-2 border-[#FFD166]";
    frameGlow = "shadow-[0_0_10px_rgba(255,209,102,0.45)] ring-1 ring-[#FFD166]/40";
  } else if (frame === "frame_crimson_shadow") {
    frameBorder = "border-2 border-[#FF2E63]";
    frameGlow = "shadow-[0_0_10px_rgba(255,46,99,0.45)] ring-1 ring-[#FF2E63]/40";
  }

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center shrink-0 ${sizeClass} rounded-full overflow-hidden ${frameBorder} ${frameGlow} bg-slate-950 select-none ${className}`}
      style={{ boxSizing: "border-box" }}
    >
      {/* SVG Avatar Artwork */}
      {avatarId === "avatar_classic_detective" && <ClassicDetectiveSvg />}
      {avatarId === "avatar_cyber_detective" && <CyberDetectiveSvg />}
      {avatarId === "avatar_shadow_agent" && <ShadowAgentSvg />}
      {avatarId === "avatar_neon_hacker" && <NeonHackerSvg />}
      {avatarId === "avatar_golden_investigator" && <GoldenInvestigatorSvg />}
      {avatarId === "avatar_mystery_phantom" && <MysteryPhantomSvg />}
      {avatarId === "avatar_impostor" && <ImpostorSvg />}

      {/* Frame Accent Pips (Subtle & Tight) */}
      {frame === "frame_neon_cyan" && (
        <span
          data-testid="frame-neon-cyan"
          className="absolute inset-0 rounded-full pointer-events-none border border-[#00F5D4]/60 animate-pulse"
        />
      )}
      {frame === "frame_gold_detective" && (
        <span
          data-testid="frame-gold-detective"
          className="absolute inset-0 rounded-full pointer-events-none border border-[#FFD166]/60 animate-pulse"
        />
      )}
      {frame === "frame_crimson_shadow" && (
        <span
          data-testid="frame-crimson-shadow"
          className="absolute inset-0 rounded-full pointer-events-none border border-[#FF2E63]/60 animate-pulse"
        />
      )}

      {badge && (
        <span className="absolute bottom-0 right-0 px-1 py-0.2 rounded-full text-[8px] font-black uppercase tracking-wider bg-slate-950 border border-purple-500/70 text-purple-300 shadow-md z-20">
          {badge}
        </span>
      )}
    </div>
  );
}

// ── 1. Classic Detective (Default Sleuth) ──────────────────────────
function ClassicDetectiveSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="classicBg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#090d16" />
        </radialGradient>
        <linearGradient id="trenchCoat" x1="0" y1="0" x2="0" y2="100">
          <stop offset="0%" stopColor="#92400e" />
          <stop offset="100%" stopColor="#451a03" />
        </linearGradient>
        <linearGradient id="fedoraHat" x1="0" y1="0" x2="0" y2="100">
          <stop offset="0%" stopColor="#b45309" />
          <stop offset="100%" stopColor="#78350f" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#classicBg)" />
      
      {/* Trench Coat & Lapels */}
      <path d="M15 100 C 15 78, 30 72, 50 72 C 70 72, 85 78, 85 100 Z" fill="url(#trenchCoat)" />
      <path d="M35 72 L 50 90 L 65 72 Z" fill="#f8fafc" />
      <path d="M48 76 L 50 92 L 52 76 Z" fill="#b91c1c" /> {/* Red Tie */}
      <path d="M26 72 L 40 88 L 33 100 Z" fill="#78350f" /> {/* Lapel Left */}
      <path d="M74 72 L 60 88 L 67 100 Z" fill="#78350f" /> {/* Lapel Right */}
      
      {/* Face & Head */}
      <ellipse cx="50" cy="52" rx="20" ry="21" fill="#fbcfe8" />
      <ellipse cx="50" cy="52" rx="20" ry="21" fill="#fcd34d" opacity="0.6" />
      
      {/* Detective Eyes */}
      <ellipse cx="43" cy="52" rx="3.5" ry="2.2" fill="#0f172a" />
      <ellipse cx="57" cy="52" rx="3.5" ry="2.2" fill="#0f172a" />
      <circle cx="44.2" cy="51.2" r="1.1" fill="#ffffff" />
      <circle cx="58.2" cy="51.2" r="1.1" fill="#ffffff" />
      
      {/* Fedora Hat */}
      <path d="M20 44 C 20 40, 32 38, 50 38 C 68 38, 80 40, 80 44 C 80 46, 68 45, 50 45 C 32 45, 20 46, 20 44 Z" fill="#78350f" />
      <path d="M29 42 C 29 24, 38 18, 50 18 C 62 18, 71 24, 71 42 Z" fill="url(#fedoraHat)" />
      <path d="M29 39 Q 50 42 71 39 L 71 43 Q 50 46 29 43 Z" fill="#1e1b4b" /> {/* Hat Band */}
      
      {/* Magnifying Glass Emblem Pin */}
      <circle cx="68" cy="84" r="5" stroke="#f59e0b" strokeWidth="1.8" fill="#38bdf8" fillOpacity="0.4" />
      <line x1="72" y1="88" x2="77" y2="93" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── 2. Cyber Detective (Cyan Visor Robot) ──────────────────────────
function CyberDetectiveSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="cyberBg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#083344" />
          <stop offset="100%" stopColor="#020617" />
        </radialGradient>
        <linearGradient id="cyberChassis" x1="0" y1="0" x2="0" y2="100">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#475569" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#cyberBg)" />
      
      {/* Chassis Body */}
      <path d="M16 100 C 16 76, 32 70, 50 70 C 68 70, 84 76, 84 100 Z" fill="#1e293b" />
      <path d="M30 78 L 50 94 L 70 78 Z" fill="#0f172a" />
      <circle cx="50" cy="85" r="4" fill="#00f5d4" />
      
      {/* Cyber Ear Pods */}
      <rect x="20" y="44" width="6" height="14" rx="3" fill="#38bdf8" />
      <rect x="74" y="44" width="6" height="14" rx="3" fill="#38bdf8" />
      
      {/* Head Chassis */}
      <rect x="25" y="28" width="50" height="42" rx="14" fill="url(#cyberChassis)" />
      
      {/* Antenna Crest */}
      <line x1="50" y1="28" x2="50" y2="15" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="13" r="3.5" fill="#00f5d4" />
      
      {/* Glowing Cyan Visor */}
      <rect x="30" y="42" width="40" height="13" rx="5" fill="#020617" />
      <rect x="32" y="44" width="36" height="9" rx="3" fill="#00f5d4" />
      <line x1="34" y1="48.5" x2="66" y2="48.5" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

// ── 3. Shadow Agent (Obsidian Cowl & Violet Slits) ─────────────────
function ShadowAgentSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="shadowBg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#2e1065" />
          <stop offset="100%" stopColor="#05020c" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#shadowBg)" />
      
      {/* Dark Tactical Body */}
      <path d="M15 100 C 15 76, 30 70, 50 70 C 70 70, 85 76, 85 100 Z" fill="#0f0b18" />
      <path d="M38 74 L 50 92 L 62 74 Z" fill="#181329" />
      
      {/* Obsidian Hood / Cowl */}
      <path d="M22 66 C 18 36, 30 18, 50 16 C 70 18, 82 36, 78 66 C 72 74, 62 76, 50 76 C 38 76, 28 74, 22 66 Z" fill="#18181b" />
      <path d="M30 62 C 28 42, 36 28, 50 26 C 64 28, 72 42, 70 62 C 64 68, 58 70, 50 70 C 42 70, 36 68, 30 62 Z" fill="#09090b" />
      
      {/* Glowing Violet Optics */}
      <path d="M37 47 L 46 49 L 45 52 L 36 50 Z" fill="#c084fc" />
      <path d="M63 47 L 54 49 L 55 52 L 64 50 Z" fill="#c084fc" />
      <circle cx="41" cy="50" r="1.5" fill="#ffffff" />
      <circle cx="59" cy="50" r="1.5" fill="#ffffff" />
    </svg>
  );
}

// ── 4. Neon Hacker (Synthwave Amber Goggles) ────────────────────────
function NeonHackerSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="neonBg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#4a044e" />
          <stop offset="100%" stopColor="#0a0112" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#neonBg)" />
      
      {/* Streetwear Hoodie */}
      <path d="M15 100 C 15 76, 30 70, 50 70 C 70 70, 85 76, 85 100 Z" fill="#701a75" />
      <path d="M38 72 L 50 90 L 62 72 Z" fill="#a21caf" />
      
      {/* Head & Hair */}
      <ellipse cx="50" cy="50" rx="19" ry="21" fill="#fed7aa" />
      <path d="M28 42 C 28 22, 40 18, 50 18 C 60 18, 72 22, 72 42 C 68 32, 60 26, 50 26 C 40 26, 32 32, 28 42 Z" fill="#06b6d4" />
      
      {/* Cyber Headset */}
      <path d="M26 36 C 26 20, 36 14, 50 14 C 64 14, 74 20, 74 36" stroke="#f43f5e" strokeWidth="3" fill="none" />
      <rect x="23" y="38" width="6" height="12" rx="3" fill="#f43f5e" />
      <rect x="71" y="38" width="6" height="12" rx="3" fill="#f43f5e" />
      
      {/* Synthwave Amber Goggles */}
      <rect x="31" y="43" width="38" height="13" rx="4" fill="#0f172a" stroke="#eab308" strokeWidth="1.5" />
      <rect x="33" y="45" width="16" height="9" rx="2" fill="#facc15" />
      <rect x="51" y="45" width="16" height="9" rx="2" fill="#facc15" />
      <line x1="35" y1="48" x2="46" y2="48" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="53" y1="48" x2="64" y2="48" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ── 5. Golden Investigator (Prestige Royal Sleuth) ──────────────────
function GoldenInvestigatorSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="goldBg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#451a03" />
          <stop offset="100%" stopColor="#0b0500" />
        </radialGradient>
        <linearGradient id="goldHat" x1="0" y1="0" x2="0" y2="100">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="50%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" fill="url(#goldBg)" />
      
      {/* Royal Coat */}
      <path d="M15 100 C 15 76, 30 70, 50 70 C 70 70, 85 76, 85 100 Z" fill="#1e1b4b" />
      <path d="M36 72 L 50 90 L 64 72 Z" fill="#ffffff" />
      <path d="M48 76 L 50 92 L 52 76 Z" fill="#f59e0b" />
      <path d="M28 72 L 40 88 L 34 100 Z" fill="#b45309" stroke="#ffd166" strokeWidth="0.8" />
      <path d="M72 72 L 60 88 L 66 100 Z" fill="#b45309" stroke="#ffd166" strokeWidth="0.8" />
      
      {/* Face & Head */}
      <ellipse cx="50" cy="52" rx="20" ry="21" fill="#fef08a" opacity="0.85" />
      
      {/* Eyes with Golden Specular */}
      <ellipse cx="43" cy="52" rx="3.5" ry="2.2" fill="#451a03" />
      <ellipse cx="57" cy="52" rx="3.5" ry="2.2" fill="#451a03" />
      <circle cx="44.2" cy="51.2" r="1.2" fill="#ffffff" />
      <circle cx="58.2" cy="51.2" r="1.2" fill="#ffffff" />
      
      {/* Golden Fedora */}
      <path d="M19 44 C 19 39, 32 37, 50 37 C 68 37, 81 39, 81 44 C 81 46, 68 45, 50 45 C 32 45, 19 46, 19 44 Z" fill="#d97706" />
      <path d="M28 42 C 28 23, 38 17, 50 17 C 62 17, 72 23, 72 42 Z" fill="url(#goldHat)" />
      <path d="M28 39 Q 50 42 72 39 L 72 43 Q 50 46 28 43 Z" fill="#451a03" />
      
      {/* 5-Point Prestige Star Badge */}
      <polygon points="50,22 52,27 57,27 53,30 55,35 50,32 45,35 47,30 43,27 48,27" fill="#ffffff" />
    </svg>
  );
}

// ── 6. Mystery Phantom (Masquerade Mask & Spectral Green) ───────────
function MysteryPhantomSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="phantomBg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#064e3b" />
          <stop offset="100%" stopColor="#02140d" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#phantomBg)" />
      
      {/* Dark Phantom Velvet Robe */}
      <path d="M15 100 C 15 76, 30 70, 50 70 C 70 70, 85 76, 85 100 Z" fill="#022c22" />
      <path d="M38 72 L 50 90 L 62 72 Z" fill="#064e3b" />
      
      {/* Phantom Hood */}
      <path d="M24 64 C 20 36, 32 20, 50 18 C 68 20, 80 36, 76 64 C 70 72, 60 74, 50 74 C 40 74, 30 72, 24 64 Z" fill="#0f172a" />
      
      {/* Masquerade Half-Mask */}
      <path d="M30 44 C 30 38, 40 36, 50 36 C 60 36, 70 38, 70 44 C 70 54, 62 58, 50 58 C 38 58, 30 54, 30 44 Z" fill="#f8fafc" />
      
      {/* Spectral Emerald Eyes */}
      <ellipse cx="42" cy="45" rx="4" ry="2.5" fill="#10b981" />
      <ellipse cx="58" cy="45" rx="4" ry="2.5" fill="#10b981" />
      <ellipse cx="42" cy="45" rx="2" ry="1.2" fill="#ecfdf5" />
      <ellipse cx="58" cy="45" rx="2" ry="1.2" fill="#ecfdf5" />
    </svg>
  );
}

// ── 7. Impostor Variant (Crimson Threat Mask) ──────────────────────
function ImpostorSvg() {
  return (
    <svg viewBox="0 0 100 100" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="impBg" cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#450a0a" />
          <stop offset="100%" stopColor="#0b0202" />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill="url(#impBg)" />
      
      {/* Threat Cowl */}
      <path d="M15 100 C 15 76, 30 70, 50 70 C 70 70, 85 76, 85 100 Z" fill="#180404" />
      <path d="M22 66 C 18 36, 30 18, 50 16 C 70 18, 82 36, 78 66 C 72 74, 62 76, 50 76 C 38 76, 28 74, 22 66 Z" fill="#2d0606" />
      
      {/* Crimson Slit Eye */}
      <rect x="30" y="44" width="40" height="10" rx="3" fill="#000000" />
      <line x1="33" y1="49" x2="67" y2="49" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" />
      <circle cx="50" cy="49" r="2.5" fill="#ffffff" />
    </svg>
  );
}

