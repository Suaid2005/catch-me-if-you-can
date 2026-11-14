"use client";

import React from "react";

interface BrandIconProps {
  size?: number;
  className?: string;
  withGlow?: boolean;
}

export default function BrandIcon({
  size = 36,
  className = "",
  withGlow = true,
}: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`inline-block shrink-0 select-none ${className}`}
      aria-label="Catch Me If You Can Icon"
    >
      <defs>
        {/* Outer Rim Gradient: Cyan to Purple to Amber */}
        <linearGradient id="brand-rim-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="55%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>

        {/* Deep Mystery Lens Gradient */}
        <linearGradient id="brand-lens-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e1035" />
          <stop offset="100%" stopColor="#0a192f" />
        </linearGradient>

        {/* Detective Eye Eyelid Gradient */}
        <linearGradient id="brand-eye-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>

        {/* Amber Insight Pupil */}
        <radialGradient id="brand-pupil-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="40%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b45309" />
        </radialGradient>

        {/* Soft Drop Glow */}
        {withGlow && (
          <filter id="brand-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#a855f7" floodOpacity="0.45" />
          </filter>
        )}
      </defs>

      {/* Magnifying Glass Lens Frame */}
      <circle
        cx="21"
        cy="21"
        r="15"
        fill="url(#brand-lens-grad)"
        stroke="url(#brand-rim-grad)"
        strokeWidth="2.8"
        filter={withGlow ? "url(#brand-glow)" : undefined}
      />

      {/* Magnifying Glass Precision Handle */}
      <path
        d="M31.5 31.5 L41.5 41.5"
        stroke="url(#brand-rim-grad)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="41.5" cy="41.5" r="1.6" fill="#f59e0b" />

      {/* Sleek Detective Eye Contour (Almond Eyelid) */}
      <path
        d="M 11.5 21 C 14.8 14.8, 27.2 14.8, 30.5 21 C 27.2 27.2, 14.8 27.2, 11.5 21 Z"
        fill="#0b0f19"
        stroke="url(#brand-eye-grad)"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* Iris Ring */}
      <circle
        cx="21"
        cy="21"
        r="4.8"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.5"
        opacity="0.9"
      />

      {/* Glowing Insight Pupil */}
      <circle
        cx="21"
        cy="21"
        r="2.6"
        fill="url(#brand-pupil-glow)"
      />

      {/* Tiny Deduction Insight Spark */}
      <polygon
        points="21,17.5 21.8,19.8 24.5,20.5 21.8,21.2 21,23.5 20.2,21.2 17.5,20.5 20.2,19.8"
        fill="#ffffff"
        opacity="0.85"
        transform="scale(0.55) translate(17, 16.5)"
      />
    </svg>
  );
}

