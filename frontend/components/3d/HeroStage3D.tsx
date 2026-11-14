"use client";

import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface HeroStage3DProps {
  className?: string;
}

/**
 * 3D Interactive Mystery Game Stage
 * Features a circular investigation podium with a glowing holographic magnifying glass,
 * dossier, floating ambient particles, and mouse-parallax lighting.
 */
export default function HeroStage3D({ className = "" }: HeroStage3DProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [hasWebGL, setHasWebGL] = useState(true);
  const animFrameIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

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

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const width = container.clientWidth || 480;
    const height = 300;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0c16, 0.15);

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 50);
    camera.position.set(0, 1.6, 3.8);
    camera.lookAt(0, 0.2, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x2e1065, 1.8);
    scene.add(ambientLight);

    const mainSpot = new THREE.SpotLight(0xa855f7, 4.0, 10, Math.PI / 4, 0.3);
    mainSpot.position.set(2, 4, 2);
    scene.add(mainSpot);

    const blueRim = new THREE.PointLight(0x06b6d4, 3.0, 6);
    blueRim.position.set(-2, 1, -1);
    scene.add(blueRim);

    const goldAccent = new THREE.PointLight(0xf59e0b, 2.0, 5);
    goldAccent.position.set(0, 0.5, 1.5);
    scene.add(goldAccent);

    // Stage Elements Group
    const stageGroup = new THREE.Group();
    scene.add(stageGroup);

    const geos: THREE.BufferGeometry[] = [];
    const mats: THREE.Material[] = [];

    // 1. Investigation Table Podium
    const tableGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.3, 32);
    geos.push(tableGeo);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.6,
      metalness: 0.4,
    });
    mats.push(tableMat);
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = -0.4;
    stageGroup.add(table);

    // Glowing Neon Rim Ring
    const rimGeo = new THREE.TorusGeometry(1.62, 0.04, 16, 48);
    geos.push(rimGeo);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xa855f7,
      emissive: 0x9333ea,
      emissiveIntensity: 1.5,
    });
    mats.push(rimMat);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.25;
    stageGroup.add(rim);

    // 2. Central Floating 3D Magnifying Glass
    const glassGroup = new THREE.Group();
    glassGroup.position.set(0, 0.4, 0);

    // Ring
    const magRingGeo = new THREE.TorusGeometry(0.5, 0.05, 16, 40);
    geos.push(magRingGeo);
    const goldMetalMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.2,
    });
    mats.push(goldMetalMat);
    const magRing = new THREE.Mesh(magRingGeo, goldMetalMat);
    glassGroup.add(magRing);

    // Handle
    const handleGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.65, 16);
    geos.push(handleGeo);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.5 });
    mats.push(handleMat);
    const handle = new THREE.Mesh(handleGeo, handleMat);
    handle.position.set(0.42, -0.42, 0);
    handle.rotation.z = -Math.PI / 4;
    glassGroup.add(handle);

    // Glass Lens
    const lensGeo = new THREE.CircleGeometry(0.46, 32);
    geos.push(lensGeo);
    const lensMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.45,
      roughness: 0.1,
    });
    mats.push(lensMat);
    const lens = new THREE.Mesh(lensGeo, lensMat);
    glassGroup.add(lens);

    stageGroup.add(glassGroup);

    // 3. Floating Dossier / Clue Folder
    const docGeo = new THREE.BoxGeometry(0.7, 0.03, 0.5);
    geos.push(docGeo);
    const docMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 });
    mats.push(docMat);
    const doc = new THREE.Mesh(docGeo, docMat);
    doc.position.set(-0.6, -0.2, 0.4);
    doc.rotation.set(-0.1, 0.4, 0.05);
    stageGroup.add(doc);

    // 4. Ambient Sparkle Dust Particles
    const particleCount = 40;
    const particleGeo = new THREE.BufferGeometry();
    geos.push(particleGeo);
    const posArr = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      posArr[i] = (Math.random() - 0.5) * 4;
      posArr[i + 1] = Math.random() * 2.5 - 0.2;
      posArr[i + 2] = (Math.random() - 0.5) * 3;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xc084fc,
      size: 0.04,
      transparent: true,
      opacity: 0.8,
    });
    mats.push(particleMat);
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Mouse Parallax Interaction
    let targetX = 0;
    let targetY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      if (prefersReducedMotion) return;
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      targetX = x * 0.3;
      targetY = y * 0.15;
    };

    const handleMouseLeave = () => {
      targetX = 0;
      targetY = 0;
    };

    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    const clock = new THREE.Clock();

    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      if (!prefersReducedMotion) {
        glassGroup.position.y = 0.4 + Math.sin(t * 1.5) * 0.08;
        glassGroup.rotation.y = Math.sin(t * 0.8) * 0.25;
        glassGroup.rotation.z = Math.cos(t * 0.7) * 0.08;

        stageGroup.rotation.y += (targetX - stageGroup.rotation.y) * 0.05;
        stageGroup.rotation.x += (-targetY - stageGroup.rotation.x) * 0.05;

        particles.rotation.y = t * 0.03;
      }

      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 480;
      camera.aspect = w / height;
      camera.updateProjectionMatrix();
      renderer.setSize(w, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      if (animFrameIdRef.current !== null) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      renderer.dispose();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (!hasWebGL) {
    return null;
  }

  return (
    <div
      ref={mountRef}
      className={`w-full max-w-lg mx-auto h-[260px] md:h-[300px] pointer-events-auto relative ${className}`}
    />
  );
}

