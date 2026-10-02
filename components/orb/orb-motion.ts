import type { OrbPreset, RGB } from "./orb-presets";

/** Uniform values for a single rendered frame. */
export interface OrbFrame {
  time: number;
  rot: number;
  waveT: number;
  rippleT: number;
  radius: number;
  bob: number;
  level: number;
  warp: number;
  twist: number;
  glow: number;
  ripple: number;
  wave: number;
  energy: number;
  deep: RGB;
  primary: RGB;
  secondary: RGB;
  highlight: RGB;
}

type NumericKey = {
  [K in keyof OrbPreset]: OrbPreset[K] extends number ? K : never;
}[keyof OrbPreset];
type ColorKey = Exclude<keyof OrbPreset, NumericKey>;
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends RGB ? [number, number, number] : T[K] };

const NUMERIC_KEYS: NumericKey[] = [
  "flow",
  "spin",
  "warp",
  "twist",
  "glow",
  "ripple",
  "wave",
  "scale",
  "breathe",
  "levelGain",
  "energy",
];
const COLOR_KEYS: ColorKey[] = ["deep", "primary", "secondary", "highlight"];

/** How quickly (per second) parameters ease towards a new state; ~1s to mostly settle. */
const BLEND_RATE = 2.4;
const SPRING_STIFFNESS = 140;
const SPRING_DAMPING = 13;
const BREATH_PERIOD = 5.5;
const FLOAT_PERIOD = 7;

/**
 * Turns a target preset plus an audio level into smoothly evolving shader uniforms.
 *
 * Time-like values are integrated (time += dt * speed) rather than computed as
 * time * speed, so the pattern never jumps when a state changes its speed.
 */
export class OrbMotion {
  private current: Mutable<OrbPreset>;
  private frame: OrbFrame;
  private radius = 1;
  private velocity = 0;
  private level = 0;
  private clock = 0;

  constructor(initial: OrbPreset) {
    this.current = {
      ...initial,
      deep: [...initial.deep],
      primary: [...initial.primary],
      secondary: [...initial.secondary],
      highlight: [...initial.highlight],
    };
    this.radius = initial.scale;
    this.frame = {
      time: 0,
      rot: 0,
      waveT: 0,
      rippleT: 0,
      radius: initial.scale,
      bob: 0,
      level: 0,
      warp: initial.warp,
      twist: initial.twist,
      glow: initial.glow,
      ripple: initial.ripple,
      wave: initial.wave,
      energy: initial.energy,
      deep: this.current.deep,
      primary: this.current.primary,
      secondary: this.current.secondary,
      highlight: this.current.highlight,
    };
  }

  /** Give the radius an outward push, e.g. when entering a new state. */
  kick(velocity: number) {
    this.velocity += velocity;
  }

  step(dt: number, target: OrbPreset, rawLevel: number, motionScale: number): OrbFrame {
    const c = this.current;
    const f = this.frame;

    const blend = 1 - Math.exp(-dt * BLEND_RATE);
    for (const key of NUMERIC_KEYS) c[key] += (target[key] - c[key]) * blend;
    for (const key of COLOR_KEYS) {
      for (let i = 0; i < 3; i++) c[key][i] += (target[key][i] - c[key][i]) * blend;
    }

    // Voice level: quick to rise, slower to fall, like a VU meter.
    const levelRate = rawLevel > this.level ? 20 : 7;
    this.level += (rawLevel - this.level) * (1 - Math.exp(-dt * levelRate));

    const m = motionScale;
    this.clock += dt * m;
    f.time += dt * c.flow * m;
    f.rot += dt * c.spin * m;
    f.waveT += dt * (1.4 + this.level * 2.2) * m;
    f.rippleT += dt * (0.42 + this.level * 0.5) * m;

    // The radius rides a spring towards its target, so voice and state changes
    // swell and settle organically instead of snapping.
    const breath = Math.sin((this.clock * Math.PI * 2) / BREATH_PERIOD) * c.breathe;
    const restRadius = c.scale + this.level * c.levelGain + breath;
    const accel = -SPRING_STIFFNESS * (this.radius - restRadius) - SPRING_DAMPING * this.velocity;
    this.velocity += accel * dt;
    this.radius += this.velocity * dt;

    f.radius = this.radius;
    f.bob = Math.sin((this.clock * Math.PI * 2) / FLOAT_PERIOD) * 0.03;
    f.level = this.level;
    f.warp = c.warp;
    f.twist = c.twist;
    f.glow = c.glow;
    f.ripple = c.ripple;
    f.wave = c.wave;
    f.energy = c.energy;
    return f;
  }
}
