import React from "react";
import { type Cam, project } from "./camera";
import { type Light, css, mix, shade } from "./tod";

/**
 * The family, seen from behind, as small plain figures: a child with a kite,
 * her mother, two dogs. No faces and nobody real. Each is drawn from its feet
 * (0, 0), y going up as negative. `flat` draws the bare shape in whatever
 * fill it is given (a shadow on the grass, a rim of sunlight).
 */
interface FigureProps {
  light?: Light;
  frame: number;
  flat?: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Colours under the light, or none at all when drawn flat. */
function paint(light: Light | undefined, flat: boolean | undefined) {
  return (base: string, own = 0.3) => (flat || !light ? undefined : shade(base, light, 0.03, own));
}

/** v6: the girl's free arm and body. tug and point blend her free (left) arm from rest; lean is degrees away from Mama; hop is a bounce in px. */
export interface ChildPose {
  tug?: number;
  point?: number;
  lean?: number;
  hop?: number;
}

export function Child({ light, frame, flat, pose = {} }: FigureProps & { pose?: ChildPose }) {
  const c = paint(light, flat);
  const dress = c("#e2685e", 0.5);
  const hair = c("#2a1c18", 0);
  const skin = c("#d9a27c", 0.25);
  const shoe = c("#f6eedd", 0.3);
  // Up on her toes now and then; the string arm gives with the kite's pull.
  const toes = Math.max(0, Math.sin(frame * 0.14)) * 3;
  const pull = Math.sin(frame * 0.09) * 3;
  const limb = { strokeWidth: 8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  // Her free arm: a three-point stroke (shoulder, elbow, hand) between three positions.
  const tug = clamp01(pose.tug ?? 0);
  const point = clamp01(pose.point ?? 0);
  const at = (rest: number, toTug: number, toPoint: number) => lerp(lerp(rest, toTug, tug), toPoint, point);
  const elbow = { x: at(-27, -31, -13), y: at(-83, -92, -142) };
  const hand = { x: at(-29, -46, 2), y: at(-65, -80, -184) };
  return (
    <g transform={`translate(0 ${-toes - (pose.hop ?? 0)}) rotate(${pose.lean ?? 0})`}>
      <path d="M -10 -48 L -11 -6" stroke={skin} {...limb} strokeWidth={9} />
      <path d="M 10 -48 L 12 -6" stroke={skin} {...limb} strokeWidth={9} />
      <ellipse cx={-13} cy={-3} rx={9} ry={4.6} fill={shoe} />
      <ellipse cx={14} cy={-3} rx={9} ry={4.6} fill={shoe} />
      <path d="M -15 -106 C -8 -113 8 -113 15 -106 L 31 -44 Q 0 -35 -31 -44 Z" fill={dress} />
      <path d={`M -13 -101 L ${elbow.x} ${elbow.y} L ${hand.x} ${hand.y}`} stroke={skin} {...limb} />
      <path d={`M 13 -101 L ${30 + pull * 0.3} -125 L ${37 + pull} -152`} stroke={skin} {...limb} />
      <path d="M -5 -112 L 5 -112 L 5 -104 L -5 -104 Z" fill={skin} />
      <circle cx={0} cy={-128} r={19} fill={hair} />
      <path d="M -17 -126 C -31 -122 -33 -104 -25 -97 C -20 -104 -17 -115 -17 -126 Z" fill={hair} />
      <path d="M 17 -126 C 31 -122 33 -104 25 -97 C 20 -104 17 -115 17 -126 Z" fill={hair} />
    </g>
  );
}

/** v6: Mama's pose, when the scene sets it: shade (her eye-shading arm, 0–1), hold (her other hand takes the girl's), sway (degrees toward the girl), phone (its glow, 0–1; 0 is no phone). */
export interface MamaPose {
  shade?: number;
  hold?: number;
  sway?: number;
  phone?: number;
  /** C1.6: reading, 0–1: the phone held out in front of her shoulder, her head tipped to it (trailer-reset 20, fix 12). */
  read?: number;
}

export function Mama({ light, frame, flat, arrive = 1, pose }: FigureProps & { arrive?: number; pose?: MamaPose }) {
  const c = paint(light, flat);
  const dress = c("#f3e7d3", 0.4);
  const hair = c("#2a1c18", 0);
  const skin = c("#d9a27c", 0.25);
  const shoe = c("#b98b5e", 0.2);
  // She walks out, then stands: one hand finds the child's shoulder, the other shades her eyes.
  const walking = arrive < 0.97 ? 1 : 0;
  const step = Math.sin(frame * 0.5) * 8 * walking;
  const up = pose ? clamp01(pose.shade ?? 0) : clamp01((arrive - 0.82) / 0.18);
  const reach = pose ? 0 : clamp01((arrive - 0.7) / 0.3);
  const hold = clamp01(pose?.hold ?? 0);
  const limb = { strokeWidth: 10, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  const read = clamp01(pose?.read ?? 0);
  const elbowL = { x: lerp(lerp(-33, -47, up), -46, read), y: lerp(lerp(-170, -229, up), -162, read) };
  const handL = { x: lerp(lerp(-30, -21, up), -40, read), y: lerp(lerp(-134, -253, up), -204, read) };
  const handR = { x: lerp(lerp(34, 60, reach), 57, hold), y: lerp(lerp(-134, -146, reach), -73, hold) };
  const elbowR = { x: lerp(41, 47, hold), y: lerp(-172, -140, hold) };
  const glow = flat ? 0 : clamp01(pose?.phone ?? 0);
  return (
    <g transform={`translate(0 ${-Math.abs(step) * 0.25}) rotate(${pose?.sway ?? 0})`}>
      <path d={`M -11 -74 L ${-12 + step} -7`} stroke={skin} {...limb} strokeWidth={11} />
      <path d={`M 11 -74 L ${13 - step} -7`} stroke={skin} {...limb} strokeWidth={11} />
      <ellipse cx={-14 + step} cy={-4} rx={11} ry={5} fill={shoe} />
      <ellipse cx={15 - step} cy={-4} rx={11} ry={5} fill={shoe} />
      <path
        d="M -24 -212 C -10 -221 10 -221 24 -212 C 22 -190 18 -173 17 -160 L 45 -62 Q 0 -51 -45 -62 L -17 -160 C -18 -173 -22 -190 -24 -212 Z"
        fill={dress}
      />
      <path d={`M 22 -206 L ${elbowR.x} ${elbowR.y} L ${handR.x} ${handR.y}`} stroke={skin} {...limb} />
      <path d={`M -22 -206 L ${elbowL.x} ${elbowL.y} L ${handL.x} ${handL.y}`} stroke={skin} {...limb} />
      <path d="M -6 -222 L 6 -222 L 6 -210 L -6 -210 Z" fill={skin} />
      <g transform={read > 0 ? `rotate(${-9 * read} 0 -222)` : undefined}>
        <circle cx={0} cy={-241} r={22} fill={hair} />
        <circle cx={2} cy={-268} r={11.5} fill={hair} />
      </g>
      {(pose?.phone ?? 0) > 0 && (
        // The phone held up by her head: the only cool light in the frame.
        <g transform={`translate(${handL.x - 2} ${handL.y - 6}) rotate(-8)`}>
          {glow > 0 && <circle cx={0} cy={0} r={46} fill="url(#phoneGlow)" opacity={glow} />}
          <rect x={-8} y={-14} width={16} height={27} rx={4} fill={flat ? undefined : "#1d2129"} />
          {!flat && <rect x={-6} y={-12} width={12} height={23} rx={2.6} fill="#e8f1ff" opacity={0.55 + 0.45 * glow} />}
          {!flat && (
            <defs>
              <radialGradient id="phoneGlow">
                <stop offset="0%" stopColor="#dce9ff" stopOpacity={0.75} />
                <stop offset="45%" stopColor="#b9d0ff" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#9fbcff" stopOpacity={0} />
              </radialGradient>
            </defs>
          )}
        </g>
      )}
    </g>
  );
}

export function Dog({ light, frame, flat, kind, coat = "#e9c99c" }: FigureProps & { kind: "sit" | "run"; coat?: string }) {
  const c = paint(light, flat);
  const fur = c(coat, 0.35);
  const dark = c("#3a2a20", 0.1);
  const wag = Math.sin(frame * 0.55) * 16;
  if (kind === "sit") {
    // Sitting, nose up at the kite.
    const tilt = Math.sin(frame * 0.07) * 3;
    return (
      <g>
        <g transform={`rotate(${wag} -22 -8)`}>
          <path d="M -22 -8 C -40 -10 -47 -28 -39 -39" stroke={fur} strokeWidth={7} strokeLinecap="round" fill="none" />
        </g>
        <path d="M -27 0 C -35 -24 -25 -51 -4 -59 C 9 -63 21 -55 21 -36 L 21 0 Z" fill={fur} />
        <path d="M 14 -30 L 15 -3" stroke={fur} strokeWidth={9} strokeLinecap="round" fill="none" />
        <ellipse cx={18} cy={-3} rx={9} ry={4.4} fill={fur} />
        <g transform={`rotate(${tilt} 12 -56)`}>
          <path d="M 0 -52 C 3 -67 10 -73 18 -77 L 28 -60 C 21 -56 19 -50 19 -43 Z" fill={fur} />
          <circle cx={20} cy={-79} r={13.5} fill={fur} />
          <path d="M 25 -88 L 46 -96 C 51 -92 49 -83 43 -81 L 28 -72 Z" fill={fur} />
          <circle cx={46.5} cy={-93} r={3.4} fill={dark} />
          <path d="M 12 -88 C 1 -90 -5 -77 2 -66 C 9 -70 13 -79 12 -88 Z" fill={dark} />
        </g>
      </g>
    );
  }
  // Bounding toward the child.
  const stride = Math.sin(frame * 0.42);
  const hop = Math.abs(stride) * 9;
  const leg = { stroke: fur, strokeWidth: 7, strokeLinecap: "round" as const, fill: "none" };
  return (
    <g transform={`translate(0 ${-hop})`}>
      <g transform={`rotate(${wag * 0.8} 30 -42)`}>
        <path d="M 30 -42 C 44 -52 49 -62 45 -71" stroke={fur} strokeWidth={6} strokeLinecap="round" fill="none" />
      </g>
      <path d={`M -22 -28 L ${-36 - stride * 8} -7`} {...leg} />
      <path d={`M -14 -26 L ${-24 + stride * 8} -3`} {...leg} />
      <path d={`M 20 -28 L ${32 + stride * 9} -5`} {...leg} />
      <path d={`M 26 -30 L ${42 - stride * 7} -10`} {...leg} />
      <path d="M -31 -40 C -21 -53 21 -53 33 -40 C 37 -30 29 -23 16 -23 L -18 -23 C -29 -23 -35 -32 -31 -40 Z" fill={fur} />
      <circle cx={-37} cy={-50} r={12.5} fill={fur} />
      <path d="M -45 -55 L -61 -51 C -64 -46 -61 -41 -55 -41 L -42 -43 Z" fill={fur} />
      <circle cx={-61} cy={-48.5} r={3.2} fill={dark} />
      <path d="M -33 -61 C -24 -67 -17 -57 -24 -48 C -29 -52 -33 -56 -33 -61 Z" fill={dark} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* The kite                                                            */
/* ------------------------------------------------------------------ */

export interface KitePose {
  x: number;
  y: number;
  rot: number;
}

/** Where the kite hangs in the sky: it wanders with the wind, and climbs with `lift`. */
export function kitePose(frame: number, lift = 0): KitePose {
  return {
    x: 742 + Math.sin(frame * 0.045) * 34 + Math.sin(frame * 0.11 + 1.2) * 10 - lift * 40,
    y: 486 + Math.sin(frame * 0.06 + 1) * 20 + Math.cos(frame * 0.13) * 6 - lift * 250,
    rot: -15 + Math.sin(frame * 0.07) * 7 + Math.cos(frame * 0.13) * 3,
  };
}

/** The kite's depth: between the garden and the sky. */
export const KITE_DEPTH = 0.55;

export function Kite({
  light,
  frame,
  pose,
  cam,
  handAt,
  handDepth = 0.92,
}: {
  light: Light;
  frame: number;
  pose: KitePose;
  cam: Cam;
  /** The child's raised hand, in the garden layer. */
  handAt: { x: number; y: number };
  handDepth?: number;
}) {
  // The kite and the hand live at different depths, so the string is drawn on the frame itself.
  const k = project(cam, KITE_DEPTH, pose.x, pose.y);
  const h = project(cam, handDepth, handAt.x, handAt.y);
  const rad = (pose.rot * Math.PI) / 180;
  const s = k.s;
  // The kite's lower tip, where the string and the tail are tied.
  const tip = { x: k.x + -Math.sin(rad) * 58 * s, y: k.y + Math.cos(rad) * 58 * s };
  const knot = { x: k.x + -Math.sin(rad) * 6 * s, y: k.y + Math.cos(rad) * 6 * s };
  const dx = knot.x - h.x;
  const dy = knot.y - h.y;
  const len = Math.hypot(dx, dy);
  // The string sags a little, downwind.
  const mid = { x: h.x + dx * 0.5 + len * 0.05, y: h.y + dy * 0.5 + len * 0.085 };
  const red = shade("#d9534f", light, 0.1, 0.72);
  const pale = shade("#ef8478", light, 0.1, 0.72);
  const spar = shade("#8f2f2c", light, 0.1, 0.5);
  const line = css(mix(light.sun, [255, 255, 255], 0.65), 0.78);
  // The tail streams down and away, rippling.
  const tail: string[] = [];
  const bows: React.ReactNode[] = [];
  const L = 236 * s;
  const dir = ((104 + Math.sin(frame * 0.05) * 9) * Math.PI) / 180;
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const wave = Math.sin(t * 9.5 - frame * 0.26) * 15 * s * t;
    const px = tip.x + Math.cos(dir) * L * t - Math.sin(dir) * wave;
    const py = tip.y + Math.sin(dir) * L * t + Math.cos(dir) * wave;
    tail.push(`${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`);
    if (i === 8 || i === 15 || i === 22) {
      const a = Math.sin(t * 9.5 - frame * 0.26) * 30 + 20;
      bows.push(
        <path
          key={i}
          d={`M ${-11 * s} ${-6 * s} L 0 0 L ${-11 * s} ${6 * s} Z M ${11 * s} ${-6 * s} L 0 0 L ${11 * s} ${6 * s} Z`}
          transform={`translate(${px.toFixed(1)} ${py.toFixed(1)}) rotate(${a.toFixed(1)})`}
          fill={i === 15 ? pale : red}
        />
      );
    }
  }
  return (
    <g>
      <path d={`M ${h.x.toFixed(1)} ${h.y.toFixed(1)} Q ${mid.x.toFixed(1)} ${mid.y.toFixed(1)} ${knot.x.toFixed(1)} ${knot.y.toFixed(1)}`} stroke={line} strokeWidth={1.9} fill="none" strokeLinecap="round" />
      <path d={tail.join(" ")} stroke={red} strokeWidth={3.4 * s} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {bows}
      <g transform={`translate(${k.x.toFixed(1)} ${k.y.toFixed(1)}) rotate(${pose.rot.toFixed(2)}) scale(${s.toFixed(4)})`}>
        <path d="M 0 -64 L 42 -8 L 0 58 L -42 -8 Z" fill={red} />
        <path d="M 0 -64 L 42 -8 L 0 58 Z" fill={pale} />
        <path d="M 0 -64 L 0 58 M -42 -8 L 42 -8" stroke={spar} strokeWidth={2.2} fill="none" />
      </g>
    </g>
  );
}
