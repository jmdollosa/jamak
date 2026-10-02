import { createBuffer, link, locate, type Uniforms } from "@/lib/webgl";
import type { WaterFrame } from "./water-motion";
import { WATER_FRAGMENT_SHADER, WATER_VERTEX_SHADER } from "./water-shader";

const UNIFORMS = [
  "uRes",
  "uTime",
  "uClock",
  "uRipples",
  "uOrb",
  "uGlowA",
  "uGlowB",
  "uGlowC",
  "uSwell",
  "uActivity",
  "uChop",
] as const;

/** Draws the water in a single full-screen pass. Throws if WebGL is unavailable. */
export class WaterRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private uniforms: Uniforms<(typeof UNIFORMS)[number]>;
  private buffer: WebGLBuffer;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) throw new Error("WebGL is not available");
    this.gl = gl;

    this.program = link(gl, WATER_VERTEX_SHADER, WATER_FRAGMENT_SHADER);
    this.uniforms = locate(gl, this.program, UNIFORMS);
    this.buffer = createBuffer(gl, new Float32Array([-1, -1, 3, -1, -1, 3]));
    const position = gl.getAttribLocation(this.program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(this.program);
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  draw(f: WaterFrame) {
    const { gl, canvas } = this;
    const u = this.uniforms;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform1f(u.uTime, f.time);
    gl.uniform1f(u.uClock, f.clock);
    gl.uniform4fv(u.uRipples, f.ripples);
    gl.uniform4f(u.uOrb, ...f.orb);
    gl.uniform3f(u.uGlowA, ...f.glowA);
    gl.uniform3f(u.uGlowB, ...f.glowB);
    gl.uniform3f(u.uGlowC, ...f.glowC);
    gl.uniform1f(u.uSwell, f.swell);
    gl.uniform1f(u.uActivity, f.activity);
    gl.uniform1f(u.uChop, f.chop);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Frees GPU resources but keeps the context, so a remount can reuse the canvas. */
  dispose() {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}
