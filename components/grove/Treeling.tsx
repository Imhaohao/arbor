import type { CSSProperties } from "react";
import {
  ARM_STROKE,
  armAngle,
  buildTreeling,
  hashSeed,
  type Arm,
  type Shape,
  type Species,
  type Tone,
} from "@/lib/grove/treeling";
import { cn } from "@/lib/utils";

const paint = (tone: Tone) => `oklch(var(--${tone}))`;

export type TreelingPose = "rest" | "raised";

export interface TreelingProps {
  /** Stable agent id; the same seed always draws the same tree-person. */
  seed: string;
  capabilities?: readonly string[];
  name?: string;
  /** 0..1, usually statureFromReputation(agent.reputation_score). */
  stature?: number;
  species?: Species;
  pose?: TreelingPose;
  /** Asleep closes the eyes: used for agents that are offline or unready. */
  asleep?: boolean;
  /** Ember lantern in the raised hand: the winning bid, a live run. */
  lantern?: boolean;
  /** Idle sway and blink. Off for dense lists where motion is noise. */
  alive?: boolean;
  /** Rendered height in px of the tree itself; width follows its proportions. */
  size?: number;
  /** Fill the parent's width instead of a fixed size (for scaled stages). */
  fluid?: boolean;
  className?: string;
  /** Accessible name. Omit for decorative use beside a visible name. */
  label?: string;
}

/**
 * One agent drawn as a small tree-person. Pure SVG, no client state, so it
 * renders on the server and in long lists without hydration cost.
 */
export function Treeling({
  seed,
  capabilities,
  name,
  stature,
  species,
  pose = "rest",
  asleep = false,
  lantern = false,
  alive = true,
  size = 64,
  fluid = false,
  className,
  label,
}: TreelingProps) {
  const geometry = buildTreeling({ seed, capabilities, name, stature, species });
  const phase = hashSeed(seed) % 1000;
  const viewHeight = 160 - geometry.viewTop;
  const raisedArm = geometry.arms[1];

  return (
    <svg
      viewBox={`-6 ${geometry.viewTop} 112 ${viewHeight}`}
      {...svgSize(fluid, size, viewHeight)}
      className={cn("shrink-0 overflow-visible", fluid && "block h-auto w-full", className)}
      {...a11yProps(label)}
      focusable="false"
    >
      <g className={alive ? "treeling-sway" : undefined} style={swayStyle(alive, phase)}>
        <Shapes shapes={geometry.back} keyPrefix="b" />
        {geometry.arms.map((arm) => (
          <TreelingArm key={arm.side} arm={arm} raised={pose === "raised" && arm.side === 1} />
        ))}
        <Shapes shapes={geometry.body} keyPrefix="s" />
        <g style={geometry.hueShift ? { filter: `hue-rotate(${geometry.hueShift}deg)` } : undefined}>
          <Shapes shapes={geometry.crown} keyPrefix="c" />
        </g>
        <TreelingFace geometry={geometry} asleep={asleep} alive={alive} phase={phase} />
        {lantern && raisedArm && <Lantern x={raisedArm.shoulder.x} y={raisedArm.shoulder.y} />}
      </g>
    </svg>
  );
}

function svgSize(fluid: boolean, size: number, viewHeight: number) {
  if (fluid) return {};
  return { width: (size * 112) / viewHeight, height: size };
}

function a11yProps(label: string | undefined) {
  if (!label) return { "aria-hidden": true } as const;
  return { role: "img", "aria-label": label } as const;
}

function swayStyle(alive: boolean, phase: number): CSSProperties | undefined {
  if (!alive) return undefined;
  return {
    animationDelay: `-${(phase / 1000) * 5.2}s`,
    animationDuration: `${4.6 + (phase % 7) * 0.2}s`,
  };
}

function Shapes({ shapes, keyPrefix }: { shapes: Shape[]; keyPrefix: string }) {
  return (
    <>
      {shapes.map((shape, i) => (
        <path key={`${keyPrefix}${i}`} d={shape.d} fill={paint(shape.tone)} opacity={shape.opacity} />
      ))}
    </>
  );
}

function TreelingArm({ arm, raised }: { arm: Arm; raised: boolean }) {
  return (
    <g
      className="treeling-arm"
      style={{
        transformOrigin: `${arm.shoulder.x}px ${arm.shoulder.y}px`,
        transform: `rotate(${armAngle(arm, raised)}deg)`,
      }}
    >
      <path d={arm.branch} fill="none" stroke={paint("bark")} strokeWidth={ARM_STROKE} strokeLinecap="round" />
      <path d={arm.tuft} fill={paint("leaf-3")} />
    </g>
  );
}

function TreelingFace({
  geometry,
  asleep,
  alive,
  phase,
}: {
  geometry: ReturnType<typeof buildTreeling>;
  asleep: boolean;
  alive: boolean;
  phase: number;
}) {
  if (asleep) {
    return (
      <g fill="none" stroke={paint("eye")} strokeWidth={1.3} strokeLinecap="round" opacity={0.75}>
        {geometry.eyes.map((eye) => (
          <path
            key={eye.cx}
            d={`M${eye.cx - 2.2} ${eye.cy}q2.2 1.8 4.4 0`}
          />
        ))}
      </g>
    );
  }
  return (
    <>
      <g
        className={alive ? "treeling-blink" : undefined}
        style={alive ? { animationDelay: `-${(phase % 46) / 10}s` } : undefined}
        fill={paint("eye")}
      >
        {geometry.eyes.map((eye) => (
          <ellipse key={eye.cx} cx={eye.cx} cy={eye.cy} rx={eye.rx} ry={eye.ry} />
        ))}
      </g>
      {geometry.mouth && (
        <path
          d={geometry.mouth}
          fill="none"
          stroke={paint("eye")}
          strokeWidth={1.2}
          strokeLinecap="round"
          opacity={0.8}
        />
      )}
    </>
  );
}

/** Glow drawn as stacked translucent discs so it needs no per-instance defs. */
function Lantern({ x, y }: { x: number; y: number }) {
  // The raised right hand sits roughly up and out from the shoulder.
  const cx = x + 8.5;
  const cy = y - 19;
  return (
    <g aria-hidden="true">
      <circle cx={cx} cy={cy} r={13} fill="oklch(var(--glow) / 0.14)" />
      <circle cx={cx} cy={cy} r={7.5} fill="oklch(var(--glow) / 0.32)" />
      <circle cx={cx} cy={cy} r={3.6} fill="oklch(var(--glow))" />
    </g>
  );
}
