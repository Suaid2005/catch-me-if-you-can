"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type CharacterType = "detective" | "impostor" | "cyber" | "neon" | "shadow" | "civilian";

interface Character3DProps {
  type: CharacterType;
  size?: "sm" | "md" | "lg" | "hero";
  interactive?: boolean;
  animated?: boolean;
  className?: string;
  onClick?: () => void;
}

const SIZE_MAP = {
  sm: { width: 44, height: 44, fov: 32 },
  md: { width: 64, height: 64, fov: 32 },
  lg: { width: 110, height: 110, fov: 30 },
  hero: { width: 260, height: 260, fov: 28 },
};

/**
 * Procedural 3D Character Renderer (Three.js WebGL with Graceful Fallback)
 * Zero external asset downloads, 100% offline, GPU-accelerated 60fps.
 */
export default function DetectiveCharacter3D({
  type,
  size = "md",
  interactive = true,
  animated = true,
  className = "",
  onClick,
}: Character3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState(true);
  const animFrameIdRef = useRef<number | null>(null);

  const dim = SIZE_MAP[size];

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. WebGL Support Detection
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
      if (!gl) {
        setHasWebGL(false);
        return;
      }
    } catch {
      setHasWebGL(false);
      return;
    }

    const container = mountRef.current;
    if (!container) return;

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 2. Three.js Scene Setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(dim.fov, dim.width / dim.height, 0.1, 100);
    camera.position.set(0, 0.4, 4.2);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(dim.width, dim.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.appendChild(renderer.domElement);

    // 3. Lighting System
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
    keyLight.position.set(3, 4, 3);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x88bbff, 1.0);
    fillLight.position.set(-3, 1, 2);
    scene.add(fillLight);

    const charGroup = new THREE.Group();
    scene.add(charGroup);

    // 4. Procedural Character Construction based on CharacterType
    const geometriesToDispose: THREE.BufferGeometry[] = [];
    const materialsToDispose: THREE.Material[] = [];

    const regGeo = (g: THREE.BufferGeometry) => {
      geometriesToDispose.push(g);
      return g;
    };
    const regMat = (m: THREE.Material) => {
      materialsToDispose.push(m);
      return m;
    };

    // Common Head Sphere
    const headGeo = regGeo(new THREE.SphereGeometry(0.55, 32, 32));
    let headMat: THREE.Material;

    if (type === "detective") {
      // 🕵️ Detective: Tan skin, classic dark slate fedora with golden band, trench coat
      headMat = regMat(new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.5 }));
      const head = new THREE.Mesh(headGeo, headMat);
      charGroup.add(head);

      // Trench coat body
      const coatGeo = regGeo(new THREE.CylinderGeometry(0.35, 0.65, 0.9, 24));
      const coatMat = regMat(new THREE.MeshStandardMaterial({ color: 0x2b2d42, roughness: 0.7 }));
      const coat = new THREE.Mesh(coatGeo, coatMat);
      coat.position.y = -0.85;
      charGroup.add(coat);

      // Fedora Hat
      const hatGroup = new THREE.Group();
      hatGroup.position.set(0, 0.45, 0);

      // Brim
      const brimGeo = regGeo(new THREE.CylinderGeometry(0.85, 0.85, 0.05, 32));
      const fedoraMat = regMat(new THREE.MeshStandardMaterial({ color: 0x1f2430, roughness: 0.4 }));
      const brim = new THREE.Mesh(brimGeo, fedoraMat);
      hatGroup.add(brim);

      // Crown
      const crownGeo = regGeo(new THREE.CylinderGeometry(0.48, 0.54, 0.45, 24));
      const crown = new THREE.Mesh(crownGeo, fedoraMat);
      crown.position.y = 0.23;
      hatGroup.add(crown);

      // Gold Ribbon Band
      const bandGeo = regGeo(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 24));
      const bandMat = regMat(new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.6, roughness: 0.2 }));
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.y = 0.08;
      hatGroup.add(band);

      charGroup.add(hatGroup);

      // Magnifying Monocle Lens
      const monocleGeo = regGeo(new THREE.TorusGeometry(0.18, 0.03, 16, 32));
      const brassMat = regMat(new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.8, roughness: 0.2 }));
      const monocle = new THREE.Mesh(monocleGeo, brassMat);
      monocle.position.set(0.22, 0.08, 0.52);
      charGroup.add(monocle);

      const glassGeo = regGeo(new THREE.CircleGeometry(0.16, 24));
      const glassMat = regMat(new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.6,
        roughness: 0.1,
      }));
      const glass = new THREE.Mesh(glassGeo, glassMat);
      glass.position.set(0.22, 0.08, 0.525);
      charGroup.add(glass);
    } else if (type === "impostor") {
      // 🦹 Impostor: Sleek stealth cowl, glowing crimson visor mask, crimson underlight
      headMat = regMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.5 }));
      const head = new THREE.Mesh(headGeo, headMat);
      charGroup.add(head);

      const cowlGeo = regGeo(new THREE.ConeGeometry(0.75, 1.2, 24));
      const cowlMat = regMat(new THREE.MeshStandardMaterial({ color: 0x1e1b4b, roughness: 0.6 }));
      const cowl = new THREE.Mesh(cowlGeo, cowlMat);
      cowl.position.set(0, 0.5, -0.15);
      cowl.rotation.x = -0.2;
      charGroup.add(cowl);

      // Crimson Mask Visor
      const visorGeo = regGeo(new THREE.BoxGeometry(0.65, 0.16, 0.2));
      const visorMat = regMat(new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: 0xe11d48,
        emissiveIntensity: 0.9,
        roughness: 0.1,
      }));
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 0.08, 0.48);
      charGroup.add(visor);

      // Crimson Rim Light
      const impRim = new THREE.PointLight(0xe11d48, 2.5, 3);
      impRim.position.set(0, -0.5, 0.8);
      scene.add(impRim);
    } else if (type === "cyber") {
      // 🤖 Agent Cyber: Sleek metallic chrome chassis with cyan digital visor
      headMat = regMat(new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85, roughness: 0.2 }));
      const head = new THREE.Mesh(headGeo, headMat);
      charGroup.add(head);

      // Cyber Antenna Crest
      const antGeo = regGeo(new THREE.BoxGeometry(0.08, 0.45, 0.08));
      const antMat = regMat(new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.8 }));
      const ant = new THREE.Mesh(antGeo, antMat);
      ant.position.set(0, 0.72, 0);
      charGroup.add(ant);

      // Cyan Visor
      const visorGeo = regGeo(new THREE.BoxGeometry(0.7, 0.14, 0.18));
      const visorMat = regMat(new THREE.MeshStandardMaterial({
        color: 0x00f2fe,
        emissive: 0x06b6d4,
        emissiveIntensity: 1.0,
      }));
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 0.08, 0.48);
      charGroup.add(visor);

      // Ear Pods
      const podGeo = regGeo(new THREE.CylinderGeometry(0.18, 0.18, 0.15, 16));
      const pod1 = new THREE.Mesh(podGeo, antMat);
      pod1.rotation.z = Math.PI / 2;
      pod1.position.set(0.56, 0.08, 0);
      charGroup.add(pod1);

      const pod2 = pod1.clone();
      pod2.position.set(-0.56, 0.08, 0);
      charGroup.add(pod2);
    } else if (type === "neon") {
      // ⚡ Agent Neon: Synthwave electric violet/amber energy core
      headMat = regMat(new THREE.MeshStandardMaterial({ color: 0x581c87, roughness: 0.3, metalness: 0.7 }));
      const head = new THREE.Mesh(headGeo, headMat);
      charGroup.add(head);

      // Electric Horn Crest
      const hornGeo = regGeo(new THREE.ConeGeometry(0.14, 0.5, 16));
      const hornMat = regMat(new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: 0xeab308,
        emissiveIntensity: 0.8,
        metalness: 0.5,
      }));
      const horn1 = new THREE.Mesh(hornGeo, hornMat);
      horn1.position.set(0.28, 0.65, 0);
      horn1.rotation.z = -0.3;
      charGroup.add(horn1);

      const horn2 = horn1.clone();
      horn2.position.set(-0.28, 0.65, 0);
      horn2.rotation.z = 0.3;
      charGroup.add(horn2);

      // Neon Amber Visor
      const neonVisorGeo = regGeo(new THREE.TorusGeometry(0.35, 0.07, 16, 32, Math.PI));
      const neonVisorMat = regMat(new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 0.9,
      }));
      const neonVisor = new THREE.Mesh(neonVisorGeo, neonVisorMat);
      neonVisor.position.set(0, 0.12, 0.44);
      charGroup.add(neonVisor);
    } else if (type === "shadow") {
      // 🕶️ Agent Shadow: Stealth dark cowl with deep purple slit optics
      headMat = regMat(new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.8, metalness: 0.1 }));
      const head = new THREE.Mesh(headGeo, headMat);
      charGroup.add(head);

      // Stealth Hood
      const hoodGeo = regGeo(new THREE.SphereGeometry(0.68, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.7));
      const hoodMat = regMat(new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 }));
      const hood = new THREE.Mesh(hoodGeo, hoodMat);
      hood.position.set(0, 0.1, -0.05);
      charGroup.add(hood);

      // Purple Slit Optics
      const eyeGeo = regGeo(new THREE.BoxGeometry(0.22, 0.06, 0.1));
      const eyeMat = regMat(new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x9333ea,
        emissiveIntensity: 1.2,
      }));
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.position.set(0.18, 0.08, 0.52);
      charGroup.add(leftEye);

      const rightEye = leftEye.clone();
      rightEye.position.set(-0.18, 0.08, 0.52);
      charGroup.add(rightEye);
    } else {
      // 👤 Civilian / Generic Agent: Clean slate detective suit with blue crystal eyes
      headMat = regMat(new THREE.MeshStandardMaterial({ color: 0xd4d4d8, roughness: 0.4 }));
      const head = new THREE.Mesh(headGeo, headMat);
      charGroup.add(head);

      const visorGeo = regGeo(new THREE.BoxGeometry(0.5, 0.12, 0.15));
      const visorMat = regMat(new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        emissive: 0x3b82f6,
        emissiveIntensity: 0.6,
      }));
      const visor = new THREE.Mesh(visorGeo, visorMat);
      visor.position.set(0, 0.08, 0.48);
      charGroup.add(visor);
    }

    // 5. Interactive Tilt & Animation Loop
    let targetRotX = 0;
    let targetRotY = 0;

    const handlePointerMove = (e: MouseEvent) => {
      if (!interactive || prefersReducedMotion) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetRotY = x * 0.45;
      targetRotX = -y * 0.25;
    };

    const handlePointerLeave = () => {
      targetRotX = 0;
      targetRotY = 0;
    };

    if (interactive) {
      container.addEventListener("mousemove", handlePointerMove);
      container.addEventListener("mouseleave", handlePointerLeave);
    }

    let clock = new THREE.Clock();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const t = clock.getElapsedTime();

      // Subtle breathing float animation
      if (animated && !prefersReducedMotion) {
        charGroup.position.y = Math.sin(t * 1.8) * 0.06;
        charGroup.rotation.y += (targetRotY + Math.sin(t * 0.8) * 0.08 - charGroup.rotation.y) * 0.1;
        charGroup.rotation.x += (targetRotX - charGroup.rotation.x) * 0.1;
      } else {
        charGroup.rotation.y += (targetRotY - charGroup.rotation.y) * 0.1;
        charGroup.rotation.x += (targetRotX - charGroup.rotation.x) * 0.1;
      }

      renderer.render(scene, camera);
    };

    animate();

    // 6. Cleanup
    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      if (interactive) {
        container.removeEventListener("mousemove", handlePointerMove);
        container.removeEventListener("mouseleave", handlePointerLeave);
      }
      renderer.dispose();
      for (const g of geometriesToDispose) g.dispose();
      for (const m of materialsToDispose) m.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [type, dim.width, dim.height, dim.fov, interactive, animated]);

  // Graceful CSS/SVG 3D Fallback if WebGL is disabled or unsupported
  if (!hasWebGL) {
    const fallbackColors: Record<CharacterType, { bg: string; border: string; icon: string }> = {
      detective: { bg: "from-amber-600 to-slate-900", border: "border-amber-500", icon: "🕵️" },
      impostor: { bg: "from-rose-600 to-slate-950", border: "border-rose-500", icon: "🦹" },
      cyber: { bg: "from-cyan-600 to-slate-900", border: "border-cyan-400", icon: "🤖" },
      neon: { bg: "from-purple-600 to-amber-600", border: "border-amber-400", icon: "⚡" },
      shadow: { bg: "from-purple-950 to-slate-950", border: "border-purple-600", icon: "🕶️" },
      civilian: { bg: "from-blue-600 to-slate-900", border: "border-blue-400", icon: "👤" },
    };
    const fb = fallbackColors[type] || fallbackColors.detective;

    return (
      <div
        onClick={onClick}
        style={{ width: dim.width, height: dim.height }}
        className={`rounded-2xl bg-gradient-to-br ${fb.bg} border-2 ${fb.border} shadow-lg flex items-center justify-center text-xl select-none ${className}`}
      >
        <span>{fb.icon}</span>
      </div>
    );
  }

  return (
    <div
      ref={mountRef}
      onClick={onClick}
      style={{ width: dim.width, height: dim.height }}
      className={`inline-flex items-center justify-center relative cursor-pointer select-none filter drop-shadow-[0_8px_16px_rgba(0,0,0,0.5)] transition-transform duration-300 hover:scale-105 active:scale-95 ${className}`}
    />
  );
}

