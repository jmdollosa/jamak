"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Orb } from "@/components/orb/Orb";
import { ORB_STATE_META, ORB_STATES } from "@/components/orb/orb-presets";
import type { Caption } from "@/lib/assistant/assistant-controller";
import { ASSISTANT_NAME, USER_NAME } from "@/lib/assistant/config";
import { useAssistant } from "@/lib/assistant/use-assistant";
import { isVoiceActive } from "@/lib/assistant/voice-phase";
import { cx } from "@/lib/cx";
import { COMPACT_MARGIN, COMPACT_ORB, CompactBar } from "./CompactBar";
import { statusLabel } from "./labels";
import { Sidebar } from "./Sidebar";
import { StatesPanel } from "./StatesPanel";
import { TitleBar } from "./TitleBar";
import { VoiceDock } from "./VoiceDock";

/** Render the docked orb at a lower resolution; it's only 72px on screen. */
const DOCKED_RENDER_SCALE = 0.45;

/** Moves the orb from its slot to the bottom-right corner without remounting the canvas. */
function dockTransform(slot: HTMLElement) {
  const rect = slot.getBoundingClientRect();
  const centre = COMPACT_MARGIN + COMPACT_ORB / 2;
  const x = window.innerWidth - centre - (rect.left + rect.width / 2);
  const y = window.innerHeight - centre - (rect.top + rect.height / 2);
  return `translate3d(${x}px, ${y}px, 0) scale(${COMPACT_ORB / rect.width})`;
}

function SuccessMark({ visible }: { visible: boolean }) {
  return (
    <svg
      viewBox="0 0 52 52"
      aria-hidden
      data-visible={visible}
      className="success-mark pointer-events-none absolute left-1/2 top-1/2 w-[30%] -translate-x-1/2 -translate-y-1/2"
    >
      <path
        d="M14 27.5 22.5 36 38.5 17"
        pathLength={1}
        fill="none"
        stroke="white"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CaptionBlock({ caption, userText }: { caption: Caption; userText: string | null }) {
  const words = caption.revealed === null ? null : caption.text.split(" ");
  const revealed = caption.revealed ?? 0;

  return (
    <div className="mt-3 flex h-28 w-full flex-col items-center">
      {userText && <p className="caption-in mb-2 max-w-full truncate text-sm text-mist/80">“{userText}”</p>}
      {/* Words fade in as they're "spoken"; unrevealed words hold their space so lines don't reflow. */}
      <p
        key={caption.id}
        aria-hidden
        className={cx(
          "caption-in line-clamp-3 text-pretty text-[15px] leading-relaxed sm:text-base",
          caption.tone === "prompt" || caption.tone === "status" ? "text-mist" : "text-frost/90",
        )}
      >
        {words
          ? words.map((word, i) => (
              <span key={i} className="word" style={{ opacity: i < revealed ? 1 : 0 }}>
                {i < words.length - 1 ? `${word} ` : word}
              </span>
            ))
          : caption.text}
      </p>
      <p className="sr-only" aria-live="polite">
        {caption.text}
      </p>
    </div>
  );
}

export function AssistantApp() {
  const { state, caption, userText, micEnabled, voicePhase, controller } = useAssistant();
  const meta = ORB_STATE_META[state];
  const micActive = isVoiceActive(voicePhase) || state === "listening";
  const status = statusLabel(state, voicePhase);

  const [compact, setCompact] = useState(false);
  const [compactTransform, setCompactTransform] = useState<string>();
  const [docked, setDocked] = useState(false);
  const [typing, setTyping] = useState(false);
  const [statesOpen, setStatesOpen] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);

  const enterCompact = () => {
    if (!slotRef.current) return;
    setCompactTransform(dockTransform(slotRef.current));
    setCompact(true);
    setDocked(false);
    setStatesOpen(false);
    setTyping(false);
  };

  const exitCompact = () => {
    setCompact(false);
    setDocked(false);
  };

  useEffect(() => {
    if (!compact) return;
    const onResize = () => {
      if (slotRef.current) setCompactTransform(dockTransform(slotRef.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [compact]);

  useEffect(() => {
    if (!statesOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!controlsRef.current?.contains(event.target as Node)) setStatesOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [statesOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;

      if (event.key === "Escape") {
        if (statesOpen) setStatesOpen(false);
        else controller.cancel();
        return;
      }
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      // Space talks, unless a control has focus (Space already activates it).
      if (event.code === "Space" && !target?.closest("button, a, [role='switch']")) {
        event.preventDefault();
        controller.toggleMic();
        return;
      }
      const index = Number.parseInt(event.key, 10) - 1;
      if (index >= 0 && index < ORB_STATES.length) controller.preview(ORB_STATES[index]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, statesOpen]);

  return (
    <div
      className="assistant relative z-10 flex h-dvh flex-col"
      style={{ "--aura": meta.aura, "--aura-2": meta.aura2 } as CSSProperties}
    >
      <TitleBar inert={compact} onCompact={enterCompact} />
      <Sidebar inert={compact} status={status} getLevel={controller.getLevel} />

      <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-[5vh]">
        <div ref={slotRef} className="orb-slot relative shrink-0">
          <div
            className="orb-rig absolute inset-0"
            style={{ transform: compact ? compactTransform : undefined }}
            onTransitionEnd={(event) => {
              if (compact && event.target === event.currentTarget && event.propertyName === "transform") {
                setDocked(true);
              }
            }}
          >
            <div className="orb-ambient" />
            <Orb state={state} getLevel={controller.getLevel} renderScale={docked ? DOCKED_RENDER_SCALE : 1} />
            <SuccessMark visible={state === "success"} />
            {/* Tap the orb itself to talk. It's the only control left when docked. */}
            <button
              type="button"
              onClick={controller.toggleMic}
              tabIndex={compact ? 0 : -1}
              aria-label={micActive ? "Stop listening" : `Talk to ${ASSISTANT_NAME}`}
              className="focus-ring absolute inset-[6%] cursor-pointer rounded-full"
            />
          </div>
        </div>

        <section
          inert={compact}
          aria-label="Conversation"
          className="fade-away relative z-10 mt-[clamp(1.75rem,8vh,4.5rem)] flex w-full max-w-xl flex-col items-center px-2 text-center"
        >
          <h1 className="text-[clamp(1.75rem,2.4vw,2.25rem)] font-semibold tracking-[-0.02em] text-frost">
            Hello, {USER_NAME}!
          </h1>
          <CaptionBlock caption={caption} userText={userText} />
        </section>

        <div ref={controlsRef} inert={compact} className="fade-away relative z-20 mt-2">
          {statesOpen && (
            <StatesPanel
              state={state}
              micEnabled={micEnabled}
              onPreview={controller.preview}
              onPlaySample={() => {
                controller.playSample();
                setStatesOpen(false);
              }}
              onMicEnabledChange={controller.setMicEnabled}
            />
          )}
          <VoiceDock
            micActive={micActive}
            getLevel={controller.getLevel}
            onMic={controller.toggleMic}
            onSubmit={controller.submit}
            typing={typing}
            onTypingChange={setTyping}
            statesOpen={statesOpen}
            onStatesToggle={() => setStatesOpen((open) => !open)}
          />
        </div>
      </main>

      <CompactBar visible={compact} status={status} onExpand={exitCompact} />
    </div>
  );
}
