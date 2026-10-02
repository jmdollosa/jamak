import type { OrbFrame } from "./orb-motion";
import { FRAGMENT_SHADER, VERTEX_SHADER } from "./orb-shader";

const UNIFORMS = [
  "uRes",
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

type UniformName = (typeof UNIFORMS)[number];

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Could not create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Orb shader failed to compile: ${log}`);
  }
  return shader;
}

/** Thin WebGL wrapper: one program, one full-canvas triangle. Throws if WebGL is unavailable. */
export class OrbRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private uniforms: Record<UniformName, WebGLUniformLocation | null>;

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

    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) throw new Error("Could not create program");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error(`Orb program failed to link: ${log}`);
    }
    this.program = program;

    const buffer = gl.createBuffer();
    if (!buffer) throw new Error("Could not create buffer");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    this.buffer = buffer;

    gl.useProgram(program);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    this.uniforms = Object.fromEntries(
      UNIFORMS.map((name) => [name, gl.getUniformLocation(program, name)]),
    ) as Record<UniformName, WebGLUniformLocation | null>;

    gl.clearColor(0, 0, 0, 0);
  }

  resize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  draw(f: OrbFrame) {
    const { gl, uniforms: u } = this;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, f.time);
    gl.uniform1f(u.uRot, f.rot);
    gl.uniform1f(u.uWaveT, f.waveT);
    gl.uniform1f(u.uRippleT, f.rippleT);
    gl.uniform1f(u.uRadius, f.radius);
    gl.uniform1f(u.uBob, f.bob);
    gl.uniform1f(u.uLevel, f.level);
    gl.uniform1f(u.uWarp, f.warp);
    gl.uniform1f(u.uTwist, f.twist);
    gl.uniform1f(u.uGlow, f.glow);
    gl.uniform1f(u.uRipple, f.ripple);
    gl.uniform1f(u.uWave, f.wave);
    gl.uniform1f(u.uEnergy, f.energy);
    gl.uniform3f(u.uDeep, ...f.deep);
    gl.uniform3f(u.uPrimary, ...f.primary);
    gl.uniform3f(u.uSecondary, ...f.secondary);
    gl.uniform3f(u.uHighlight, ...f.highlight);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Frees GPU resources but keeps the context, so a remount can reuse the same canvas. */
  dispose() {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
  }
}
