/**
 * Canvas engine for the landing forest: rows of treelings receding into fog
 * around a clearing (the agora). Each tree is one roster agent. Typing a task
 * raises the hands of agents whose listed skills match, and sparks fly from
 * them to the clearing, which is how a sealed bid reaches a task.
 *
 * Two canvases: `back` paints sky, ground and the far rows; `front` paints the
 * nearest rows over the DOM headline so the trees stand in front of the type.
 * Per-tree drawing is a cached sprite blitted with a sway rotation, so a
 * frame costs one drawImage per tree.
 */

import {
  ARM_STROKE,
  armAngle,
  buildTreeling,
  hashSeed,
  seededRandom,
  statureFromReputation,
  type Tone,
  type TreelingGeometry,
} from "./treeling";
import { mixRgb, readToken, rgbCss, type Rgb } from "./color";
import { agentTerms, queryTerms, termsOverlap } from "./match";

export interface ForestAgent {
  id: string;
  name: string;
  capabilities: string[];
  reputation: number;
}

export interface Clearing {
  /** Center and radii as fractions of the canvas size. */
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export interface ForestLayout {
  rows: number;
  frontRows: number;
  horizon: number;
  /** Tallest (nearest) tree height as a fraction of canvas height. */
  nearHeight: number;
  clearing: Clearing;
}

interface Tree {
  x: number;
  baseY: number;
  h: number;
  z: number;
  row: number;
  agent: ForestAgent | null;
  terms: string[];
  geometry: TreelingGeometry;
  phase: number;
  swayAmp: number;
  matched: boolean;
  lean: number;
  nextBlink: number;
  sprite: HTMLCanvasElement | null;
  spriteRaised: HTMLCanvasElement | null;
}

interface Spark {
  fromX: number;
  fromY: number;
  start: number;
  duration: number;
  z: number;
}

interface Mote {
  x: number;
  y: number;
  phase: number;
  speed: number;
  size: number;
}

type Palette = Record<Tone, string>;

const TONES: Tone[] = ["leaf-1", "leaf-2", "leaf-3", "leaf-4", "bark", "bark-shade", "birch", "eye"];
const VIEW_W = 112;
const VIEW_H = 160;
const FOOT_X = 56;
const FOOT_Y = 154;

export class ForestEngine {
  private trees: Tree[] = [];
  private sparks: Spark[] = [];
  private motes: Mote[] = [];
  private palettes: Palette[] = [];
  private colors = {
    skyTop: [0, 0, 0] as Rgb,
    skyLow: [0, 0, 0] as Rgb,
    fog: [0, 0, 0] as Rgb,
    ground: [0, 0, 0] as Rgb,
    glow: [0, 0, 0] as Rgb,
    leaf1: [0, 0, 0] as Rgb,
  };
  private night = false;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private pointer = { x: 0.5, y: 0.5, ex: 0.5, ey: 0.5 };
  private raf = 0;
  private running = false;
  private seedGlow = 0;
  private hasQuery = false;
  matchCount = 0;

  constructor(
    private back: HTMLCanvasElement,
    private front: HTMLCanvasElement,
    private agents: ForestAgent[],
    private layout: ForestLayout,
    private reducedMotion: boolean,
  ) {}

  resize(width: number, height: number, dpr: number, layout: ForestLayout) {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(dpr, 2);
    this.layout = layout;
    for (const canvas of [this.back, this.front]) {
      canvas.width = Math.round(width * this.dpr);
      canvas.height = Math.round(height * this.dpr);
    }
    this.readTheme();
    this.plant();
    this.scatterMotes();
    this.draw(performance.now());
  }

  readTheme() {
    this.colors = {
      skyTop: readToken("sky-top"),
      skyLow: readToken("sky-low"),
      fog: readToken("fog"),
      ground: readToken("ground"),
      glow: readToken("glow"),
      leaf1: readToken("leaf-1"),
    };
    this.night = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const base = Object.fromEntries(TONES.map((t) => [t, readToken(t)])) as Record<Tone, Rgb>;
    this.palettes = Array.from({ length: this.layout.rows }, (_, row) => {
      const fogT = this.fogFor(row / (this.layout.rows - 1));
      return Object.fromEntries(
        TONES.map((t) => [t, rgbCss(mixRgb(base[t], this.colors.fog, fogT))]),
      ) as Palette;
    });
    for (const tree of this.trees) {
      tree.sprite = null;
      tree.spriteRaised = null;
    }
  }

