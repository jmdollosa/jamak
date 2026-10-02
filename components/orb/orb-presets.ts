export type OrbState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "empathetic"
  | "success";

export const ORB_STATES: readonly OrbState[] = [
  "idle",
  "listening",
  "thinking",
  "speaking",
  "empathetic",
  "success",
];

export type RGB = readonly [number, number, number];

/** Everything the shader needs to know about a state. Values are eased between states. */
export interface OrbPreset {
  /** Darkest tone, seen in the core of the sphere. */
  deep: RGB;
  /** Main body and halo colour. */
  primary: RGB;
  /** Accent that pools towards the lower right, like the mockup's magenta edge. */
  secondary: RGB;
  /** Near-white tint for filaments, rim and specular light. */
  highlight: RGB;
  /** Speed of the liquid flow inside the sphere. */
  flow: number;
  /** Rotation speed of the internal layers. */
  spin: number;
  /** Turbulence of the domain warp, higher reads as more agitated. */
  warp: number;
  /** How much the layers corkscrew around the vertical axis. */
  twist: number;
  /** Halo and floor-light strength. */
  glow: number;
  /** Ripple rings around the sphere (0–1). */
  ripple: number;
  /** Waveform ribbons through the sphere (0–1). */
  wave: number;
  /** Resting radius multiplier. */
  scale: number;
  /** Breathing amplitude as a fraction of the radius. */
  breathe: number;
  /** How much the audio level pushes the radius outwards. */
  levelGain: number;
  /** Overall brightness of the internal light. */
  energy: number;
  /** Radius of the particle shell, in sphere radii. */
  particleShell: number;
  /** Speed of the emerge → hold → disperse cycle (1 = 14s). */
  particleSpeed: number;
  /** How fast the particle shell tumbles, in radians per second. */
  particleTumble: number;
  /** Particle brightness. */
  particleGlow: number;
}

function hex(value: string): RGB {
  const n = Number.parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const ORB_PRESETS: Record<OrbState, OrbPreset> = {
  idle: {
    deep: hex("#06145c"),
    primary: hex("#2563ff"),
    secondary: hex("#a447ff"),
    highlight: hex("#cfe4ff"),
    flow: 0.3,
    spin: 0.1,
    warp: 0.55,
    twist: 0.25,
    glow: 0.9,
    ripple: 0,
    wave: 0,
    scale: 1,
    breathe: 0.018,
    levelGain: 0,
    energy: 1,
    particleShell: 1.38,
    particleSpeed: 1.0,
    particleTumble: 0.45,
    particleGlow: 1.0,
  },
  listening: {
    deep: hex("#00384a"),
    primary: hex("#0fd3e6"),
    secondary: hex("#2f7dff"),
    highlight: hex("#d4fffb"),
    flow: 0.55,
    spin: 0.18,
    warp: 0.7,
    twist: 0.3,
    glow: 1.1,
    ripple: 1,
    wave: 0,
    scale: 1.05,
    breathe: 0.008,
    levelGain: 0.1,
    energy: 1.15,
    particleShell: 1.28,
    particleSpeed: 1.25,
    particleTumble: 0.55,
    particleGlow: 1.15,
  },
  thinking: {
    deep: hex("#1c0858"),
    primary: hex("#7a3cff"),
    secondary: hex("#ff4fd2"),
    highlight: hex("#f0dcff"),
    flow: 0.7,
    spin: 0.6,
    warp: 0.95,
    twist: 1.1,
    glow: 1,
    ripple: 0,
    wave: 0,
    scale: 0.98,
    breathe: 0.012,
    levelGain: 0,
    energy: 1.2,
    particleShell: 1.32,
    particleSpeed: 1.6,
    particleTumble: 1.0,
    particleGlow: 1.2,
  },
  speaking: {
    deep: hex("#0a1466"),
    primary: hex("#3d5cff"),
    secondary: hex("#c04dff"),
    highlight: hex("#e2dcff"),
    flow: 0.5,
    spin: 0.16,
    warp: 0.7,
    twist: 0.35,
    glow: 1.05,
    ripple: 0,
    wave: 1,
    scale: 1,
    breathe: 0.006,
    levelGain: 0.05,
    energy: 1.15,
    particleShell: 1.4,
    particleSpeed: 1.2,
    particleTumble: 0.5,
    particleGlow: 1.15,
  },
  empathetic: {
    deep: hex("#4a1500"),
    primary: hex("#ff8a14"),
    secondary: hex("#ffc93a"),
    highlight: hex("#fff1cc"),
    flow: 0.2,
    spin: 0.06,
    warp: 0.45,
    twist: 0.15,
    glow: 1.25,
    ripple: 0,
    wave: 0.35,
    scale: 1,
    breathe: 0.022,
    levelGain: 0.03,
    energy: 0.95,
    particleShell: 1.46,
    particleSpeed: 0.7,
    particleTumble: 0.28,
    particleGlow: 1.0,
  },
  success: {
    deep: hex("#003f2a"),
    primary: hex("#14de8e"),
    secondary: hex("#6dffc0"),
    highlight: hex("#e0fff0"),
    flow: 0.35,
    spin: 0.12,
    warp: 0.5,
    twist: 0.2,
    glow: 1.3,
    ripple: 0,
    wave: 0,
    scale: 1,
    breathe: 0.012,
    levelGain: 0,
    energy: 1.1,
    particleShell: 1.55,
    particleSpeed: 1.3,
    particleTumble: 0.6,
    particleGlow: 1.35,
  },
};

/** Radial velocity added when the orb enters a state, so changes land with a little bounce. */
export const ORB_KICKS: Record<OrbState, number> = {
  idle: 0.1,
  listening: 0.4,
  thinking: 0.15,
  speaking: 0.2,
  empathetic: 0.1,
  success: 0.9,
};

/** Interface-facing details for each state: the CSS aura colours and how we describe it. */
export const ORB_STATE_META: Record<
  OrbState,
  { name: string; colorName: string; aura: string; aura2: string; summary: string }
> = {
  idle: {
    name: "Idle",
    colorName: "Blue",
    aura: "#3b82f6",
    aura2: "#8b5cf6",
    summary: "Gentle floating, slow breathing glow.",
  },
  listening: {
    name: "Listening",
    colorName: "Cyan",
    aura: "#22d3ee",
    aura2: "#3b82f6",
    summary: "Expands with your voice, with soft ripples.",
  },
  thinking: {
    name: "Thinking",
    colorName: "Violet",
    aura: "#8b5cf6",
    aura2: "#ec4899",
    summary: "Internal light currents turn faster.",
  },
  speaking: {
    name: "Speaking",
    colorName: "Indigo",
    aura: "#6366f1",
    aura2: "#a855f7",
    summary: "Waveforms move with the rhythm of speech.",
  },
  empathetic: {
    name: "Warm",
    colorName: "Amber",
    aura: "#f59e0b",
    aura2: "#fbbf24",
    summary: "Softer light and slower motion.",
  },
  success: {
    name: "Done",
    colorName: "Mint",
    aura: "#10b981",
    aura2: "#6ee7b7",
    summary: "A gentle swell, then a settled glow.",
  },
};
