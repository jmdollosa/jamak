"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/lib/cx";

interface WaveformProps {
  getLevel: () => number;
  /** Relative bar heights, 0–1. Pass a module-level constant so it stays stable. */
  shape: readonly number[];
  className?: string;
  barClassName?: string;
}

/** Level-driven bars, animated outside React so they never trigger re-renders. */
export function Waveform({ getLevel, shape, className, barClassName = "w-[3px]" }: WaveformProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const bars = Array.from(root.children) as HTMLElement[];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let level = 0;
    let last = 0;
    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      last = now;
      const target = getLevel();
      level += (target - level) * (1 - Math.exp(-dt * (target > level ? 18 : 6)));

      const t = now / 1000;
      bars.forEach((bar, i) => {
        const shimmer = reducedMotion.matches
          ? 1
          : 0.78 + 0.22 * Math.sin(t * (2.2 + i * 0.9) + i * 1.7);
        const height = 0.16 + shape[i] * (0.14 + 0.86 * level) * shimmer;
        bar.style.transform = `scaleY(${height.toFixed(3)})`;
      });
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [getLevel, shape]);

  return (
    <div ref={ref} aria-hidden className={cx("flex h-7 items-center gap-[3px]", className)}>
      {shape.map((_, i) => (
        <span key={i} className={cx("wave-bar h-full rounded-full", barClassName)} />
      ))}
    </div>
  );
}
