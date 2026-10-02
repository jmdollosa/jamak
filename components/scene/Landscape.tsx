// A night mountain scene, generated once from fixed seeds so the server and
// client render identical markup. Pure SVG: no images, no client JavaScript.

const W = 1600;
const H = 900;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Peak = readonly [x: number, height: number, spread: number];
type Point = readonly [x: number, y: number];

/** Midpoint-displacement detail on top of a few hand-placed peaks. */
function ridgeline(seed: number, base: number, peaks: readonly Peak[], roughness: number): Point[] {
  const rand = seeded(seed);
  const n = 256;
  const detail = new Array<number>(n + 1).fill(0);
  for (let step = n; step > 1; step /= 2) {
    const half = step / 2;
    const amp = roughness * (step / n) ** 0.6;
    for (let i = half; i < n; i += step) {
      detail[i] = (detail[i - half] + detail[i + half]) / 2 + (rand() - 0.5) * amp;
    }
  }
  return detail.map((d, i) => {
    const x = (i / n) * W;
    const lift = peaks.reduce((sum, [px, h, spread]) => sum + h * Math.exp(-Math.abs(x - px) / spread), 0);
    return [x, base - lift + d];
  });
}

const toPath = (points: Point[]) =>
  `M0 ${H} L${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")} L${W} ${H}Z`;

function heightAt(points: Point[], x: number) {
  const step = W / (points.length - 1);
  const i = Math.min(points.length - 2, Math.max(0, Math.floor(x / step)));
  const t = (x - points[i][0]) / step;
  return points[i][1] * (1 - t) + points[i + 1][1] * t;
}

function pine(x: number, y: number, h: number) {
  const w = h * 0.22;
  const f = (v: number) => v.toFixed(1);
  return [
    `M${f(x)} ${f(y - h)}`,
    `L${f(x + w * 0.55)} ${f(y - h * 0.6)} L${f(x + w * 0.3)} ${f(y - h * 0.6)}`,
    `L${f(x + w * 0.8)} ${f(y - h * 0.28)} L${f(x + w * 0.45)} ${f(y - h * 0.28)}`,
    `L${f(x + w)} ${f(y + 4)} L${f(x - w)} ${f(y + 4)}`,
    `L${f(x - w * 0.45)} ${f(y - h * 0.28)} L${f(x - w * 0.8)} ${f(y - h * 0.28)}`,
    `L${f(x - w * 0.3)} ${f(y - h * 0.6)} L${f(x - w * 0.55)} ${f(y - h * 0.6)}Z`,
  ].join(" ");
}

const far = ridgeline(7, 620, [[230, 150, 170], [700, 90, 140], [1180, 170, 190], [1520, 100, 150]], 150);
const mid = ridgeline(21, 700, [[60, 220, 180], [520, 100, 150], [980, 60, 160], [1440, 220, 170]], 160);
const near = ridgeline(42, 790, [[0, 190, 240], [420, 50, 180], [1650, 240, 260], [1200, 60, 200]], 120);
const ground = ridgeline(77, 868, [[120, 60, 200], [1480, 90, 260]], 40);

const trees = (() => {
  const rand = seeded(1234);
  const paths: string[] = [];
  const plant = (from: number, to: number, tallAt: number) => {
    for (let x = from; x < to; x += 7 + rand() * 10) {
      const nearEdge = 1 - Math.min(1, Math.abs(x - tallAt) / 420);
      const h = 22 + rand() * 26 + nearEdge * 46;
      paths.push(pine(x, heightAt(ground, x), h));
    }
  };
  plant(-10, 280, 0);
  plant(1120, 1610, W);
  return paths.join(" ");
})();

const stars = (() => {
  const rand = seeded(99);
  return Array.from({ length: 170 }, (_, i) => ({
    x: rand() * W,
    y: rand() ** 1.6 * 560,
    r: 0.35 + rand() ** 3 * 1.2,
    o: 0.2 + rand() * 0.7,
    twinkle: i % 9 === 0 ? (rand() * 6).toFixed(2) : null,
  }));
})();

const CLOUDS: ReadonlyArray<readonly [cx: number, cy: number, rx: number, ry: number, opacity: number]> = [
  [300, 150, 420, 55, 0.4],
  [920, 220, 540, 70, 0.32],
  [1380, 120, 380, 50, 0.35],
  [560, 410, 700, 60, 0.28],
  [1260, 390, 620, 70, 0.32],
];

export function Landscape() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <svg
        className="absolute inset-0 size-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#03050d" />
            <stop offset="0.45" stopColor="#0a1230" />
            <stop offset="0.72" stopColor="#121d40" />
            <stop offset="1" stopColor="#15214a" />
          </linearGradient>
          <radialGradient id="horizon">
            <stop offset="0" stopColor="#3d5190" stopOpacity="0.32" />
            <stop offset="1" stopColor="#3d5190" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1a2649" />
            <stop offset="1" stopColor="#0d1530" />
          </linearGradient>
          <linearGradient id="mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#111934" />
            <stop offset="1" stopColor="#080e22" />
          </linearGradient>
          <linearGradient id="near" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a1027" />
            <stop offset="1" stopColor="#050916" />
          </linearGradient>
          <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8aa0e0" stopOpacity="0" />
            <stop offset="0.5" stopColor="#8aa0e0" stopOpacity="0.045" />
            <stop offset="1" stopColor="#8aa0e0" stopOpacity="0" />
          </linearGradient>
          <filter id="cloud-blur" x="-50%" y="-200%" width="200%" height="500%">
            <feGaussianBlur stdDeviation="34" />
          </filter>
          <filter id="haze">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
        </defs>

        <rect width={W} height={H} fill="url(#sky)" />
        <ellipse cx={1090} cy={600} rx={780} ry={230} fill="url(#horizon)" />

        <g>
          {stars.map((s, i) => (
            <circle
              key={i}
              cx={s.x.toFixed(1)}
              cy={s.y.toFixed(1)}
              r={s.r.toFixed(2)}
              fill="#dbe6ff"
              opacity={s.o.toFixed(2)}
              className={s.twinkle ? "twinkle" : undefined}
              style={s.twinkle ? { animationDelay: `${s.twinkle}s` } : undefined}
            />
          ))}
        </g>

        <g filter="url(#cloud-blur)" fill="#25345f">
          {CLOUDS.map(([cx, cy, rx, ry, opacity]) => (
            <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx={rx} ry={ry} opacity={opacity} />
          ))}
        </g>

        <path d={toPath(far)} fill="url(#far)" filter="url(#haze)" />
        <rect y={520} width={W} height={220} fill="url(#mist)" />
        <path d={toPath(mid)} fill="url(#mid)" />
        <rect y={640} width={W} height={180} fill="url(#mist)" />
        <path d={toPath(near)} fill="url(#near)" />
        <path d={toPath(ground)} fill="#04070f" />
        <path d={trees} fill="#04070f" />
      </svg>

      {/* Keep the edges and the title bar dark so the orb owns the light. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_42%,transparent_35%,rgb(3_5_12/0.78)_100%)]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-[#03050d]/80 to-transparent" />
    </div>
  );
}