  setPointer(x: number, y: number) {
    this.pointer.x = x;
    this.pointer.y = y;
  }

  /** Returns how many agents list a skill matching the query. */
  setQuery(query: string): number {
    const terms = queryTerms(query);
    this.hasQuery = terms.length > 0;
    const now = performance.now();
    let count = 0;
    for (const tree of this.trees) {
      const matched = this.hasQuery && tree.agent !== null && termsOverlap(terms, tree.terms);
      if (matched) count++;
      if (matched && !tree.matched) this.launchSpark(tree, now);
      tree.matched = matched;
    }
    this.matchCount = count;
    if (this.reducedMotion) this.draw(now);
    return count;
  }

  start() {
    if (this.running || this.reducedMotion) return;
    this.running = true;
    const tick = (now: number) => {
      if (!this.running) return;
      this.draw(now);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Distinct agents planted in the forest (each tree is one agent). */
  get plantedAgents(): number {
    return this.trees.filter((t) => t.agent).length;
  }

  private fogFor(z: number) {
    return Math.pow(1 - z, 1.25) * 0.9;
  }

  private rowGeometry(row: number) {
    const { rows, horizon, nearHeight } = this.layout;
    const z = row / (rows - 1);
    const H = this.height;
    const h = H * (0.06 + (nearHeight - 0.06) * Math.pow(z, 1.9));
    const top = H * horizon;
    const baseY = top + (H * 1.02 - top) * Math.pow(z, 1.25) + h * 0.04;
    return { z, h, baseY };
  }

  private inClearing(x: number, y: number, h: number) {
    const { clearing } = this.layout;
    const dx = (x - clearing.x * this.width) / (clearing.rx * this.width + h * 0.25);
    const dy = (y - clearing.y * this.height) / (clearing.ry * this.height + h * 0.2);
    return dx * dx + dy * dy < 1;
  }

  private plant() {
    const rand = seededRandom(hashSeed(`forest-${this.width}`));
    const order = [...this.agents].sort((a, b) => hashSeed(a.id) - hashSeed(b.id));
    let next = 0;
    const trees: Tree[] = [];
    for (let row = 0; row < this.layout.rows; row++) {
      const { z, h, baseY } = this.rowGeometry(row);
      const spacing = h * 0.7 * (z > 0.8 ? 1.3 : 0.6 + z * 0.25);
      for (let x = -spacing * rand(); x < this.width + spacing; x += spacing * (0.75 + rand() * 0.5)) {
        const y = baseY + (rand() - 0.5) * h * 0.12 * (1 - z * 0.6);
        if (this.inClearing(x, y, h)) continue;
        const agent = order.length > 0 ? order[next++ % order.length] : null;
        trees.push(this.makeTree(x, y, h * (0.85 + rand() * 0.3), z, row, agent, rand));
      }
    }
    // Paint far-to-near; within a row, higher baselines first.
    this.trees = trees.sort((a, b) => a.row - b.row || a.baseY - b.baseY);
  }

  private makeTree(
    x: number,
    baseY: number,
    h: number,
    z: number,
    row: number,
    agent: ForestAgent | null,
    rand: () => number,
  ): Tree {
    const seed = agent?.id ?? `grove-${row}-${Math.round(x)}`;
    const geometry = buildTreeling({
      seed,
      capabilities: agent?.capabilities,
      name: agent?.name,
      stature: statureFromReputation(agent?.reputation),
    });
    return {
      x,
      baseY,
      h,
      z,
      row,
      agent,
      terms: agent ? agentTerms(agent.capabilities, agent.name) : [],
      geometry,
      phase: rand() * Math.PI * 2,
      swayAmp: (0.012 + rand() * 0.016) * (0.6 + z * 0.4),
      matched: false,
      lean: 0,
      nextBlink: rand() * 6000,
      sprite: null,
      spriteRaised: null,
    };
  }

  private scatterMotes() {
    const rand = seededRandom(7);
    const count = this.night ? 20 : 14;
    this.motes = Array.from({ length: count }, () => ({
      x: rand(),
      y: this.layout.horizon - 0.1 + rand() * 0.6,
      phase: rand() * Math.PI * 2,
      speed: 0.2 + rand() * 0.5,
      size: 0.6 + rand() * 1.1,
    }));
  }

  private sprite(tree: Tree, raised: boolean): HTMLCanvasElement {
    const cached = raised ? tree.spriteRaised : tree.sprite;
    if (cached) return cached;
    const scale = (tree.h / VIEW_H) * this.dpr;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(VIEW_W * scale);
    canvas.height = Math.ceil(VIEW_H * scale);
    const ctx = canvas.getContext("2d");
    if (ctx) paintTreeling(ctx, tree.geometry, this.palettes[tree.row], scale, raised);
    if (raised) tree.spriteRaised = canvas;
    else tree.sprite = canvas;
    return canvas;
  }

  private launchSpark(tree: Tree, now: number) {
    if (this.reducedMotion || tree.z < 0.25 || this.sparks.length > 90) return;
    const hand = this.handPoint(tree);
    this.sparks.push({
      fromX: hand.x,
      fromY: hand.y,
      start: now + Math.random() * 500,
      duration: 900 + Math.random() * 700,
      z: tree.z,
    });
  }

  /** World position of the raised right hand, where the lantern sits. */
  private handPoint(tree: Tree) {
    const scale = tree.h / VIEW_H;
    const arm = tree.geometry.arms[1];
    return {
      x: tree.x + (arm.shoulder.x + 8.5 - 50) * scale,
      y: tree.baseY + (arm.shoulder.y - 19 - FOOT_Y) * scale,
    };
  }

  private parallax(z: number) {
    return (0.5 - this.pointer.ex) * 26 * z;
  }

  draw(now: number) {
    this.pointer.ex += (this.pointer.x - this.pointer.ex) * 0.05;
    this.pointer.ey += (this.pointer.y - this.pointer.ey) * 0.05;
    this.seedGlow += ((this.hasQuery ? 1 : 0) - this.seedGlow) * 0.06;
    const back = this.back.getContext("2d");
    const front = this.front.getContext("2d");
    if (!back || !front) return;
    for (const ctx of [back, front]) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    this.paintSky(back);
    this.paintClearing(back, now);
    front.clearRect(0, 0, this.width, this.height);
    const firstFrontRow = this.layout.rows - this.layout.frontRows;
    for (const tree of this.trees) {
      this.paintTree(tree.row >= firstFrontRow ? front : back, tree, now);
    }
    this.paintSparks(back, now);
    this.paintMotes(front, now);
  }

  private paintSky(ctx: CanvasRenderingContext2D) {
    const { skyTop, skyLow, fog, ground } = this.colors;
    const horizonY = this.height * this.layout.horizon;
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, rgbCss(skyTop));
    sky.addColorStop(this.layout.horizon * 0.9, rgbCss(skyLow));
    sky.addColorStop(this.layout.horizon + 0.04, rgbCss(fog));
    sky.addColorStop(1, rgbCss(ground));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);
    this.paintHills(ctx, horizonY);
  }

