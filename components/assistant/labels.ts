import type { OrbState } from "@/components/orb/orb-presets";

/** Short status shown in the sidebar pill and the compact bar. */
export const STATUS_LABEL: Record<OrbState, string> = {
  idle: "Ready",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  empathetic: "Speaking…",
  success: "Done",
};
