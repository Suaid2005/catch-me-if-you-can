"use client";

import React from "react";
import PlayerAvatar, { PlayerAvatarProps } from "./PlayerAvatar";
import { useGameStore } from "@/lib/store";

interface Avatar3DProps {
  avatar?: string | null;
  name?: string;
  size?: "xs" | "sm" | "md" | "lg" | "hero" | "xl";
  interactive?: boolean;
  animated?: boolean;
  isImpostor?: boolean;
  badge?: string;
  frame?: string | null;
  className?: string;
  onClick?: () => void;
}

/**
 * Game Player Avatar Component (Integrated with PlayerAvatar vector rendering)
 * Unified across Header, Game Lobby, Voting Results, Practice Arena and Vault.
 */
export default function Avatar3D({
  avatar,
  name,
  size = "md",
  isImpostor = false,
  badge,
  frame,
  className = "",
  onClick,
}: Avatar3DProps) {
  const currentEquippedFrame = useGameStore((s) => s.progression?.equippedFrame);
  const currentEquippedAvatar = useGameStore((s) => s.progression?.equippedAvatar);
  const currentUser = useGameStore((s) => s.user);

  // Map legacy "hero" to "xl" and ensure compact valid sizes
  const mappedSize: PlayerAvatarProps["size"] =
    size === "hero" ? "xl" : size === "xs" || size === "sm" || size === "md" || size === "lg" || size === "xl" ? size : "md";

  const isCurrentPlayer =
    !name ||
    name === "You" ||
    Boolean(currentUser && name.toLowerCase() === currentUser.username.toLowerCase());

  // Determine active frame:
  let activeFrame: string | null = null;
  if (frame !== undefined) {
    activeFrame = frame;
  } else if (isCurrentPlayer) {
    activeFrame = currentEquippedFrame || null;
  }

  // Determine active avatar:
  let effectiveAvatar = avatar;
  if (isCurrentPlayer) {
    // Current player authoritatively displays their equipped avatar
    effectiveAvatar = currentEquippedAvatar || avatar || "avatar_classic_detective";
  } else if (!avatar || avatar === "🕵️" || avatar === "🧑") {
    effectiveAvatar = "avatar_classic_detective";
  }

  return (
    <PlayerAvatar
      avatar={effectiveAvatar}
      name={name}
      size={mappedSize}
      frame={activeFrame}
      isImpostor={isImpostor}
      badge={badge}
      className={className}
      onClick={onClick}
    />
  );
}
