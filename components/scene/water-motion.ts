import { ORB_PRESETS, type OrbState, type RGB } from "@/components/orb/orb-presets";
import { MAX_RIPPLES, RIPPLE_LIFE } from "./water-shader";

/** How the water behaves while the orb is in a given state. */
interface WaterPreset {
  /** Height of the slow ambient swells. */
  swell: number;
  /** How busy the surface and caustic patterns are. */
  activity: number;
  /** Small fast waves around the orb, scaled by the voice level. */
  chop: number;
  /** Strength of the orb's light on the water. */
  glow: number;
  /** Seconds between gentle rings sent out by the orb; 0 for none. */
  pulse: number;
  /** How strongly the voice sends out ripples from the orb; 0 for none. */
  voice: number;
}

const WATER_PRESETS: Record<OrbState, WaterPreset> = {
  idle: { swell: 0.7, activity: 0, chop: 0, glow: 0.75, pulse: 0, voice: 0 },
  listening: { swell: 0.8, activity: 0.15, chop: 0, glow: 0.95, pulse: 2.6, voice: 0.8 },
  thinking: { swell: 1.25, activity: 0.8, chop: 0.25, glow: 0.85, pulse: 0, voice: 0 },
  speaking: { swell: 0.9, activity: 0.3, chop: 1, glow: 1, pulse: 0, voice: 0.9 },
  empathetic: { swell: 0.6, activity: 0, chop: 0.4, glow: 1, pulse: 0, voice: 0.4 },
  success: { swell: 0.8, activity: 0.2, chop: 0, glow: 1.15, pulse: 0, voice: 0 },
};

/** A ring sent out by the orb as it enters these states. */
const ENTRY_RING: Partial<Record<OrbState, number>> = { listening: 0.8, success: 1 };

const BLEND_RATE = 1.8;
/** Strength of a tap's ripple. */
const TAP_STRENGTH = 1;
/** The voice sends a ripple each time this much loudness has built up… */
const VOICE_CHARGE = 0.55;
/** …but no more often than this. */
const VOICE_MIN_GAP = 0.22;

/** Where the orb is, in water units (see water-shader.ts). */
export interface OrbAnchor {
  x: number;
  y: number;
  radius: number;
}

export interface WaterFrame {
  time: number;
  clock: number;
  ripples: Float32Array;
  orb: [number, number, number, number];
  glowA: RGB;
  glowB: RGB;
  glowC: RGB;
  swell: number;
  activity: number;
  chop: number;
}

const mixRgb = (from: [number, number, number], to: RGB, amount: number) => {
  for (let i = 0; i < 3; i++) from[i] += (to[i] - from[i]) * amount;
};

/**
 * Turns the orb's state, the voice level and taps into the water's uniforms. Settings
 * ease between states; ripples live in a small ring buffer and fade out on their own.
 */
export class WaterMotion {
  private params: Omit<WaterPreset, "pulse" | "voice">;
  private glowA: [number, number, number];
  private glowB: [number, number, number];
  private glowC: [number, number, number];
  private ripples = new Float32Array(MAX_RIPPLES * 4);
  private next = 0;
  private time = 0;
  private clock = 0;
  private lastRipple = -Infinity;
  private state: OrbState;
  private sincePulse = 0;
  private charge = 0;
  private sinceVoice = 0;
  private orb: OrbAnchor | null = null;

  constructor(state: OrbState) {
    this.state = state;
    const { swell, activity, chop, glow } = WATER_PRESETS[state];
    this.params = { swell, activity, chop, glow };
    const colors = ORB_PRESETS[state];
    this.glowA = [...colors.primary];
    this.glowB = [...colors.secondary];
    this.glowC = [...colors.highlight];
  }

  /** Drops a ripple at a point, in water units. */
  addRipple(x: number, y: number, strength = TAP_STRENGTH) {
    const o = this.next * 4;
    this.ripples[o] = x;
    this.ripples[o + 1] = y;
    this.ripples[o + 2] = this.clock;
    this.ripples[o + 3] = strength;
    this.next = (this.next + 1) % MAX_RIPPLES;
    this.lastRipple = this.clock;
  }

  /** Whether anything is moving beyond the slow idle swell, so it's worth a full frame rate. */
  get busy() {
    return this.state !== "idle" || this.clock - this.lastRipple < RIPPLE_LIFE;
  }

  step(dt: number, state: OrbState, level: number, orb: OrbAnchor | null, motionScale: number): WaterFrame {
    const preset = WATER_PRESETS[state];
    this.orb = orb;
    if (state !== this.state) {
      this.state = state;
      this.sincePulse = 0;
      this.charge = 0;
      const ring = ENTRY_RING[state];
      if (ring) this.ringFromOrb(ring);
    }

    const blend = 1 - Math.exp(-dt * BLEND_RATE);
    const p = this.params;
    p.swell += (preset.swell - p.swell) * blend;
    p.activity += (preset.activity - p.activity) * blend;
    p.chop += (preset.chop * (0.25 + 0.75 * level) - p.chop) * blend * 3;
    p.glow += (preset.glow * (1 + 0.25 * level) - p.glow) * blend;
    const colors = ORB_PRESETS[state];
    mixRgb(this.glowA, colors.primary, blend);
    mixRgb(this.glowB, colors.secondary, blend);
    mixRgb(this.glowC, colors.highlight, blend);

    this.time += dt * motionScale;
    this.clock += dt;

    // Gentle rings at a steady pace while listening.
    this.sincePulse += dt;
    if (preset.pulse > 0 && this.sincePulse >= preset.pulse) {
      this.sincePulse = 0;
      this.ringFromOrb(0.5);
    }

    // The voice sends out ripples: more, and stronger, the louder it gets.
    this.sinceVoice += dt;
    if (preset.voice > 0) {
      this.charge += level * dt * 4;
      if (this.charge >= VOICE_CHARGE && this.sinceVoice >= VOICE_MIN_GAP && level > 0.12) {
        this.charge = 0;
        this.sinceVoice = 0;
        this.ringFromOrb(preset.voice * Math.min(1, 0.3 + level * 0.8));
      }
    } else {
      this.charge = 0;
    }

    return {
      time: this.time,
      clock: this.clock,
      ripples: this.ripples,
      orb: orb ? [orb.x, orb.y, orb.radius, p.glow] : [0, 0, 0.1, 0],
      glowA: this.glowA,
      glowB: this.glowB,
      glowC: this.glowC,
      swell: p.swell,
      activity: p.activity,
      chop: orb ? p.chop : 0,
    };
  }

  private ringFromOrb(strength: number) {
    if (this.orb) this.addRipple(this.orb.x, this.orb.y, strength);
  }
}