  private paintHills(ctx: CanvasRenderingContext2D, horizonY: number) {
    const layers = [
      { amp: 26, freq: 0.0042, offset: -38, alpha: 0.14 },
      { amp: 18, freq: 0.0071, offset: -14, alpha: 0.22 },
    ];
    for (const layer of layers) {
      ctx.beginPath();
      ctx.moveTo(0, this.height);
      for (let x = 0; x <= this.width; x += 16) {
        const y = horizonY + layer.offset - Math.sin(x * layer.freq + layer.amp) * layer.amp - Math.sin(x * layer.freq * 2.3) * layer.amp * 0.4;
        ctx.lineTo(x + this.parallax(0.05), y);
      }
      ctx.lineTo(this.width, this.height);
      ctx.closePath();
      ctx.fillStyle = rgbCss(mixRgb(this.colors.leaf1, this.colors.fog, 0.55), layer.alpha);
      ctx.fill();
    }
  }

  private paintClearing(ctx: CanvasRenderingContext2D, now: number) {
    const { clearing } = this.layout;
    const cx = clearing.x * this.width + this.parallax(0.5);
    const cy = clearing.y * this.height;
    const rx = clearing.rx * this.width;
    const ry = clearing.ry * this.height;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, ry / rx);
    const floor = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 1.1);
    floor.addColorStop(0, rgbCss(mixRgb(this.colors.fog, this.colors.glow, 0.12 + this.seedGlow * 0.2), 0.95));
    floor.addColorStop(1, rgbCss(this.colors.fog, 0));
    ctx.fillStyle = floor;
    ctx.beginPath();
    ctx.arc(0, 0, rx * 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (this.seedGlow > 0.02) this.paintSeed(ctx, cx, cy, now);
  }

