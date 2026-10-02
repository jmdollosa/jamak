export const VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * The orb is drawn analytically on a full-canvas triangle.
 *
 * Space is normalised so the sphere has radius ~1 and the canvas spans ±EXTENT,
 * leaving room around it for the halo, ripples and speech waveforms.
 *
 * The "liquid" look comes from sampling a domain-warped, ridged noise field on
 * several translucent shells: the front of the sphere, its back wall seen through
 * the glass, and an inner shell. Each shell turns at its own rate, so the layers
 * slide past one another with real parallax.
 */
export const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uRot;
uniform float uWaveT;
uniform float uRippleT;
uniform float uRadius;
uniform float uBob;
uniform float uLevel;
uniform float uWarp;
uniform float uTwist;
uniform float uGlow;
uniform float uRipple;
uniform float uWave;
uniform float uEnergy;
uniform vec3 uDeep;
uniform vec3 uPrimary;
uniform vec3 uSecondary;
uniform vec3 uHighlight;

#define EXTENT 2.4

// 3D simplex noise by Ian McEwan and Stefan Gustavson (MIT licence).
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, s, -s, c);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Turn a point on a shell into that shell's own rotating, twisting frame.
vec3 orient(vec3 pt, float spin, float layer) {
  pt.xz = rot(uRot * spin + pt.y * uTwist + layer * 2.1) * pt.xz;
  pt.yz = rot(0.35 + layer * 0.45) * pt.yz;
  return pt;
}

// x: a few long silky strands, y: soft smoky density.
vec2 field(vec3 q, float t) {
  vec3 w = vec3(
    snoise(q * 0.8 + vec3(0.0, 0.0, t)),
    snoise(q * 0.8 + vec3(4.1, 1.7, -t)),
    snoise(q * 0.8 + vec3(-2.3, 6.2, t * 0.7))
  );
  q += w * uWarp;
  float n = snoise(q * 0.9 + vec3(0.0, t * 0.3, 0.0));
  float strands = pow(max(1.0 - abs(n), 0.0), 8.0);
  float fine = pow(max(1.0 - abs(snoise(q * 1.9 - vec3(t * 0.2, 0.0, 0.0))), 0.0), 16.0);
  // Light only some regions, so the sphere keeps dark depths between the wisps.
  float lit = smoothstep(-0.4, 0.7, w.y);
  float cloud = smoothstep(-0.6, 0.9, w.x + 0.5 * n);
  return vec2((strands + 0.3 * fine) * lit, cloud);
}

