import type { OrbState } from "@/components/orb/orb-presets";
import type { VoicePhase } from "@/lib/assistant/voice-phase";

/** Short status shown in the sidebar pill and the compact bar. */
export const STATUS_LABEL: Record<OrbState, string> = {
  idle: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  empathetic: "Speaking…",
  success: "Done",
};

/** The status for what the orb shows, except while a conversation is still connecting. */
export function statusLabel(state: OrbState, phase: VoicePhase) {
  return phase === "connecting" ? "Connecting…" : STATUS_LABEL[state];
}
