"use client";

import { useEffect, useRef } from "react";
import type { OrbState } from "@/components/orb/orb-presets";
import { type OrbAnchor, WaterMotion } from "./water-motion";
import { WaterRenderer } from "./water-renderer";

interface WaterBackgroundProps {
  state: OrbState;
  /** Voice level, 0–1, read every frame. */
  getLevel: () => number;
  /** Where the orb is on screen, in CSS pixels, read every frame. */
  getOrbAnchor: () => { x: number; y: number; radius: number } | null;
}

/** The water is soft, so it renders at a fraction of the screen's resolution… */
const RENDER_SCALE = 0.6;
/** …and never more than this many pixels. */
const MAX_PIXELS = 1_300_000;
/** When nothing but the slow swell is moving, 30 frames a second is plenty. */
const QUIET_FRAME_MS = 1000 / 30;
const REDUCED_MOTION_SCALE = 0.3;

/** Taps on these are for the control, not the water. */
const INTERACTIVE = "button, a, input, textarea, select, label, [role='dialog'], [role='switch'], [contenteditable='true']";

/**
 * A dark body of water behind the whole app. It ripples where you tap, and moves with
 * the orb: calm while idle, rings while listening, busier while thinking, and stirred
 * by the voice while speaking.
 */
export function WaterBackground({ state, getLevel, getOrbAnchor }: WaterBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const getLevelRef = useRef(getLevel);
  const getOrbAnchorRef = useRef(getOrbAnchor);

  useEffect(() => {
    stateRef.current = state;
    getLevelRef.current = getLevel;
    getOrbAnchorRef.current = getOrbAnchor;
  }, [state, getLevel, getOrbAnchor]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = new WaterMotion(stateRef.current);
    let renderer: WaterRenderer | null = null;
    let frameId = 0;
    let last = 0;
    let lastDrawn = 0;

    // Water units: the shorter side of the screen spans 1, centred, y up.
    const toWater = (x: number, y: number) => {
      const unit = Math.min(window.innerWidth, window.innerHeight);
      return [(x - window.innerWidth / 2) / unit, (window.innerHeight / 2 - y) / unit] as const;
    };

    const orbAnchor = (): OrbAnchor | null => {
      const anchor = getOrbAnchorRef.current();
      if (!anchor) return null;
      const [x, y] = toWater(anchor.x, anchor.y);
      return { x, y, radius: anchor.radius / Math.min(window.innerWidth, window.innerHeight) };
    };

    const resize = () => {
      if (!renderer) return;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const scale = Math.min(RENDER_SCALE, Math.sqrt(MAX_PIXELS / Math.max(width * height, 1)));
      renderer.resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    };

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (!renderer) return;
      const level = getLevelRef.current();
      if (!motion.busy && level === 0 && now - lastDrawn < QUIET_FRAME_MS) return;

      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now;
      lastDrawn = now;
      const frame = motion.step(
        dt,
        stateRef.current,
        level,
        orbAnchor(),
        reducedMotion.matches ? REDUCED_MOTION_SCALE : 1,
      );
      renderer.draw(frame);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return;
      const [x, y] = toWater(event.clientX, event.clientY);
      motion.addRipple(x, y);
    };

    const start = () => {
      try {
        renderer = new WaterRenderer(canvas);
      } catch (error) {
        console.warn("[Water] Falling back to a still background:", error);
        root.dataset.gl = "unsupported";
        return;
      }
      root.dataset.gl = "ready";
      resize();
      last = 0;
      frameId = requestAnimationFrame(tick);
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frameId);
      renderer = null;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", start);
    start();

    return () => {
      observer.disconnect();
      window.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", start);
      cancelAnimationFrame(frameId);
      renderer?.dispose();
      renderer = null;
    };
  }, []);

  return (
    <div ref={rootRef} data-gl="pending" aria-hidden className="water pointer-events-none fixed inset-0 -z-10">
      <canvas ref={canvasRef} className="size-full" />
    </div>
  );
}