void main() {
  float minRes = min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / (0.5 * minRes) * EXTENT;
  float px = 2.0 * EXTENT / minRes;

  float R = uRadius;
  vec2 q = p - vec2(0.0, uBob);
  float r = length(q);
  float t = uTime;

  // Where the secondary colour pools. It drifts slowly so the orb never looks static.
  vec2 accDir = rot(sin(t * 0.37) * 0.5) * normalize(vec2(0.75, -0.65));

  // ---------------------------------------------------------------- outside
  float d = max(r - R, 0.0) / R;
  float edgeFade = smoothstep(EXTENT * 0.98, EXTENT * 0.55, length(p));
  float around = 0.5 + 0.5 * dot(q / max(r, 1e-4), accDir);
  vec3 haloCol = mix(uPrimary, uSecondary, around * 0.6);
  float halo = (0.5 * exp(-d * 2.8) + 0.7 * exp(-d * 11.0)) * uGlow * edgeFade;
  vec3 outside = haloCol * halo;

  // A thin band of light beneath the orb, as if it hovered over a glossy surface.
  vec2 fl = vec2(p.x / 0.85, (p.y + 1.2) / 0.035);
  vec2 fs = vec2(p.x / 1.3, (p.y + 1.2) / 0.2);
  float flare = exp(-dot(fl, fl));
  float flareSoft = exp(-dot(fs, fs));
  float proximity = 1.0 - uBob * 6.0;
  outside += mix(uPrimary, uHighlight, 0.4) * (flare * 0.75 + flareSoft * 0.22) * uGlow * proximity;

  // Ripple rings while listening.
  if (uRipple > 0.001) {
    vec2 e = vec2(q.x, q.y * 1.1) / R;
    float de = length(e);
    float ang = atan(e.y, e.x);
    float rings = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float ph = fract(uRippleT + fi * 0.25);
      float wob = 0.018 * sin(ang * 3.0 + uRippleT * 5.0 + fi * 1.7)
                + 0.010 * sin(ang * 5.0 - uRippleT * 3.0 + fi);
      float ringR = 1.05 + ph * 0.85 + wob;
      float w = 0.010 + ph * 0.03;
      float x = (de - ringR) / w;
      float ring = exp(-x * x) + 0.25 * exp(-abs(de - ringR) / (w * 6.0));
      rings += ring * pow(1.0 - ph, 1.7) * smoothstep(0.0, 0.1, ph);
    }
    rings *= smoothstep(1.0, 1.06, de) * uRipple * (0.5 + 1.4 * uLevel);
    outside += mix(uPrimary, uHighlight, 0.45) * rings;
  }

  // ----------------------------------------------------------------- inside
  float inside = smoothstep(R + px, R - px, r);
  vec3 interior = vec3(0.0);

  if (r < R + px) {
    vec2 s = q / R;
    float rr = min(length(s), 0.9995);
    float z = sqrt(1.0 - rr * rr);
    vec3 n = vec3(s, z);
    float fres = pow(1.0 - z, 1.8);
    // 0 over most of the face, rising to 1 at the lower-right edge.
    float acc = smoothstep(0.05, 0.95, dot(s, accDir));

    // Front of the outer shell, its back wall through the glass, and an inner shell.
    vec2 front = field(orient(vec3(s, z), 1.0, 0.0), t);
    vec2 back = field(orient(vec3(s, -z), 1.0, 0.0), t);

    float s2 = 0.7;
    vec2 inner = vec2(0.0);
    float innerMask = 0.0;
    if (rr < s2) {
      float z2 = sqrt(s2 * s2 - rr * rr);
      inner = field(orient(vec3(s, z2) / s2, -0.7, 1.0) * 1.15 + 3.7, t * 1.2);
      innerMask = smoothstep(s2, s2 * 0.5, rr);
    }

    // Smoky body: deep in the hollows, primary where the smoke thickens and at the rim.
    float smoke = front.y * 0.65 + inner.y * innerMask * 0.35;
    vec3 body = mix(uDeep, uPrimary, 0.25 + 0.6 * smoke + 0.3 * fres);
    body = mix(body, uSecondary, acc * (0.25 + 0.55 * fres));

    vec3 strandCol = mix(uPrimary * 1.7, uHighlight, 0.15);
    vec3 light = vec3(0.0);
    light += mix(strandCol, uSecondary * 1.5, acc) * front.x * (0.9 + 1.0 * fres);
    light += mix(uPrimary, uSecondary, 0.5) * back.x * 0.2;
    light += strandCol * inner.x * innerMask * 0.5;

    // Core glow swells with the voice.
    light += mix(uPrimary, uHighlight, 0.3) * exp(-rr * rr * 5.0) * (0.06 + 0.4 * uLevel);

    interior = body * (0.9 + 0.25 * uLevel) + light * uEnergy * (1.0 + 0.6 * uLevel);

    // Rim light and a soft reflection on the upper left.
    vec3 rimCol = mix(mix(uHighlight, uPrimary, 0.5), uSecondary * 1.4, acc);
    interior += rimCol * (pow(rr, 16.0) * 1.3 + pow(fres, 2.2) * 0.6) * (0.8 + 0.4 * uGlow);

    vec3 L = normalize(vec3(-0.55, 0.65, 0.55));
    float facing = max(dot(n, L), 0.0);
    interior += uHighlight * (pow(facing, 40.0) * 0.45 + pow(facing, 8.0) * 0.08);
    float arc = smoothstep(0.82, 0.93, rr) * smoothstep(0.995, 0.95, rr)
              * smoothstep(0.2, 0.9, dot(s / max(rr, 1e-4), normalize(vec2(-0.6, 0.8))));
    interior += uHighlight * arc * 0.25;
  }

  vec3 col = mix(outside, interior, inside);

  // A little bloom straddling the silhouette so the edge glows rather than cuts.
  float bloom = exp(-abs(r - R) / R * 22.0);
  col += mix(uHighlight, uPrimary, 0.5) * bloom * 0.18 * uGlow;

  // Speech waveforms: thin glowing strands that run through the orb.
  if (uWave > 0.001) {
    float x = q.x / R;
    float y = q.y / R;
    float env = smoothstep(2.25, 0.95, abs(x));
    vec3 strands = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float amp = (0.06 + 0.3 * uLevel) * (1.0 - 0.17 * fi);
      float k = 2.4 + fi * 0.75;
      float yy = -0.12 - fi * 0.025
               + amp * env * sin(x * k + uWaveT * (1.6 + 0.4 * fi) + fi * 1.9)
               * cos(x * 0.9 - uWaveT * 0.7 + fi);
      float dist = abs(y - yy);
      float line = exp(-dist / 0.012) + 0.18 * exp(-dist / 0.07);
      vec3 lc = mix(uHighlight, mix(uPrimary, uSecondary, mod(fi, 2.0)), min(fi, 1.0) * 0.75);
      strands += lc * line;
    }
    col += strands * env * uWave * mix(1.0, 0.55, inside) * (0.55 + 0.8 * uLevel);
  }

  // Soft shoulder. Mostly hue-preserving to keep the colour rich, with a little
  // per-channel roll-off so the hottest spots still burn towards white.
  vec3 perChannel = 1.0 - exp(-col * 1.4);
  float peak = max(max(col.r, col.g), max(col.b, 1e-4));
  vec3 huePreserving = col * ((1.0 - exp(-peak * 1.4)) / peak);
  col = mix(huePreserving, perChannel, 0.4);

  col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  col = max(col, 0.0);

  float alpha = max(inside, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
  gl_FragColor = vec4(min(col, vec3(alpha)), alpha);
}
`;
