import { createBuffer, link, locate, type Uniforms } from "@/lib/webgl";
import { CANVAS_EXTENT, ORB_EXTENT, PARTICLE_COUNT, PARTICLE_SPRITE } from "./orb-geometry";
import type { OrbFrame } from "./orb-motion";
import {
  FRAGMENT_SHADER,
  PARTICLE_FRAGMENT_SHADER,
  PARTICLE_VERTEX_SHADER,
  VERTEX_SHADER,
} from "./orb-shader";

const ORB_UNIFORMS = [
  "uRes",
  "uOrigin",
  "uTime",
  "uRot",
  "uWaveT",
  "uRippleT",
  "uRadius",
  "uBob",
  "uLevel",
  "uWarp",
  "uTwist",
  "uGlow",
  "uRipple",
  "uWave",
  "uEnergy",
  "uDeep",
  "uPrimary",
  "uSecondary",
  "uHighlight",
] as const;

const PARTICLE_UNIFORMS = [
  "uNdcScale",
  "uPointPx",
  "uCycle",
  "uTumble",
  "uShell",
  "uRadius",
  "uBob",
  "uLevel",
  "uTime",
  "uBright",
  "uExtent",
  "uPrimary",
  "uSecondary",
  "uHighlight",
] as const;

/** Floats per particle: orbit (azimuth, elevation, stagger) then look (tint, size, seed). */
const PARTICLE_STRIDE = 6;

interface Attribute {
  location: number;
  buffer: WebGLBuffer;
  size: number;
  stride: number;
  offset: number;
}

/** Fixed per-particle values, from a seeded generator so the cloud looks the same every load. */
function particleData(count: number) {
  let seed = 0x2f6b1d;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const data = new Float32Array(count * PARTICLE_STRIDE);
  for (let i = 0; i < count; i++) {
    const o = i * PARTICLE_STRIDE;
    data[o] = random() * Math.PI * 2; // azimuth
    data[o + 1] = Math.asin(random() * 2 - 1); // elevation, spread evenly over the sphere
    data[o + 2] = (i / count) * 0.3 + random() * 0.04; // stagger, so the cloud forms in a wave
    data[o + 3] = 0.6 * (i / count) + 0.4 * random(); // position along the colour ramp
    data[o + 4] = 0.55 + random() * 0.8; // size
    data[o + 5] = random(); // seed for twinkle and drift
  }
  return data;
}

/**
 * Draws the orb in two passes on one canvas: the sphere shader in a square in the
 * middle, then the particle cloud over the whole canvas. Throws if WebGL is unavailable.
 */
export class OrbRenderer {
  private gl: WebGLRenderingContext;
  private orbProgram: WebGLProgram;
  private orbUniforms: Uniforms<(typeof ORB_UNIFORMS)[number]>;
  private orbAttributes: Attribute[];
  private particleProgram: WebGLProgram;
  private particleUniforms: Uniforms<(typeof PARTICLE_UNIFORMS)[number]>;
  private particleAttributes: Attribute[];
  private buffers: WebGLBuffer[];
  private enabled = new Set<number>();

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error("WebGL is not available");
    this.gl = gl;

