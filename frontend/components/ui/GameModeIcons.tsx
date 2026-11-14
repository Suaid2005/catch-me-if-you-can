"use client";

import React from "react";

interface IconProps {
  className?: string;
  size?: number;
}

/**
 * Online Multiplayer Icon: Dual interconnected radar nodes with wireless signal waves.
 */
export function MultiplayerIcon({ className = "text-cyan-400", size = 28 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
      <path d="M2 12h20" strokeOpacity="0.4" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" strokeOpacity="0.5" />
      <circle cx="8" cy="9" r="2.5" fill="currentColor" fillOpacity="0.2" strokeWidth="1.8" />
      <circle cx="16" cy="15" r="2.5" fill="currentColor" fillOpacity="0.2" strokeWidth="1.8" />
      <path d="M10 10.5l4 3" strokeWidth="1.8" strokeDasharray="2 2" />
    </svg>
  );
}

/**
 * Practice vs AI Icon: Neural network brain node with targeting crosshair.
 */
export function PracticeIcon({ className = "text-cyan-400", size = 28 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" strokeOpacity="0.3" />
      <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.2" />
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <circle cx="12" cy="12" r="6" strokeDasharray="3 3" strokeOpacity="0.6" />
    </svg>
  );
}

/**
 * Local Pass & Play Icon: Mobile device handoff with privacy eye shield.
 */
export function PassAndPlayIcon({ className = "text-amber-400", size = 28 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="5" y="2" width="14" height="20" rx="3" strokeOpacity="0.4" />
      <path d="M12 18h.01" strokeWidth="2.5" />
      <path d="M8 8s1.5-2 4-2 4 2 4 2" />
      <circle cx="12" cy="11" r="1.5" fill="currentColor" />
      <path d="M8 11c0 2 1.8 3.5 4 3.5s4-1.5 4-3.5" />
    </svg>
  );
}

/**
 * Cosmetic Vault & Missions Icon: Safe lock vault dial with gemstone crest.
 */
export function VaultIcon({ className = "text-purple-400", size = 28 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" strokeOpacity="0.4" />
      <circle cx="12" cy="12" r="5" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="2" fill="currentColor" fillOpacity="0.3" />
      <path d="M12 7v2" />
      <path d="M12 15v2" />
      <path d="M7 12h2" />
      <path d="M15 12h2" />
      <circle cx="18" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}

/**
 * Step 1: Secret Peek Icon.
 */
export function SecretStepIcon({ className = "text-amber-400", size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.25" />
      <path d="M12 9v1" strokeWidth="2" />
    </svg>
  );
}

/**
 * Step 2: Subtle Clue Icon.
 */
export function ClueStepIcon({ className = "text-purple-400", size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <path d="M8 11h.01" strokeWidth="2.5" />
      <path d="M12 11h.01" strokeWidth="2.5" />
      <path d="M16 11h.01" strokeWidth="2.5" />
    </svg>
  );
}

/**
 * Step 3: Vote Suspect Icon.
 */
export function VoteStepIcon({ className = "text-rose-400", size = 24 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

