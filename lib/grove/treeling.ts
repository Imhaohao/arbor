/**
 * Treeling: the procedural tree-person that stands in for one agent across
 * the whole site. Geometry is a pure function of the agent's id (shape
 * jitter), its capabilities (species) and its reputation (stature), so the
 * same agent always looks the same on the landing forest, its directory
 * card, and the bids on a task page.
 *
 * Output is renderer-neutral: every shape is an SVG path string plus a color
 * tone, which the SVG avatar maps to <path> and the canvas forest maps to
 * Path2D. Arms are emitted separately around a shoulder pivot so renderers
 * can pose them (resting, raised to bid).
 */

export type Species = "conifer" | "oak" | "birch" | "willow" | "acacia";

export type Tone =
  | "leaf-1"
  | "leaf-2"
  | "leaf-3"
  | "leaf-4"
  | "bark"
  | "bark-shade"
  | "birch"
  | "eye";

export interface Shape {
  d: string;
  tone: Tone;
  opacity?: number;
}

export interface Arm {
  /** Shoulder pivot the renderer rotates the arm around. */
  shoulder: { x: number; y: number };
  /** Branch stroke path, drawn pointing outward and slightly down. */
  branch: string;
  /** Leaf tuft at the hand. */
  tuft: string;
  /** -1 for the left arm, 1 for the right. */
  side: -1 | 1;
  /** Resting angle in degrees (positive droops the hand). */
  restAngle: number;
}

