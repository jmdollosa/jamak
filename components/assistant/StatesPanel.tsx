"use client";

import type { CSSProperties } from "react";
import { ORB_STATE_META, ORB_STATES, type OrbState } from "@/components/orb/orb-presets";
import { cx } from "@/lib/cx";

interface StatesPanelProps {
  state: OrbState;
  micEnabled: boolean;
  onPreview: (state: OrbState) => void;
  onPlaySample: () => void;
  onMicEnabledChange: (enabled: boolean) => void;
}

/** Lets you pin each orb state, or play a whole exchange, while the AI isn't connected. */
export function StatesPanel({ state, micEnabled, onPreview, onPlaySample, onMicEnabledChange }: StatesPanelProps) {
  return (
    <div
      id="orb-states"
      role="dialog"
      aria-labelledby="orb-states-title"
      // Beside the dock on wide screens, so it never covers the orb being previewed.
      className="glass caption-in absolute bottom-full left-1/2 mb-4 w-[min(23rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[28px] p-4 text-left xl:bottom-0 xl:left-full xl:mb-0 xl:ml-16 xl:translate-x-0"
    >
      <div className="flex items-baseline justify-between gap-4 px-1">
        <h2 id="orb-states-title" className="text-sm font-semibold text-frost">
          Orb states
        </h2>
        <p className="text-xs text-mist">Press 1–6 to switch</p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {ORB_STATES.map((option) => {
          const meta = ORB_STATE_META[option];
          const selected = option === state;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onPreview(option)}
              className={cx(
                "focus-ring flex flex-col items-center gap-2 rounded-2xl px-2 pb-2.5 pt-3 transition-colors",
                selected ? "bg-white/[0.09] ring-1 ring-inset ring-white/15" : "hover:bg-white/[0.05]",
              )}
            >
              <span
                className="swatch size-8 rounded-full"
                style={{ "--swatch-a": meta.aura, "--swatch-b": meta.aura2 } as CSSProperties}
                aria-hidden
              />
              <span className="text-[13px] font-medium leading-none text-frost">{meta.name}</span>
              <span className="text-[11px] leading-none text-mist">{meta.colorName}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 px-1 text-[13px] leading-snug text-mist">{ORB_STATE_META[state].summary}</p>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.08] px-1 pt-3">
        <button
          type="button"
          onClick={onPlaySample}
          className="focus-ring rounded-full bg-white/[0.07] px-3.5 py-2 text-[13px] font-medium text-frost transition-colors hover:bg-white/[0.12]"
        >
          Play sample conversation
        </button>
        <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-mist">
          Microphone
          <button
            type="button"
            role="switch"
            aria-checked={micEnabled}
            onClick={() => onMicEnabledChange(!micEnabled)}
            className="focus-ring relative h-5 w-9 rounded-full bg-white/15 transition-colors aria-checked:bg-aura"
          >
            <span
              className={cx(
                "absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow transition-transform",
                micEnabled && "translate-x-4",
              )}
            />
          </button>
        </label>
      </div>
    </div>
  );
}