  /** The task itself: an ember seed resting on a stone in the clearing. */
  private paintSeed(ctx: CanvasRenderingContext2D, cx: number, cy: number, now: number) {
    const k = this.seedGlow;
    const pulse = 1 + Math.sin(now / 420) * 0.06;
    const pool = ctx.createRadialGradient(cx, cy, 0, cx, cy, 150 * k);
    pool.addColorStop(0, rgbCss(this.colors.glow, 0.28 * k));
    pool.addColorStop(1, rgbCss(this.colors.glow, 0));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.38);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(0, 0, 150 * k, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = rgbCss(mixRgb(this.colors.leaf1, this.colors.fog, 0.35), k);
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 22, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    const halo = ctx.createRadialGradient(cx, cy - 10, 0, cx, cy - 10, 46 * pulse);
    halo.addColorStop(0, rgbCss(this.colors.glow, 0.95 * k));
    halo.addColorStop(0.18, rgbCss(this.colors.glow, 0.5 * k));
    halo.addColorStop(1, rgbCss(this.colors.glow, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 46 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgbCss([255, 247, 232], k);
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  private paintTree(ctx: CanvasRenderingContext2D, tree: Tree, now: number) {
    const t = now / 1000;
    const sway = this.reducedMotion ? 0 : Math.sin(t * (0.55 + tree.swayAmp * 8) + tree.phase) * tree.swayAmp;
    const target = tree.matched ? this.leanTowardClearing(tree) : 0;
    tree.lean += (target - tree.lean) * (this.reducedMotion ? 1 : 0.08);
    const raised = tree.matched;
    const sprite = this.sprite(tree, raised);
    const scale = sprite.width / VIEW_W / this.dpr;
    ctx.save();
    ctx.translate(tree.x + this.parallax(tree.z), tree.baseY);
    ctx.rotate(sway + tree.lean);
    ctx.drawImage(sprite, -FOOT_X * scale, -FOOT_Y * scale, sprite.width / this.dpr, sprite.height / this.dpr);
    if (raised) this.paintLantern(ctx, scale, now, tree);
    if (tree.z > 0.45 && !this.reducedMotion) this.paintBlink(ctx, tree, scale, now);
    ctx.restore();
  }

  private leanTowardClearing(tree: Tree) {
    const dx = this.layout.clearing.x * this.width - tree.x;
    return Math.max(-0.09, Math.min(0.09, dx / this.width * 0.4));
  }

  private paintLantern(ctx: CanvasRenderingContext2D, scale: number, now: number, tree: Tree) {
    const arm = tree.geometry.arms[1];
    const x = (arm.shoulder.x + 8.5 - 50) * scale;
    const y = (arm.shoulder.y - 19 - FOOT_Y) * scale;
    const flicker = 1 + Math.sin(now / 160 + tree.phase) * 0.12;
    const r = 11 * scale * flicker;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
    glow.addColorStop(0, rgbCss(this.colors.glow, 1));
    glow.addColorStop(0.22, rgbCss(this.colors.glow, 0.55));
    glow.addColorStop(1, rgbCss(this.colors.glow, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  private paintBlink(ctx: CanvasRenderingContext2D, tree: Tree, scale: number, now: number) {
    if (now < tree.nextBlink) return;
    if (now > tree.nextBlink + 140) {
      tree.nextBlink = now + 2800 + ((hashSeed(`${tree.phase}${now}`) % 5000));
      return;
    }
    const lid = this.palettes[tree.row][tree.geometry.trunkTone];
    ctx.fillStyle = lid;
    for (const eye of tree.geometry.eyes) {
      ctx.beginPath();
      ctx.ellipse((eye.cx - 50) * scale, (eye.cy - FOOT_Y) * scale, (eye.rx + 0.6) * scale, (eye.ry + 0.6) * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private paintSparks(ctx: CanvasRenderingContext2D, now: number) {
    if (this.sparks.length === 0) return;
    const { clearing } = this.layout;
    const tx = clearing.x * this.width + this.parallax(0.5);
    const ty = clearing.y * this.height;
    this.sparks = this.sparks.filter((s) => now < s.start + s.duration);
    for (const spark of this.sparks) {
      const p = (now - spark.start) / spark.duration;
      if (p < 0) continue;
      const e = 1 - Math.pow(1 - p, 3);
      const x = spark.fromX + this.parallax(spark.z) + (tx - spark.fromX) * e;
      const y = spark.fromY + (ty - spark.fromY) * e - Math.sin(e * Math.PI) * 70;
      const r = 2.2 + spark.z * 2.4;
      ctx.fillStyle = rgbCss(this.colors.glow, 0.25 * (1 - p * 0.5));
      ctx.beginPath();
      ctx.arc(x, y, r * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbCss(this.colors.glow, 1 - p * 0.4);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private paintMotes(ctx: CanvasRenderingContext2D, now: number) {
    const t = now / 1000;
    const alphaBase = this.night ? 0.7 : 0.5;
    const color = this.night ? this.colors.glow : this.colors.skyLow;
    for (const mote of this.motes) {
      const drift = this.reducedMotion ? 0 : t * mote.speed;
      const x = ((mote.x + Math.sin(drift * 0.3 + mote.phase) * 0.02) % 1) * this.width + this.parallax(0.9);
      const y = (mote.y + Math.sin(drift * 0.7 + mote.phase) * 0.015) * this.height;
      const twinkle = this.night ? 0.45 + 0.55 * Math.max(0, Math.sin(drift * 1.6 + mote.phase)) : 1;
      const r = mote.size * (this.night ? 1.1 : 2);
      ctx.fillStyle = rgbCss(color, 0.18 * alphaBase * twinkle);
      ctx.beginPath();
      ctx.arc(x, y, r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgbCss(color, alphaBase * twinkle);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Draws one treeling's geometry into a sprite at the given scale. */
export function paintTreeling(
  ctx: CanvasRenderingContext2D,
  geometry: TreelingGeometry,
  palette: Palette,
  scale: number,
  raised: boolean,
) {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(6, 0);
  const fillShape = (d: string, tone: Tone, opacity = 1) => {
    ctx.globalAlpha = opacity;
    ctx.fillStyle = palette[tone];
    ctx.fill(new Path2D(d));
  };
  for (const shape of geometry.back) fillShape(shape.d, shape.tone, shape.opacity);
  for (const arm of geometry.arms) {
    ctx.save();
    ctx.translate(arm.shoulder.x, arm.shoulder.y);
    ctx.rotate((armAngle(arm, raised && arm.side === 1) * Math.PI) / 180);
    ctx.translate(-arm.shoulder.x, -arm.shoulder.y);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.bark;
    ctx.lineWidth = ARM_STROKE;
    ctx.lineCap = "round";
    ctx.stroke(new Path2D(arm.branch));
    fillShape(arm.tuft, "leaf-3");
    ctx.restore();
  }
  for (const shape of geometry.body) fillShape(shape.d, shape.tone, shape.opacity);
  if (geometry.hueShift) ctx.filter = `hue-rotate(${geometry.hueShift}deg)`;
  for (const shape of geometry.crown) fillShape(shape.d, shape.tone, shape.opacity);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.fillStyle = palette.eye;
  for (const eye of geometry.eyes) {
    ctx.beginPath();
    ctx.ellipse(eye.cx, eye.cy, eye.rx, eye.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (geometry.mouth) {
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = palette.eye;
    ctx.lineWidth = 1.2;
    ctx.stroke(new Path2D(geometry.mouth));
  }
  ctx.restore();
}