    this.orbProgram = link(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.orbUniforms = locate(gl, this.orbProgram, ORB_UNIFORMS);
    const quad = createBuffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
    this.orbAttributes = [
      { location: gl.getAttribLocation(this.orbProgram, "aPosition"), buffer: quad, size: 2, stride: 0, offset: 0 },
    ];

    this.particleProgram = link(gl, PARTICLE_VERTEX_SHADER, PARTICLE_FRAGMENT_SHADER);
    this.particleUniforms = locate(gl, this.particleProgram, PARTICLE_UNIFORMS);
    const particles = createBuffer(gl, particleData(PARTICLE_COUNT));
    const stride = PARTICLE_STRIDE * Float32Array.BYTES_PER_ELEMENT;
    this.particleAttributes = [
      { location: gl.getAttribLocation(this.particleProgram, "aOrbit"), buffer: particles, size: 3, stride, offset: 0 },
      { location: gl.getAttribLocation(this.particleProgram, "aLook"), buffer: particles, size: 3, stride, offset: stride / 2 },
    ];

    this.buffers = [quad, particles];
    gl.clearColor(0, 0, 0, 0);
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(f: OrbFrame) {
    const { gl, canvas } = this;
    const { width, height } = canvas;
    const minSide = Math.min(width, height);

    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Pass 1: the sphere, halo and waveforms, in a square sized to their own extent.
    const side = Math.round((minSide * ORB_EXTENT) / CANVAS_EXTENT);
    const x = Math.round((width - side) / 2);
    const y = Math.round((height - side) / 2);
    gl.viewport(x, y, side, side);
    gl.disable(gl.BLEND);
    gl.useProgram(this.orbProgram);
    this.bindAttributes(this.orbAttributes);

    const o = this.orbUniforms;
    gl.uniform2f(o.uRes, side, side);
    gl.uniform2f(o.uOrigin, x, y);
    gl.uniform1f(o.uTime, f.time);
    gl.uniform1f(o.uRot, f.rot);
    gl.uniform1f(o.uWaveT, f.waveT);
    gl.uniform1f(o.uRippleT, f.rippleT);
    gl.uniform1f(o.uRadius, f.radius);
    gl.uniform1f(o.uBob, f.bob);
    gl.uniform1f(o.uLevel, f.level);
    gl.uniform1f(o.uWarp, f.warp);
    gl.uniform1f(o.uTwist, f.twist);
    gl.uniform1f(o.uGlow, f.glow);
    gl.uniform1f(o.uRipple, f.ripple);
    gl.uniform1f(o.uWave, f.wave);
    gl.uniform1f(o.uEnergy, f.energy);
    gl.uniform3f(o.uDeep, ...f.deep);
    gl.uniform3f(o.uPrimary, ...f.primary);
    gl.uniform3f(o.uSecondary, ...f.secondary);
    gl.uniform3f(o.uHighlight, ...f.highlight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Pass 2: particles over the whole canvas. Colour adds up so they glow where they
    // overlap the orb or each other; alpha composites normally over the page.
    gl.viewport(0, 0, width, height);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.particleProgram);
    this.bindAttributes(this.particleAttributes);

    const unitsToPixels = (0.5 * minSide) / CANVAS_EXTENT;
    const p = this.particleUniforms;
    gl.uniform2f(p.uNdcScale, minSide / width / CANVAS_EXTENT, minSide / height / CANVAS_EXTENT);
    gl.uniform1f(p.uPointPx, PARTICLE_SPRITE * 2 * unitsToPixels);
    gl.uniform1f(p.uCycle, f.cycle);
    gl.uniform2f(p.uTumble, f.tumbleX, f.tumbleY);
    gl.uniform1f(p.uShell, f.shell);
    gl.uniform1f(p.uRadius, f.radius);
    gl.uniform1f(p.uBob, f.bob);
    gl.uniform1f(p.uLevel, f.level);
    gl.uniform1f(p.uTime, f.clock);
    gl.uniform1f(p.uBright, f.sparkle);
    gl.uniform1f(p.uExtent, CANVAS_EXTENT);
    gl.uniform3f(p.uPrimary, ...f.primary);
    gl.uniform3f(p.uSecondary, ...f.secondary);
    gl.uniform3f(p.uHighlight, ...f.highlight);
    gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
  }

  /** Frees GPU resources but keeps the context, so a remount can reuse the same canvas. */
  dispose() {
    const { gl } = this;
    this.buffers.forEach((buffer) => gl.deleteBuffer(buffer));
    gl.deleteProgram(this.orbProgram);
    gl.deleteProgram(this.particleProgram);
  }

  /** WebGL 1 has no vertex array objects, so attributes are rebound for each pass. */
  private bindAttributes(attributes: Attribute[]) {
    const { gl } = this;
    const wanted = new Set(attributes.map((a) => a.location));
    for (const location of this.enabled) {
      if (!wanted.has(location)) gl.disableVertexAttribArray(location);
    }
    for (const { location, buffer, size, stride, offset } of attributes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
    }
    this.enabled = wanted;
  }
}
