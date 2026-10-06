import { cn } from "@/lib/utils";

/*
 * Fine botanical line art in the spirit of the logo: a curving stem, alternating leaves and a
 * small bloom. Generated from a few control points so every variant shares one hand.
 * Every path carries `data-draw` + pathLength=1 so scenes can draw it on with a stroke-dash tween.
 */

type Pt = [number, number];
type Stem = { p: [Pt, Pt, Pt, Pt]; leaves: number; size: number; bloom?: number; flip?: boolean; from?: number };

const VARIANTS: Record<string, { viewBox: string; stems: Stem[] }> = {
  sprig: {
    viewBox: "0 0 140 230",
    stems: [
      { p: [[74, 226], [58, 160], [96, 96], [72, 16]], leaves: 7, size: 28, bloom: 11 },
      { p: [[70, 170], [44, 150], [30, 118], [34, 86]], leaves: 3, size: 17, flip: true, from: 0.25 },
    ],
  },
  branch: {
    viewBox: "0 0 640 280",
    stems: [
      { p: [[8, 236], [190, 118], [400, 276], [626, 58]], leaves: 15, size: 40, bloom: 18 },
      { p: [[262, 190], [296, 110], [352, 84], [430, 50]], leaves: 6, size: 24, flip: true, from: 0.2, bloom: 10 },
      { p: [[120, 170], [118, 120], [140, 86], [178, 64]], leaves: 4, size: 20, from: 0.25 },
    ],
  },
  arc: {
    viewBox: "0 0 420 420",
    stems: [
      { p: [[70, 396], [0, 220], [110, 40], [330, 36]], leaves: 13, size: 34, bloom: 16 },
      { p: [[40, 250], [90, 230], [120, 190], [124, 140]], leaves: 4, size: 20, flip: true, from: 0.2 },
    ],
  },
  wreath: {
    viewBox: "0 0 800 800",
    stems: [
      { p: [[400, 760], [80, 740], [20, 330], [250, 110]], leaves: 16, size: 46, bloom: 22 },
      { p: [[400, 760], [720, 740], [780, 330], [550, 110]], leaves: 16, size: 46, bloom: 22, flip: true },
      { p: [[150, 520], [110, 470], [110, 420], [140, 370]], leaves: 4, size: 26, from: 0.2 },
      { p: [[650, 520], [690, 470], [690, 420], [660, 370]], leaves: 4, size: 26, flip: true, from: 0.2 },
    ],
  },
};

export type BotanicalVariant = keyof typeof VARIANTS;

const r1 = (n: number) => Math.round(n * 10) / 10;

function point([a, b, c, d]: Stem["p"], t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0],
    u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1],
  ];
}

function angle([a, b, c, d]: Stem["p"], t: number) {
  const u = 1 - t;
  const dx = 3 * u * u * (b[0] - a[0]) + 6 * u * t * (c[0] - b[0]) + 3 * t * t * (d[0] - c[0]);
  const dy = 3 * u * u * (b[1] - a[1]) + 6 * u * t * (c[1] - b[1]) + 3 * t * t * (d[1] - c[1]);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/** A leaf pointing along +x from the origin. */
const leaf = (len: number, w: number) =>
  `M0 0C${r1(len * 0.28)} ${r1(-w)} ${r1(len * 0.74)} ${r1(-w * 0.85)} ${r1(len)} 0C${r1(len * 0.72)} ${r1(w * 0.7)} ${r1(len * 0.3)} ${r1(w * 0.9)} 0 0Z`;
const rib = (len: number) => `M${r1(len * 0.12)} 0L${r1(len * 0.78)} 0`;

function build(stems: Stem[]) {
  const paths: { d: string; transform?: string }[] = [];
  for (const s of stems) {
    const [a, b, c, d] = s.p;
    paths.push({ d: `M${a[0]} ${a[1]}C${b[0]} ${b[1]} ${c[0]} ${c[1]} ${d[0]} ${d[1]}` });
    const start = s.from ?? 0.12;
    for (let i = 0; i < s.leaves; i++) {
      const t = start + ((0.94 - start) * i) / Math.max(1, s.leaves - 1);
      const [x, y] = point(s.p, t);
      const side = (i % 2 === 0) !== !!s.flip ? 1 : -1;
      const len = s.size * (1 - 0.45 * t);
      const rot = angle(s.p, t) + side * (38 + 8 * Math.sin(i * 1.7));
      const transform = `translate(${r1(x)} ${r1(y)}) rotate(${r1(rot)})`;
      paths.push({ d: leaf(len, len * 0.34), transform });
      if (len > 22) paths.push({ d: rib(len), transform });
    }
    if (s.bloom) {
      const [x, y] = d;
      const base = angle(s.p, 1);
      for (let k = 0; k < 5; k++) {
        paths.push({ d: leaf(s.bloom, s.bloom * 0.5), transform: `translate(${x} ${y}) rotate(${r1(base + k * 72)})` });
      }
      paths.push({ d: `M${x - 2} ${y}a2 2 0 1 0 4 0a2 2 0 1 0 -4 0` });
    }
  }
  return paths;
}

export default function Botanical({
  variant = "sprig",
  className,
  strokeWidth = 1,
}: {
  variant?: BotanicalVariant;
  className?: string;
  strokeWidth?: number;
}) {
  const v = VARIANTS[variant];
  return (
    <svg
      viewBox={v.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={cn("block overflow-visible", className)}
    >
      {build(v.stems).map((p, i) => (
        <path key={i} d={p.d} transform={p.transform} pathLength={1} data-draw="" />
      ))}
    </svg>
  );
}
