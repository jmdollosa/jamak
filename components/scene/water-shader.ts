/** How many ripples can be on the water at once. Matches the uniform array below. */
export const MAX_RIPPLES = 16;
/** Seconds a ripple lasts before it has spread out and faded. */
export const RIPPLE_LIFE = 6;

export const WATER_VERTEX_SHADER = /* glsl */ `
attribute vec2 aPosition;

void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

/**
 * A dark water surface seen from above, drawn analytically in one pass.
 *
 * The surface is described by its slope: a few slow crossing swells, ripples spreading
 * from taps and from the orb, and some chop near the orb while it speaks. Ripples are
 * summed, so where they overlap they interfere like real ones. The slope tilts the
 * water's normal, which decides what each point reflects: a dim sky with a cool key
 * light, the orb's glow, and faint caustic light on the depths below.
 *
 * Space is normalised so the viewport's shorter side spans 1 unit, centred on the screen.
 */
export const WATER_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

#define RIPPLES ${MAX_RIPPLES}
#define RIPPLE_LIFE ${RIPPLE_LIFE.toFixed(1)}

uniform vec2 uRes;
uniform float uTime;            // ambient clock, slowed under reduced motion
uniform float uClock;           // ripple clock; ripple start times are on it
uniform vec4 uRipples[RIPPLES]; // xy: centre, z: start time, w: strength (0 = empty)
uniform vec4 uOrb;              // xy: centre, z: radius, w: glow strength
uniform vec3 uGlowA;            // the orb's colours
uniform vec3 uGlowB;
uniform vec3 uGlowC;
uniform float uSwell;           // ambient wave height
uniform float uActivity;        // how busy the surface pattern is
uniform float uChop;            // small fast waves around the orb

const float RIPPLE_SPEED = 0.16;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Slope of one travelling sine wave, normalised so its steepest slope is 1.
vec2 wave(vec2 p, vec2 dir, float k, float speed, float t) {
  return dir * cos(dot(p, dir) * k + t * speed);
}

// Long, slow swells crossing each other, gently warped so no crest is ruler-straight.
vec2 swell(vec2 p, float t) {
  p += 0.06 * vec2(sin(p.y * 2.3 + t * 0.21), sin(p.x * 2.1 - t * 0.17));
  vec2 g = wave(p, vec2(0.80, 0.60), 9.0, 0.55, t);
  g += wave(p, vec2(-0.45, 0.89), 13.0, 0.7, t) * 0.7;
  g += wave(p, vec2(0.96, -0.28), 17.0, 0.9, t) * 0.5;
  g += wave(p, vec2(-0.70, -0.71), 23.0, 1.1, t) * 0.35;
  g += wave(p, vec2(0.20, 0.98), 31.0, 1.4, t) * 0.25;
  return g;
}

// Light focused by the waves onto the bottom: thin bright lines along the edges of
// slowly drifting cells.
float caustic(vec2 p, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(cell + g);
      o = 0.5 + 0.42 * sin(t + 6.2831 * o);
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < d1) {
        d2 = d1;
        d1 = d;
      } else if (d < d2) {
        d2 = d;
      }
    }
  }
  float edge = sqrt(d2) - sqrt(d1);
  return exp(-edge * 10.0);
}

void main() {
  float minRes = min(uRes.x, uRes.y);
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / minRes;
  float t = uTime;

  vec2 slope = swell(p, t * (0.6 + uActivity)) * uSwell * 0.03;

  // Ripples: a sharp leading ring with fading rings behind it, spreading out and
  // stretching as it goes.
  vec2 ripple = vec2(0.0);
  for (int i = 0; i < RIPPLES; i++) {
    vec4 rp = uRipples[i];
    float age = uClock - rp.z;
    if (rp.w <= 0.0 || age <= 0.0 || age >= RIPPLE_LIFE) continue;
    vec2 d = p - rp.xy;
    float dist = length(d) + 1e-4;
    float behind = age * RIPPLE_SPEED - dist;
    float tail = 0.035 + age * 0.05;
    float envelope = smoothstep(-0.012, 0.004, behind) * exp(-max(behind, 0.0) / tail);
    float k = 300.0 / (1.0 + age * 0.6);
    float strength = rp.w * 0.65 * exp(-age * 0.6) * smoothstep(0.0, 0.08, age) / (1.0 + dist * 4.0);
    ripple += d / dist * strength * envelope * sin(k * behind);
  }
  slope += ripple;

  // The orb: where it hovers, and quick small waves around it while it talks.
  vec2 orb = uOrb.xy;
  float R = uOrb.z;
  vec2 od = p - orb;
  float orbDist = length(od);
  float near = exp(-max(orbDist - R, 0.0) / (R * 1.8));
  slope += uChop * near * 0.05 * vec2(
    sin(p.x * 55.0 + t * 4.0 + 3.0 * sin(p.y * 31.0 - t * 2.3)),
    sin(p.y * 49.0 - t * 3.6 + 3.0 * sin(p.x * 37.0 + t * 1.9))
  );

  vec3 n = normalize(vec3(-slope, 1.0));
  vec3 refl = reflect(vec3(0.0, 0.0, -1.0), n);

  // Deep water, a little lighter towards the middle of the scene.
  float centre = exp(-dot(p, p) * 1.3);
  vec3 col = mix(vec3(0.004, 0.008, 0.02), vec3(0.014, 0.026, 0.06), centre);

  // The sky: a broad, patchy sheen on slopes facing the upper left, more of it on steep
  // slopes such as ripple crests, and sharp glints of a key light.
  vec3 key = normalize(vec3(-0.32, 0.38, 0.87));
  float clouds = 0.35 + 1.3 * vnoise(p * 1.4 + vec2(t * 0.025, -t * 0.018));
  col += vec3(0.07, 0.1, 0.19) * max(dot(refl.xy, normalize(key.xy)), 0.0) * 5.0 * clouds;
  col += vec3(0.16, 0.21, 0.34) * smoothstep(0.03, 0.35, length(ripple)) * 0.35;
  float keyLight = max(dot(refl, key), 0.0);
  col += vec3(0.62, 0.74, 1.0) * (pow(keyLight, 300.0) * 1.8 + pow(keyLight, 40.0) * 0.12);

  // The orb's light on the water: a soft pool, reaching a little further below it, and
  // glints wherever a wave tilts towards it.
  float glow = uOrb.w;
  float around = 0.5 + 0.5 * sin(atan(od.y, od.x) * 1.0 + t * 0.15);
  vec3 orbCol = mix(mix(uGlowA, uGlowB, around), uGlowC, 0.15);
  vec2 pool = vec2(od.x, od.y + R * 0.35) / vec2(1.0, 1.25);
  float poolDist = max(length(pool) - R * 0.7, 0.0);
  float reach = exp(-poolDist / (R * 1.9));
  col += orbCol * (exp(-poolDist / (R * 0.55)) * 0.32 + reach * 0.06) * glow;
  vec3 toOrb = normalize(vec3(orb - p, R * 1.3));
  float facing = max(dot(refl, toOrb), 0.0);
  col += orbCol * reach * (pow(facing, 60.0) * 1.4 + pow(facing, 12.0) * 0.12) * glow;

  // Caustics on the depths: a network of soft, curving light, only in patches, nudged by
  // the surface above, and brightest in the orb's light.
  vec2 cp = p * 3.4;
  cp += 0.3 * vec2(sin(cp.y * 1.3 + t * 0.12), sin(cp.x * 1.1 - t * 0.1));
  cp += slope * 6.0;
  float c = caustic(cp, t * (0.25 + 0.6 * uActivity)) * 0.75
          + caustic(cp * 2.1 + 7.3, t * (0.35 + 0.6 * uActivity)) * 0.25;
  float patches = smoothstep(0.35, 0.85, vnoise(p * 1.7 + vec2(-t * 0.02, t * 0.015)));
  vec3 causticCol = mix(vec3(0.3, 0.45, 0.85), orbCol, reach * 0.8);
  col += causticCol * c * ((0.01 + 0.035 * centre) * patches + 0.28 * reach * glow);

  // Darker towards the edges of the screen.
  vec2 v = (gl_FragCoord.xy / uRes - 0.5) * vec2(1.0, 1.15);
  col *= 1.0 - 0.55 * smoothstep(0.25, 0.75, length(v));

  col = 1.0 - exp(-col * 1.25);
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, 0.0), 1.0);
}
`;
