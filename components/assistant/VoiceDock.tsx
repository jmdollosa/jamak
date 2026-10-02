"use client";

import { ArrowUp, Keyboard, Mic, SlidersHorizontal } from "lucide-react";
import { type ButtonHTMLAttributes, useState } from "react";
import { ASSISTANT_NAME } from "@/lib/assistant/config";
import { cx } from "@/lib/cx";
import { Waveform } from "./Waveform";

const LEFT_SHAPE = [0.35, 0.6, 0.45, 0.85, 0.55, 1, 0.7] as const;
const RIGHT_SHAPE = [0.7, 1, 0.55, 0.85, 0.45, 0.6, 0.35] as const;

function DockButton({
  label,
  active = false,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "focus-ring grid size-10 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/[0.07] hover:text-frost",
        active ? "bg-white/10 text-frost" : "text-mist",
        className,
      )}
      {...props}
    />
  );
}

function Composer({ onSubmit, onCancel }: { onSubmit: (text: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState("");
  const empty = value.trim() === "";

  return (
    <form
      className="caption-in flex w-[min(22rem,calc(100vw-8.5rem))] items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (empty) return;
        onSubmit(value);
        setValue("");
      }}
    >
      <label htmlFor="message" className="sr-only">
        Message {ASSISTANT_NAME}
      </label>
      <input
        id="message"
        autoFocus
        autoComplete="off"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        placeholder="Type a message"
        className="h-11 min-w-0 flex-1 rounded-full bg-white/[0.04] px-5 text-[15px] text-frost outline-none ring-1 ring-white/10 transition-shadow placeholder:text-mist/70 focus:ring-aura/60"
      />
      <button
        type="submit"
        disabled={empty}
        aria-label="Send"
        className="mic-button focus-ring grid size-11 shrink-0 place-items-center rounded-full text-white disabled:opacity-40"
      >
        <ArrowUp className="size-5" strokeWidth={2.2} />
      </button>
    </form>
  );
}

interface VoiceDockProps {
  /** The mic is on: listening, or in a voice conversation. Tapping it again turns it off. */
  micActive: boolean;
  getLevel: () => number;
  onMic: () => void;
  onSubmit: (text: string) => void;
  typing: boolean;
  onTypingChange: (typing: boolean) => void;
  statesOpen: boolean;
  onStatesToggle: () => void;
}

export function VoiceDock({
  micActive,
  getLevel,
  onMic,
  onSubmit,
  typing,
  onTypingChange,
  statesOpen,
  onStatesToggle,
}: VoiceDockProps) {
  return (
    <div className="glass flex h-[76px] items-center gap-2 rounded-full px-2.5 sm:gap-4 sm:px-3">
      {typing ? (
        <>
          <DockButton label="Switch to voice" onClick={() => onTypingChange(false)}>
            <Mic className="size-[18px]" />
          </DockButton>
          <Composer onSubmit={onSubmit} onCancel={() => onTypingChange(false)} />
        </>
      ) : (
        <>
          <DockButton label="Type a message" onClick={() => onTypingChange(true)}>
            <Keyboard className="size-[18px]" />
          </DockButton>
          <Waveform getLevel={getLevel} shape={LEFT_SHAPE} className="hidden sm:flex" />
          <button
            type="button"
            onClick={onMic}
            data-active={micActive}
            aria-label={micActive ? "Stop listening" : "Start listening"}
            className="mic-button focus-ring relative grid size-[60px] shrink-0 place-items-center rounded-full text-white"
          >
            <span className="mic-ring" aria-hidden />
            <span className="mic-ring" aria-hidden />
            <Mic className="relative size-6" strokeWidth={2.2} />
          </button>
          <Waveform getLevel={getLevel} shape={RIGHT_SHAPE} className="hidden sm:flex" />
        </>
      )}
      <DockButton
        label="Orb states"
        active={statesOpen}
        aria-expanded={statesOpen}
        aria-controls="orb-states"
        onClick={onStatesToggle}
      >
        <SlidersHorizontal className="size-[18px]" />
      </DockButton>
    </div>
  );
}