export interface Eye {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface TreelingGeometry {
  species: Species;
  /** Shapes painted behind the arms (willow strands). */
  back: Shape[];
  /** Trunk and feet, in paint order. */
  body: Shape[];
  /** Crown shapes, painted over the trunk. */
  crown: Shape[];
  /** Per-agent leaf hue shift in degrees, so a crowd is not one flat green. */
  hueShift: number;
  arms: Arm[];
  eyes: Eye[];
  mouth: string | null;
  /** Top of the drawing; renderers crop the view box here so size means tree height. */
  viewTop: number;
  /** Trunk color the blink lid paints with. */
  trunkTone: Tone;
}

export const TREELING_VIEWBOX = { width: 100, height: 160 } as const;
const FOOT_Y = 154;
const CX = 50;
const ARM_STROKE = 3.4;
export { ARM_STROKE };

/** Deterministic 32-bit hash of a string (cyrb53, truncated). */
export function hashSeed(seed: string): number {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return h1 >>> 0;
}

/** Small seeded PRNG (mulberry32) returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SPECIES_KEYWORDS: Array<[Species, RegExp]> = [
  ["conifer", /code|engineer|dev|github|git|security|infra|api|sql|database|deploy|debug|test|program|software|cloud|kubernetes/i],
  ["willow", /design|image|video|audio|music|media|creative|art|photo|voice|animation|figma|3d/i],
  ["birch", /research|data|analy|search|science|finance|math|stat|report|insight|web|scrape|knowledge/i],
  ["acacia", /sales|support|crm|payment|legal|schedul|calendar|ops|operation|commerce|email|travel|hr|recruit|productivity|slack|notion/i],
  ["oak", /writ|copy|content|marketing|seo|translat|blog|social|summar|edit|doc/i],
];

function matchSpecies(text: string): Species | null {
  for (const [species, pattern] of SPECIES_KEYWORDS) {
    if (pattern.test(text)) return species;
  }
  return null;
}

/**
 * Species follows what the agent does, so the forest reads by trade. The
 * name is checked first because it is the one signal every surface has
 * (bids carry ids, the directory carries capabilities), which keeps an agent
 * the same species wherever it appears.
 */
export function speciesFor(capabilities: readonly string[], name = ""): Species {
  return matchSpecies(name) ?? matchSpecies(capabilities.join(" ")) ?? "oak";
}

const f = (n: number) => Math.round(n * 100) / 100;

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)} ${f(cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0Z`;
}

function capsulePath(x: number, y: number, w: number, h: number): string {
  const r = w / 2;
  return `M${f(x)} ${f(y + r)}a${f(r)} ${f(r)} 0 0 1 ${f(w)} 0v${f(h - w)}a${f(r)} ${f(r)} 0 0 1 ${f(-w)} 0Z`;
}

interface Crown {
  shapes: Shape[];
  /** Highest y any crown shape reaches. */
  top: number;
}

interface Frame {
  rand: () => number;
  trunkTop: number;
  trunkWidth: number;
  crownScale: number;
}

function oakCrown({ rand, trunkTop, crownScale }: Frame): Crown {
  const R = 25 * crownScale;
  const base = trunkTop + 6;
  const j = () => (rand() - 0.5) * 5;
  const shapes: Shape[] = [
    { d: ellipsePath(CX - 15 + j(), base - R * 0.85, R * 0.72, R * 0.68), tone: "leaf-1" },
    { d: ellipsePath(CX + 15 + j(), base - R * 0.9, R * 0.7, R * 0.66), tone: "leaf-1" },
    { d: ellipsePath(CX + j(), base - R * 1.32, R * 0.84, R * 0.78), tone: "leaf-2" },
    { d: ellipsePath(CX - 10 + j(), base - R * 0.62, R * 0.62, R * 0.56), tone: "leaf-2" },
    { d: ellipsePath(CX + 11 + j(), base - R * 0.58, R * 0.6, R * 0.54), tone: "leaf-3" },
    { d: ellipsePath(CX - 7 + j(), base - R * 1.5, R * 0.34, R * 0.3), tone: "leaf-4", opacity: 0.85 },
  ];
  return { shapes, top: base - R * 2.1 - 2.5 };
}

function coniferCrown({ rand, trunkTop, crownScale }: Frame): Crown {
  const tiers = 3 + (rand() > 0.55 ? 1 : 0);
  const shapes: Shape[] = [];
  const tones: Tone[] = ["leaf-1", "leaf-2", "leaf-2", "leaf-3"];
  let yb = trunkTop + 8;
  let top = yb;
  for (let i = 0; i < tiers; i++) {
    const w = 56 * crownScale * (1 - i * (0.62 / tiers));
    const h = 27 * crownScale * (1 - i * 0.08);
    const lean = (rand() - 0.5) * 3;
    shapes.push({
      d: `M${f(CX - w / 2)} ${f(yb)}Q${f(CX - w * 0.16)} ${f(yb - h * 0.55)} ${f(CX + lean)} ${f(yb - h)}Q${f(CX + w * 0.16)} ${f(yb - h * 0.55)} ${f(CX + w / 2)} ${f(yb)}Q${f(CX)} ${f(yb + 5)} ${f(CX - w / 2)} ${f(yb)}Z`,
      tone: tones[i] ?? "leaf-3",
    });
    shapes.push({
      d: `M${f(CX + lean)} ${f(yb - h)}Q${f(CX + w * 0.16)} ${f(yb - h * 0.55)} ${f(CX + w / 2)} ${f(yb)}Q${f(CX + w * 0.2)} ${f(yb + 3)} ${f(CX + 2)} ${f(yb + 2)}Z`,
      tone: "leaf-1",
      opacity: 0.32,
    });
    top = Math.min(top, yb - h);
    yb -= h * 0.6;
  }
  return { shapes, top };
}

function birchCrown({ rand, trunkTop, crownScale }: Frame): Crown {
  const rx = 19 * crownScale;
  const ry = 33 * crownScale;
  const base = trunkTop + 8;
  const j = (rand() - 0.5) * 4;
  const shapes: Shape[] = [
    { d: ellipsePath(CX + j, base - ry * 0.95, rx, ry), tone: "leaf-2" },
    { d: ellipsePath(CX + 4 + j, base - ry * 0.8, rx * 0.7, ry * 0.72), tone: "leaf-3" },
    { d: ellipsePath(CX - 6 + j, base - ry * 1.45, rx * 0.36, ry * 0.3), tone: "leaf-4", opacity: 0.85 },
  ];
  return { shapes, top: base - ry * 1.95 };
}

function willowStrands({ rand, trunkTop, crownScale }: Frame): Shape[] {
  const R = 25 * crownScale;
  const base = trunkTop + 4;
  const strands: Shape[] = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const x = CX - R * 0.95 + t * R * 1.9;
    const len = 18 + rand() * 12 + Math.sin(t * Math.PI) * -6;
    strands.push({ d: capsulePath(x - 3.6, base - R * 0.55, 7.2, len + R * 0.4), tone: i % 2 ? "leaf-3" : "leaf-1" });
  }
  return strands;
}

function willowCrown({ trunkTop, crownScale }: Frame): Crown {
  const R = 25 * crownScale;
  const base = trunkTop + 4;
  const shapes: Shape[] = [
    { d: ellipsePath(CX, base - R * 0.75, R, R * 0.82), tone: "leaf-2" },
    { d: ellipsePath(CX - 7, base - R * 1.12, R * 0.4, R * 0.3), tone: "leaf-4", opacity: 0.8 },
  ];
  return { shapes, top: base - R * 1.57 };
}

function acaciaCrown({ rand, trunkTop, crownScale }: Frame): Crown {
  const base = trunkTop + 2;
  const j = (rand() - 0.5) * 6;
  const shapes: Shape[] = [
    { d: ellipsePath(CX + j * 0.5, base - 6, 38 * crownScale, 9 * crownScale), tone: "leaf-1" },
    { d: ellipsePath(CX + j, base - 13, 42 * crownScale, 12 * crownScale), tone: "leaf-2" },
    { d: ellipsePath(CX + j - 6, base - 20, 28 * crownScale, 9 * crownScale), tone: "leaf-3" },
    { d: ellipsePath(CX + j - 14, base - 23, 10 * crownScale, 4 * crownScale), tone: "leaf-4", opacity: 0.8 },
  ];
  return { shapes, top: base - 13 - 12 * crownScale };
}

const CROWNS: Record<Species, (frame: Frame) => Crown> = {
  oak: oakCrown,
  conifer: coniferCrown,
  birch: birchCrown,
  willow: willowCrown,
  acacia: acaciaCrown,
};

function trunkPath(top: number, wb: number, wt: number): string {
  const bottom = FOOT_Y - 4;
  const mid = (top + bottom) / 2;
  return `M${f(CX - wb / 2)} ${f(bottom)}Q${f(CX - wb / 2 - 1.5)} ${f(mid)} ${f(CX - wt / 2)} ${f(top)}L${f(CX + wt / 2)} ${f(top)}Q${f(CX + wb / 2 + 1.5)} ${f(mid)} ${f(CX + wb / 2)} ${f(bottom)}Q${f(CX)} ${f(bottom + 3)} ${f(CX - wb / 2)} ${f(bottom)}Z`;
}

function trunkShadePath(top: number, wb: number, wt: number): string {
  const bottom = FOOT_Y - 4;
  const mid = (top + bottom) / 2;
  return `M${f(CX + wt * 0.18)} ${f(top)}L${f(CX + wt / 2)} ${f(top)}Q${f(CX + wb / 2 + 1.5)} ${f(mid)} ${f(CX + wb / 2)} ${f(bottom)}Q${f(CX + wb * 0.3)} ${f(bottom + 2)} ${f(CX + wb * 0.22)} ${f(bottom + 1)}Q${f(CX + wb * 0.3)} ${f(mid)} ${f(CX + wt * 0.18)} ${f(top)}Z`;
}

function buildArm(side: -1 | 1, shoulderY: number, trunkWidth: number, rand: () => number): Arm {
  const sx = CX + side * (trunkWidth / 2 - 1.5);
  const len = 13 + rand() * 5;
  const tipX = sx + side * len;
  const tipY = shoulderY - 2;
  const branch = `M${f(sx)} ${f(shoulderY)}Q${f(sx + side * len * 0.5)} ${f(shoulderY + 2.5)} ${f(tipX)} ${f(tipY)}M${f(sx + side * len * 0.62)} ${f(shoulderY + 0.8)}l${f(side * 3.4)} -4.2`;
  return {
    shoulder: { x: sx, y: shoulderY },
    branch,
    tuft: ellipsePath(tipX + side * 1.5, tipY - 1.5, 4.4, 3.6),
    side,
    restAngle: 18 + rand() * 22,
  };
}

export interface TreelingInput {
  seed: string;
  capabilities?: readonly string[];
  name?: string;
  /** 0..1; reputation maps here so trusted agents stand taller. */
  stature?: number;
  species?: Species;
}

/** Mostly true green, with warmer and cooler outliers. */
const HUE_SHIFTS = [0, 0, 0, 0, -16, -9, 10, 18, 28];

function birchMarks(frame: Frame, trunkHeight: number): Shape[] {
  const { rand, trunkTop, trunkWidth } = frame;
  return [0, 1, 2].map((i) => ({
    d: capsulePath(
      CX - trunkWidth * 0.36 + rand() * trunkWidth * 0.3,
      trunkTop + 6 + i * (trunkHeight / 3.4) + rand() * 3,
      2.4,
      5.5 + rand() * 3,
    ),
    tone: "bark-shade" as const,
    opacity: 0.7,
  }));
}

function trunkBody(frame: Frame, trunkTopWidth: number, trunkTone: Tone): Shape[] {
  const { trunkTop, trunkWidth } = frame;
  const footSpread = trunkWidth * 0.3;
  return [
    { d: ellipsePath(CX - footSpread, FOOT_Y - 2.4, 5.4, 3), tone: "bark-shade" },
    { d: ellipsePath(CX + footSpread, FOOT_Y - 2.4, 5.4, 3), tone: "bark-shade" },
    { d: trunkPath(trunkTop, trunkWidth, trunkTopWidth), tone: trunkTone },
    {
      d: trunkShadePath(trunkTop, trunkWidth, trunkTopWidth),
      tone: "bark-shade",
      opacity: trunkTone === "birch" ? 0.35 : 0.55,
    },
  ];
}

function face(frame: Frame, trunkHeight: number): { eyes: Eye[]; mouth: string | null } {
  const { rand, trunkTop, trunkWidth } = frame;
  const eyeY = trunkTop + trunkHeight * 0.4 + rand() * 3;
  const eyeGap = trunkWidth * (0.19 + rand() * 0.06);
  const eyeRy = 2.5 + rand() * 0.5;
  const eyes: Eye[] = [
    { cx: CX - eyeGap, cy: eyeY, rx: 1.8, ry: eyeRy },
    { cx: CX + eyeGap, cy: eyeY, rx: 1.8, ry: eyeRy },
  ];
  const smiles = rand() > 0.45;
  const mouth = smiles
    ? `M${f(CX - 2.6)} ${f(eyeY + 5.6)}Q${f(CX)} ${f(eyeY + 7.6)} ${f(CX + 2.6)} ${f(eyeY + 5.6)}`
    : null;
  return { eyes, mouth };
}

export function buildTreeling(input: TreelingInput): TreelingGeometry {
  const rand = seededRandom(hashSeed(input.seed));
  const species = input.species ?? speciesFor(input.capabilities ?? [], input.name);
  const stature = Math.min(1, Math.max(0, input.stature ?? 0.5));
  const heightFactor = 0.84 + stature * 0.32;
  const acaciaLift = species === "acacia" ? 8 : 0;

  const trunkHeight = (30 + rand() * 9 + acaciaLift) * heightFactor;
  const trunkWidth = 21 + rand() * 6;
  const trunkTopWidth = trunkWidth * (0.74 + rand() * 0.1);
  const trunkTop = FOOT_Y - 4 - trunkHeight;
  const crownScale = (0.9 + rand() * 0.2) * (0.92 + stature * 0.14);
  const frame: Frame = { rand, trunkTop, trunkWidth, crownScale };

  const trunkTone: Tone = species === "birch" ? "birch" : "bark";
  const body = trunkBody(frame, trunkTopWidth, trunkTone);
  if (species === "birch") body.push(...birchMarks(frame, trunkHeight));
  const crown = CROWNS[species](frame);
  const hueShift = HUE_SHIFTS[Math.floor(rand() * HUE_SHIFTS.length)];

  const { eyes, mouth } = face(frame, trunkHeight);
  const shoulderY = trunkTop + trunkHeight * 0.66;
  const arms = [buildArm(-1, shoulderY, trunkWidth, rand), buildArm(1, shoulderY, trunkWidth, rand)];
  const back = species === "willow" ? willowStrands(frame) : [];
  // The view box starts at whichever is higher: the crown, or a raised hand
  // holding its lantern.
  const viewTop = Math.max(0, Math.min(crown.top, shoulderY - 36) - 3);

  return { species, back, body, crown: crown.shapes, hueShift, arms, eyes, mouth, viewTop, trunkTone };
}

/** Arm rotation in degrees for a pose. Raised arms lift the hand overhead. */
export function armAngle(arm: Arm, raised: boolean): number {
  if (!raised) return arm.restAngle * arm.side;
  return -62 * arm.side;
}

/** Reputation in Arbor is roughly 0..1 but earned scores can exceed it. */
export function statureFromReputation(reputation: number | undefined): number {
  if (reputation === undefined || Number.isNaN(reputation)) return 0.5;
  return Math.min(1, Math.max(0, (reputation - 0.3) / 0.6));
}
