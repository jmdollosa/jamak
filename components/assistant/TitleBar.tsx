"use client";

import { Maximize2, Minimize2, Minus } from "lucide-react";
import { type ReactNode, useSyncExternalStore } from "react";
import { ASSISTANT_NAME } from "@/lib/assistant/config";

const subscribeToFullscreen = (onChange: () => void) => {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
};
const subscribeToNothing = () => () => {};

function toggleFullscreen() {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen().catch(() => {});
  }
}

function WindowButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="focus-ring grid size-8 place-items-center rounded-full text-mist transition-colors hover:bg-white/[0.07] hover:text-frost"
    >
      {children}
    </button>
  );
}

export function TitleBar({ inert, onCompact }: { inert: boolean; onCompact: () => void }) {
  const isFullscreen = useSyncExternalStore(
    subscribeToFullscreen,
    () => document.fullscreenElement !== null,
    () => false,
  );
  const canFullscreen = useSyncExternalStore(
    subscribeToNothing,
    () => document.fullscreenEnabled,
    () => false,
  );

  return (
    <header
      inert={inert}
      className="fade-away relative z-20 flex h-[72px] shrink-0 items-center justify-between px-5 sm:px-8"
    >
      <div className="flex items-center gap-3">
        <span className="logo-mark size-6 rounded-full" aria-hidden />
        <span className="text-[15px] font-semibold tracking-tight text-frost">{ASSISTANT_NAME} AI</span>
      </div>

      <div className="flex items-center gap-4 sm:gap-6">
        <p className="hidden items-center gap-2 text-xs text-mist sm:flex">
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_1px] shadow-emerald-400/70" aria-hidden />
          Always here for you
        </p>
        <div className="flex items-center gap-1">
          <WindowButton label="Compact mode" onClick={onCompact}>
            <Minus className="size-4" />
          </WindowButton>
          {canFullscreen && (
            <WindowButton label={isFullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </WindowButton>
          )}
        </div>
      </div>
    </header>
  );
}
