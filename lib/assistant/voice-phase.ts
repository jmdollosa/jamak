import type { OrbState } from "@/components/orb/orb-presets";

/**
 * Where a live voice conversation is. The controller moves between these on OpenAI
 * Realtime events; the orb shows each one with one of its existing states.
 */
export type VoicePhase =
  | "idle" // no conversation
  | "connecting" // microphone and WebRTC connection being set up
  | "listening" // connected; the user may be talking
  | "thinking" // the user finished; Jamak is preparing a reply
  | "speaking" // Jamak's reply is playing
  | "interrupted" // the user talked over Jamak, which stopped to listen
  | "error"; // the connection failed or dropped; the caption says why

/** How each phase looks, using the orb's existing states, colors and animations. */
export const ORB_STATE_FOR_PHASE: Record<VoicePhase, OrbState> = {
  idle: "idle",
  // Violet currents: Jamak is busy getting ready. Turns cyan once it can hear you.
  connecting: "thinking",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  // Straight back to listening; the change from speaking gives the orb a visible pulse.
  interrupted: "listening",
  // The orb settles; the caption explains what went wrong.
  error: "idle",
};

/** Whether the microphone and connection are open in this phase. */
export function isVoiceActive(phase: VoicePhase) {
  return phase !== "idle" && phase !== "error";
}
