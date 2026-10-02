"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/lib/cx";
import { CANVAS_EXTENT } from "./orb-geometry";
import { OrbMotion } from "./orb-motion";
import { ORB_KICKS, ORB_PRESETS, type OrbState } from "./orb-presets";
import { OrbRenderer } from "./orb-renderer";

interface OrbProps {
  state: OrbState;
  /** Called every frame for the current voice level (0–1). Keep it cheap and stable. */
  getLevel?: () => number;
  /** Fraction of the device pixel ratio to render at. Lower it while the orb is shown small. */
  renderScale?: number;
  className?: string;
}

const MAX_DPR = 2;
const MAX_SIDE = 2400;
const REDUCED_MOTION_SCALE = 0.3;

/**
 * The liquid-energy orb and its particle cloud. Place it inside a positioned box the
 * size of the sphere; the canvas overflows that box (CANVAS_EXTENT× its size) to make
 * room for the halo, waveforms and particles, and never takes pointer events.
 */
export function Orb({ state, getLevel, renderScale = 1, className }: OrbProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const getLevelRef = useRef(getLevel);
  const renderScaleRef = useRef(renderScale);
  const pendingKickRef = useRef(0);
  const resizeRef = useRef<() => void>(() => {});

  useEffect(() => {
    getLevelRef.current = getLevel;
  }, [getLevel]);

  useEffect(() => {
    renderScaleRef.current = renderScale;
    resizeRef.current();
  }, [renderScale]);

  useEffect(() => {
    if (stateRef.current === state) return;
    stateRef.current = state;
    pendingKickRef.current += ORB_KICKS[state];
  }, [state]);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = new OrbMotion(ORB_PRESETS[stateRef.current]);
    let renderer: OrbRenderer | null = null;
    let frameId = 0;
    let last = 0;

    const resize = () => {
      if (!renderer) return;
      // Layout size, deliberately ignoring CSS transforms (the compact dock scales the orb).
      const width = root.offsetWidth;
      const height = root.offsetHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * renderScaleRef.current;
      const scale = Math.min(dpr, MAX_SIDE / Math.max(width, height, 1));
      renderer.resize(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
    };

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (!renderer) return;
      const dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60;
      last = now;

      if (pendingKickRef.current) {
        motion.kick(reducedMotion.matches ? 0 : pendingKickRef.current);
        pendingKickRef.current = 0;
      }

      const level = getLevelRef.current?.() ?? 0;
      const frame = motion.step(
        dt,
        ORB_PRESETS[stateRef.current],
        level,
        reducedMotion.matches ? REDUCED_MOTION_SCALE : 1,
      );
      renderer.draw(frame);
    };

    const start = () => {
      try {
        renderer = new OrbRenderer(canvas);
      } catch (error) {
        console.warn("[Orb] Falling back to the static orb:", error);
        root.dataset.gl = "unsupported";
        return;
      }
      root.dataset.gl = "ready";
      resize();
      last = 0;
      frameId = requestAnimationFrame(tick);
    };

    const stop = () => {
      cancelAnimationFrame(frameId);
      renderer?.dispose();
      renderer = null;
    };

    const onContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frameId);
      renderer = null;
    };

    resizeRef.current = resize;
    const observer = new ResizeObserver(resize);
    observer.observe(root);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", start);
    start();

    return () => {
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", start);
      resizeRef.current = () => {};
      stop();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      data-gl="pending"
      aria-hidden
      className={cx("pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", className)}
      style={{ width: `${CANVAS_EXTENT * 100}%`, height: `${CANVAS_EXTENT * 100}%` }}
    >
      <div className="orb-fallback" style={{ width: `${100 / CANVAS_EXTENT}%` }} />
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
    </div>
  );
}
