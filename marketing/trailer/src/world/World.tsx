import React from "react";
import { random } from "remotion";
import { type Cam, H, STILL, W, layer } from "./camera";
import { type Light, css, mix, shade, shadeRgb } from "./tod";
import { Child, Dog, Kite, Mama, kitePose } from "./Figures";

/**
 * The film's one place: a garden behind a house, hills and a volcano beyond,
 * a wide sky. Drawn here in code (no photographs, no stock, nobody's real
 * home), in flat layers lit by the hour (tod.ts) and moved by a camera with
 * parallax, so the same garden is the evening the film opens on and the
 * evening it ends on.
 */
/** Where the land meets the sky, on the untouched frame. */
export { W, H } from "./camera";
export const HORIZON = 1190;
/** The garden's ground line at the terrace. */
export const GROUND = 1300;

export interface WorldProps {
  light: Light;
  /** Drives wind, drift and twinkle. */
  frame: number;
  cam?: Cam;
  /** Who is in the garden, each 0–1. */
  child?: number;
  /** Mama: 0 not there, 1 beside the child. She walks in from the house. */
  mama?: number;
  dogs?: number;
  kite?: number;
  /** 0 the kite at its usual height, 1 soaring. */
  kiteLift?: number;
  birds?: number;
  /** Soften the whole world, for when it sits behind a phone. */
  blur?: number;
  /** Hide the house (the dawn sky alone). */
  house?: number;
  /** The day's work, seen from the garden: washing on the line, the sprinkler on. */
  laundry?: number;
  sprinkler?: number;
}

const R = (seed: string) => random(`miamus-${seed}`);

/* ------------------------------------------------------------------ */
/* Sky                                                                 */
/* ------------------------------------------------------------------ */

function Sky({ light, frame }: { light: Light; frame: number }) {
  const top = -2600;
  const span = HORIZON + 60 - top;
  const at = (y: number) => ((y - top) / span).toFixed(4);
  const deep = mix(light.skyTop, [8, 10, 30], 0.35);
  return (
    <>
      <defs>
        <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1={0} y1={top} x2={0} y2={HORIZON + 60}>
          <stop offset={0} stopColor={css(deep)} />
          <stop offset={at(-200)} stopColor={css(light.skyTop)} />
          <stop offset={at(HORIZON * light.midAt)} stopColor={css(light.skyMid)} />
          <stop offset={at(HORIZON - 30)} stopColor={css(light.skyLow)} />
          <stop offset={1} stopColor={css(mix(light.skyLow, light.sun, 0.35))} />
        </linearGradient>
        <radialGradient id="sunHalo" gradientUnits="userSpaceOnUse" cx={light.sunX} cy={light.sunY} r={980}>
          <stop offset={0} stopColor={css(light.sun, 0.62 * light.glow)} />
          <stop offset={0.22} stopColor={css(light.sun, 0.3 * light.glow)} />
          <stop offset={0.55} stopColor={css(light.sun, 0.1 * light.glow)} />
          <stop offset={1} stopColor={css(light.sun, 0)} />
        </radialGradient>
        <radialGradient id="sunCore" gradientUnits="userSpaceOnUse" cx={light.sunX} cy={light.sunY} r={210}>
          <stop offset={0} stopColor={css(mix(light.sun, [255, 255, 255], 0.75), 0.95 * Math.min(1, light.glow * 1.3))} />
          <stop offset={0.3} stopColor={css(mix(light.sun, [255, 255, 255], 0.35), 0.75 * light.glow)} />
          <stop offset={1} stopColor={css(light.sun, 0)} />
        </radialGradient>
        <filter id="soft" x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="16" />
        </filter>
        <filter id="softer" x="-30%" y="-80%" width="160%" height="260%">
          <feGaussianBlur stdDeviation="34" />
        </filter>
      </defs>
      <rect x={-1200} y={top} width={W + 2400} height={span + 400} fill="url(#sky)" />
      <rect x={-1200} y={top} width={W + 2400} height={span + 400} fill="url(#sunHalo)" />
      <Stars light={light} frame={frame} />
      {light.glow > 0.5 && light.sunY < HORIZON + 60 && (
        <g filter="url(#softer)" opacity={(light.glow - 0.5) * 2}>
          {[-152, -128, -104, -78, -52, -26].map((deg, i) => {
            const a0 = ((deg - 4.5) * Math.PI) / 180;
            const a1 = ((deg + 4.5) * Math.PI) / 180;
            const len = 1500;
            return (
              <path
                key={i}
                d={`M ${light.sunX} ${light.sunY} L ${light.sunX + Math.cos(a0) * len} ${light.sunY + Math.sin(a0) * len} L ${light.sunX + Math.cos(a1) * len} ${light.sunY + Math.sin(a1) * len} Z`}
                fill={css(light.sun, 0.075 + 0.02 * Math.sin(frame * 0.02 + i))}
              />
            );
          })}
        </g>
      )}
      <rect x={-1200} y={top} width={W + 2400} height={span + 400} fill="url(#sunCore)" />
      {light.sunY < HORIZON + 90 && (
        <circle cx={light.sunX} cy={light.sunY} r={54 + 22 * light.glow} fill={css(mix(light.sun, [255, 255, 255], 0.55))} opacity={Math.min(1, 0.55 + light.glow)} />
      )}
    </>
  );
}

function Stars({ light, frame }: { light: Light; frame: number }) {
  if (light.stars <= 0.01) return null;
  const stars = [];
  for (let i = 0; i < 130; i++) {
    const x = -200 + R(`sx${i}`) * (W + 400);
    const y = -1500 + R(`sy${i}`) * 2500;
    const r = 0.9 + R(`sr${i}`) * 1.9;
    const tw = 0.55 + 0.45 * Math.sin(frame * (0.05 + R(`sp${i}`) * 0.09) + R(`sq${i}`) * 6.28);
    // Fewer stars near the horizon's glow.
    const fade = Math.max(0, Math.min(1, (900 - y) / 500));
    stars.push(<circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity={light.stars * tw * fade * 0.9} />);
  }
  return <g>{stars}</g>;
}

const CLOUDS: { x: number; y: number; w: number; h: number; v: number; a: number }[] = [
  { x: 120, y: 1010, w: 620, h: 46, v: 0.1, a: 0.75 },
  { x: 700, y: 1070, w: 560, h: 38, v: 0.07, a: 0.7 },
  { x: -80, y: 900, w: 520, h: 54, v: 0.13, a: 0.6 },
  { x: 640, y: 820, w: 700, h: 64, v: 0.16, a: 0.55 },
  { x: 260, y: 640, w: 560, h: 70, v: 0.2, a: 0.42 },
  { x: 820, y: 470, w: 520, h: 78, v: 0.24, a: 0.34 },
  { x: 60, y: 300, w: 640, h: 90, v: 0.28, a: 0.26 },
];

function Clouds({ light, frame }: { light: Light; frame: number }) {
  return (
    <g filter="url(#soft)">
      {CLOUDS.map((c, i) => {
        const x = ((c.x + frame * c.v + 400) % (W + 900)) - 400;
        // Lit from below near the horizon, paler high up.
        const tone = mix(light.cloud, light.skyTop, Math.max(0, (900 - c.y) / 900) * 0.35);
        return (
          <g key={i} opacity={c.a}>
            <ellipse cx={x} cy={c.y} rx={c.w / 2} ry={c.h / 2} fill={css(tone)} />
            <ellipse cx={x + c.w * 0.18} cy={c.y - c.h * 0.32} rx={c.w * 0.3} ry={c.h * 0.42} fill={css(mix(tone, [255, 255, 255], 0.18))} />
            <ellipse cx={x - c.w * 0.22} cy={c.y + c.h * 0.2} rx={c.w * 0.34} ry={c.h * 0.34} fill={css(mix(tone, light.sun, 0.3))} />
          </g>
        );
      })}
    </g>
  );
}

function Birds({ light, frame, show }: { light: Light; frame: number; show: number }) {
  if (show <= 0) return null;
  const birds = [];
  for (let i = 0; i < 7; i++) {
    const row = Math.ceil(i / 2);
    const side = i % 2 === 0 ? 1 : -1;
    const x = 560 - frame * 0.8 + row * 46 + R(`bx${i}`) * 14;
    const y = 420 - frame * 0.14 + side * row * 22 + R(`by${i}`) * 10;
    const flap = Math.sin(frame * 0.36 + i * 1.3);
    const s = 0.8 + R(`bs${i}`) * 0.5;
    birds.push(
      <path
        key={i}
        d={`M ${-11 * s} ${3 * s * flap} Q ${-5 * s} ${-7 * s * flap - 2} 0 0 Q ${5 * s} ${-7 * s * flap - 2} ${11 * s} ${3 * s * flap}`}
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}
        stroke={shade("#3a3340", light, 0.4)}
        strokeWidth={2.4 * s}
        strokeLinecap="round"
        fill="none"
      />
    );
  }
  return <g opacity={show * 0.85}>{birds}</g>;
}

/* ------------------------------------------------------------------ */
/* Land                                                                */
/* ------------------------------------------------------------------ */

function Far({ light }: { light: Light }) {
  return (
    <g>
      <path d="M 430 1215 C 560 1150 700 1108 860 1118 C 990 1126 1120 1168 1320 1215 Z" fill={shade("#8aa0b4", light, 0.95)} />
      <rect x={-600} y={1206} width={W + 1200} height={2800} fill={shade("#7d90b8", light, 1)} />
      <path
        d="M -220 1215 C 20 1196 176 1066 282 902 C 296 880 314 870 332 870 C 350 870 366 882 380 904 C 476 1056 600 1176 860 1215 Z"
        fill={shade("#7d90b8", light, 1)}
      />
      {/* A lighter flank where the sun catches the cone. */}
      <path d="M 332 870 C 318 872 300 884 286 906 C 232 990 170 1080 96 1146 C 190 1100 268 1010 332 870 Z" fill={css(light.sun, 0.16 * light.glow)} />
    </g>
  );
}

function Ridge({ light }: { light: Light }) {
  return (
    <path
      d="M -200 1222 C 0 1176 140 1166 262 1186 C 360 1202 430 1178 524 1170 C 642 1160 724 1194 862 1184 C 968 1176 1060 1162 1500 1196 L 1500 4200 L -500 4200 L -500 1222 Z"
      fill={shade("#6f9478", light, 0.66)}
    />
  );
}

function TreeLine({ light }: { light: Light }) {
  const blobs = [];
  for (let i = 0; i < 34; i++) {
    const x = -160 + i * 42 + R(`tx${i}`) * 26;
    const r = 30 + R(`tr${i}`) * 30;
    const y = 1252 - R(`ty${i}`) * 26 - (x > 560 ? 12 : 0);
    blobs.push(<circle key={i} cx={x} cy={y} r={r} />);
  }
  return (
    <g fill={shade("#4b7a50", light, 0.4)}>
      {blobs}
      <rect x={-500} y={1250} width={W + 1000} height={2900} />
    </g>
  );
}

/** One palm: a leaning trunk and a crown of feathered fronds that move in the wind. */
function Palm({ x, y, h, lean, seed, light, frame, depth }: { x: number; y: number; h: number; lean: number; seed: string; light: Light; frame: number; depth: number }) {
  const cx = x + lean;
  const cy = y - h;
  const fill = shade("#2f5a3a", light, depth);
  const trunk = shade("#5d4a3a", light, depth);
  const fronds = [];
  const n = 13;
  for (let i = 0; i < n; i++) {
    const base = -208 + (236 * i) / (n - 1) + (R(`${seed}a${i}`) - 0.5) * 10;
    const sway = Math.sin(frame * 0.045 + i * 0.8 + R(`${seed}p`) * 6) * 2.2;
    const ang = ((base + sway) * Math.PI) / 180;
    const L = h * (0.4 + R(`${seed}l${i}`) * 0.1);
    // Fronds that reach sideways droop the most.
    const droop = 0.34 + Math.abs(Math.cos(ang)) * 0.62;
    const steps = 18;
    const spine: [number, number][] = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      spine.push([cx + Math.cos(ang) * L * t, cy + Math.sin(ang) * L * t + droop * t * t * L * 0.7]);
    }
    const leaf = (k: number, side: 1 | -1, len: number): [number, number] => {
      const t = k / steps;
      const a0 = spine[Math.max(0, k - 1)];
      const a1 = spine[Math.min(steps, k + 1)];
      let tx = a1[0] - a0[0];
      let ty = a1[1] - a0[1];
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      // Leaflets hang from the rib: outward, back a little, and down with their own weight.
      const l = len * (0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, t * 1.02)) ** 0.6);
      return [spine[k][0] + (-ty * side - tx * 0.25) * l, spine[k][1] + (tx * side - ty * 0.25) * l + l * 0.38];
    };
    const upper: string[] = [];
    const lower: string[] = [];
    for (let k = 0; k <= steps; k++) {
      const pt = spine[k];
      upper.push(`${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`);
      if (k < steps) {
        const tip = leaf(k, -1, h * 0.05);
        upper.push(`${tip[0].toFixed(1)} ${tip[1].toFixed(1)}`);
      }
    }
    for (let k = steps; k >= 0; k--) {
      const pt = spine[k];
      lower.push(`${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`);
      if (k > 0) {
        const tip = leaf(k, 1, h * 0.105);
        lower.push(`${tip[0].toFixed(1)} ${tip[1].toFixed(1)}`);
      }
    }
    fronds.push(<path key={i} d={`M ${upper.join(" L ")} L ${lower.join(" L ")} Z`} fill={fill} />);
  }
  const tw = h * 0.03;
  return (
    <g>
      <path
        d={`M ${x - tw * 1.25} ${y} Q ${x + lean * 0.2 - tw} ${y - h * 0.55} ${cx - tw * 0.5} ${cy} L ${cx + tw * 0.5} ${cy} Q ${x + lean * 0.2 + tw} ${y - h * 0.55} ${x + tw * 1.25} ${y} Z`}
        fill={trunk}
      />
      {fronds}
      <circle cx={cx - tw * 0.9} cy={cy + tw * 1.3} r={tw * 0.95} fill={trunk} />
      <circle cx={cx + tw * 0.9} cy={cy + tw * 1.5} r={tw * 0.95} fill={trunk} />
      <circle cx={cx} cy={cy + 2} r={tw * 1.3} fill={fill} />
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* The house                                                           */
/* ------------------------------------------------------------------ */

function Plant({ x, y, s, light }: { x: number; y: number; s: number; light: Light }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0,0 C-8,-52 -52,-76 -66,-108 C-34,-96 -10,-58 0,0 Z" fill={shade("#6f8f6a", light, 0.12)} />
      <path d="M0,0 C8,-58 44,-94 74,-112 C56,-76 20,-44 0,0 Z" fill={shade("#7f9e78", light, 0.12)} />
      <path d="M0,0 C-4,-62 6,-106 12,-142 C24,-98 16,-50 0,0 Z" fill={shade("#5f7f5b", light, 0.12)} />
      <path d="M-30,0 L30,0 L23,58 L-23,58 Z" fill={shade("#c8b8a6", light, 0.12)} />
    </g>
  );
}

function House({ light }: { light: Light }) {
  const wall = shade("#f5eddf", light, 0.12);
  const wallShade = shade("#dccfbc", light, 0.12);
  const roof = shade("#c8704b", light, 0.12);
  const roofDark = shade("#9c5236", light, 0.12);
  const wood = shade("#7a6351", light, 0.12);
  const deck = shade("#e9dfcd", light, 0.1);
  const frame = shade("#5c4d40", light, 0.12);
  // Glass by day; lamplight as the evening comes.
  const glass = css(mix(shadeRgb("#bcd4e2", light, 0.12, 0.3), [255, 208, 128], Math.min(1, light.windows * 1.05)));
  const lamp = light.windows;
  return (
    <g>
      <defs>
        <radialGradient id="lampGlow" gradientUnits="userSpaceOnUse" cx={734} cy={1210} r={420}>
          <stop offset={0} stopColor={`rgba(255,205,120,${(0.5 * lamp).toFixed(3)})`} />
          <stop offset={0.5} stopColor={`rgba(255,190,110,${(0.16 * lamp).toFixed(3)})`} />
          <stop offset={1} stopColor="rgba(255,190,110,0)" />
        </radialGradient>
        <linearGradient id="spill" gradientUnits="userSpaceOnUse" x1={0} y1={1300} x2={0} y2={1560}>
          <stop offset={0} stopColor={`rgba(255,206,128,${(0.42 * lamp).toFixed(3)})`} />
          <stop offset={1} stopColor="rgba(255,206,128,0)" />
        </linearGradient>
      </defs>
      {/* The main house: wall, shaded side, hip roof with a deep eave. */}
      <rect x={604} y={1036} width={560} height={266} fill={wall} />
      <rect x={604} y={1036} width={560} height={26} fill={wallShade} />
      <path d="M 560 1040 L 1220 1040 L 1100 902 L 706 902 Z" fill={roof} />
      <path d="M 560 1040 L 1220 1040 L 1214 1052 L 566 1052 Z" fill={roofDark} />
      <path d="M 706 902 L 1100 902 L 1094 910 L 712 910 Z" fill={css(mix(shadeRgb("#c8704b", light, 0.12), light.sun, 0.35 * light.glow))} />
      {/* Upper window. */}
      <rect x={884} y={1096} width={150} height={96} rx={4} fill={frame} />
      <rect x={890} y={1102} width={66} height={84} fill={glass} />
      <rect x={962} y={1102} width={66} height={84} fill={glass} />
      {/* The glass doors to the terrace. */}
      <rect x={640} y={1118} width={196} height={184} rx={4} fill={frame} />
      <rect x={647} y={1125} width={58} height={177} fill={glass} />
      <rect x={709} y={1125} width={58} height={177} fill={glass} />
      <rect x={771} y={1125} width={58} height={177} fill={glass} />
      {/* The pergola over the terrace. */}
      <rect x={428} y={1136} width={188} height={12} rx={3} fill={wood} />
      {[440, 474, 508, 542, 576].map((sx) => (
        <rect key={sx} x={sx} y={1126} width={8} height={12} fill={wood} />
      ))}
      <rect x={446} y={1146} width={9} height={156} fill={wood} />
      <rect x={586} y={1146} width={9} height={156} fill={wood} />
      {/* The terrace and its step. */}
      <rect x={410} y={1298} width={760} height={20} rx={3} fill={deck} />
      <rect x={410} y={1314} width={760} height={6} fill={shade("#c9bca6", light, 0.1)} />
      <rect x={486} y={1318} width={96} height={10} rx={2} fill={deck} />
      <Plant x={476} y={1240} s={0.62} light={light} />
      <Plant x={866} y={1246} s={0.5} light={light} />
      <Plant x={1048} y={1236} s={0.66} light={light} />
      {/* Lamplight: a glow at the doors and its spill across the grass. */}
      {lamp > 0.02 && (
        <>
          <rect x={300} y={860} width={900} height={760} fill="url(#lampGlow)" />
          <path d="M 640 1318 L 836 1318 L 980 1560 L 520 1560 Z" fill="url(#spill)" />
        </>
      )}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* The garden                                                          */
/* ------------------------------------------------------------------ */

function Lawn({ light }: { light: Light }) {
  const far = shadeRgb("#8eb565", light, 0.2, 0.4);
  const near = shadeRgb("#4f7a3c", light, 0, 0.3);
  return (
    <g>
      <defs>
        <linearGradient id="lawn" gradientUnits="userSpaceOnUse" x1={0} y1={GROUND - 20} x2={0} y2={1980}>
          <stop offset={0} stopColor={css(far)} />
          <stop offset={1} stopColor={css(near)} />
        </linearGradient>
        <radialGradient id="lawnSun" gradientUnits="userSpaceOnUse" cx={light.sunX} cy={GROUND + 10} r={900} gradientTransform={`translate(0 ${GROUND + 10}) scale(1 0.42) translate(0 ${-(GROUND + 10)})`}>
          <stop offset={0} stopColor={css(light.sun, 0.5 * light.glow)} />
          <stop offset={1} stopColor={css(light.sun, 0)} />
        </radialGradient>
      </defs>
      <path d="M -400 1296 C 0 1280 300 1286 620 1300 L 1500 1300 L 1500 2400 L -400 2400 Z" fill="url(#lawn)" />
      <path d="M -400 1296 C 0 1280 300 1286 620 1300 L 1500 1300 L 1500 2400 L -400 2400 Z" fill="url(#lawnSun)" />
      {/* Low sun through the trees: long bars of light across the grass. */}
      <g filter="url(#soft)">
      {light.glow > 0.4 &&
        [0, 1, 2, 3].map((i) => {
          const dir = light.sunX < 540 ? 1 : -1;
          const x0 = light.sunX + dir * (150 + i * 210);
          return (
            <path
              key={i}
              d={`M ${x0} ${GROUND} L ${x0 + dir * 70} ${GROUND} L ${x0 + dir * (560 + i * 120)} 2000 L ${x0 + dir * (300 + i * 110)} 2000 Z`}
              fill={css(light.sun, 0.1 * (light.glow - 0.4) * 1.66)}
            />
          );
        })}
      </g>
    </g>
  );
}

function Grass({ light, frame }: { light: Light; frame: number }) {
  const blades = [];
  const fill = shade("#2f5529", light, 0, 0);
  const tip = shade("#4f7f3c", light, 0, 0);
  for (let i = 0; i < 120; i++) {
    // Tufts: blades gather around a few roots, tall in the middle of each.
    const tuft = Math.floor(R(`gt${i}`) * 13);
    const root = -80 + (tuft / 12) * (W + 160) + (R(`gu${tuft}`) - 0.5) * 60;
    const off = (R(`gx${i}`) - 0.5) * 150;
    const x = root + off;
    const h = (46 + R(`gh${i}`) * 150) * (1 - Math.min(0.6, Math.abs(off) / 150));
    const lean = off * 0.32 + Math.sin(frame * 0.05 + R(`gp${i}`) * 6.28) * 9 + 4;
    const w = 4 + R(`gw${i}`) * 5;
    blades.push(
      <path key={i} d={`M ${(x - w).toFixed(1)} 1968 Q ${(x - w * 0.4 + lean * 0.3).toFixed(1)} ${(1968 - h * 0.62).toFixed(1)} ${(x + lean).toFixed(1)} ${(1968 - h).toFixed(1)} Q ${(x + w * 0.5 + lean * 0.42).toFixed(1)} ${(1968 - h * 0.55).toFixed(1)} ${(x + w).toFixed(1)} 1968 Z`} fill={i % 4 === 0 ? tip : fill} />
    );
  }
  return (
    <g filter="url(#grassBlur)">
      <defs>
        <filter id="grassBlur" x="-5%" y="-20%" width="110%" height="140%">
          <feGaussianBlur stdDeviation="1.8" />
        </filter>
      </defs>
      {blades}
    </g>
  );
}

/** Dust in the low sun, fireflies at dusk. */
function Motes({ light, frame }: { light: Light; frame: number }) {
  const k = Math.max(light.glow * 0.9, light.windows * 0.7);
  if (k <= 0.05) return null;
  const motes = [];
  for (let i = 0; i < 34; i++) {
    const sp = 0.25 + R(`mv${i}`) * 0.5;
    const x = ((R(`mx${i}`) * (W + 200) + frame * sp * 0.6) % (W + 200)) - 100;
    const y = 700 + ((R(`my${i}`) * 1100 - frame * sp * 0.45 + 2200) % 1100);
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(frame * (0.03 + R(`mt${i}`) * 0.05) + R(`mq${i}`) * 6.28));
    const r = 2 + R(`mr${i}`) * 4.5;
    motes.push(<circle key={i} cx={x} cy={y} r={r} fill={css(mix(light.sun, [255, 255, 255], 0.5))} opacity={k * tw * (0.16 + R(`mo${i}`) * 0.4)} />);
  }
  return <g>{motes}</g>;
}


/** Washing on the line, moving in the wind. */
function Laundry({ light, frame, show }: { light: Light; frame: number; show: number }) {
  if (show <= 0.01) return null;
  const post = shade("#6b5a4a", light, 0.2);
  const cloths = [
    { x: 232, w: 46, h: 62, c: "#fbf6ee" },
    { x: 286, w: 34, h: 48, c: "#e8a39c" },
    { x: 328, w: 52, h: 70, c: "#f4ecdf" },
    { x: 388, w: 30, h: 44, c: "#cfe0ea" },
  ];
  return (
    <g opacity={show}>
      <rect x={206} y={1196} width={6} height={104} fill={post} />
      <rect x={432} y={1196} width={6} height={104} fill={post} />
      <path d="M 209 1202 Q 322 1216 435 1202" stroke={post} strokeWidth={1.6} fill="none" />
      {cloths.map((c, i) => {
        const y = 1207 + Math.sin(((c.x - 209) / 226) * Math.PI) * 8;
        const sw = Math.sin(frame * 0.09 + i * 1.7) * 7;
        return (
          <path
            key={i}
            d={`M ${c.x} ${y} L ${c.x + c.w} ${y} Q ${c.x + c.w + sw * 0.6} ${y + c.h * 0.5} ${c.x + c.w + sw} ${y + c.h} Q ${c.x + c.w * 0.5 + sw} ${y + c.h + 4} ${c.x + sw} ${y + c.h} Q ${c.x + sw * 0.6} ${y + c.h * 0.5} ${c.x} ${y} Z`}
            fill={shade(c.c, light, 0.16, 0.3)}
          />
        );
      })}
    </g>
  );
}

/** The sprinkler: arcs of drops across the lawn. */
function Sprinkler({ light, frame, show }: { light: Light; frame: number; show: number }) {
  if (show <= 0.01) return null;
  const drops = [];
  const x0 = 250;
  const y0 = 1400;
  for (let i = 0; i < 46; i++) {
    const phase = (frame * 0.03 + R(`dr${i}`)) % 1;
    const side = i % 2 === 0 ? 1 : -1;
    const reach = 90 + R(`dw${i}`) * 110;
    const x = x0 + side * reach * phase;
    const y = y0 - Math.sin(phase * Math.PI) * (70 + R(`dh${i}`) * 40);
    drops.push(<circle key={i} cx={x} cy={y} r={1.6 + R(`ds${i}`) * 1.6} fill="#ffffff" opacity={0.75 * (1 - phase * 0.6)} />);
  }
  return (
    <g opacity={show}>
      <rect x={x0 - 3} y={y0 - 8} width={6} height={12} rx={2} fill={shade("#6b6f73", light, 0.05)} />
      {drops}
    </g>
  );
}

/* ------------------------------------------------------------------ */
/* The world                                                           */
/* ------------------------------------------------------------------ */

/** Where the child stands, and Mama beside her: shared with the scenes that point at them. */
export const CHILD_AT = { x: 372, y: 1452 };
export const MAMA_AT = { x: 286, y: 1458 };

export const World: React.FC<WorldProps> = ({ light, frame, cam = STILL, child = 0, mama = 0, dogs = 0, kite = 0, kiteLift = 0, birds = 0, blur = 0, house = 1, laundry = 0, sprinkler = 0 }) => {
  const pose = kitePose(frame, kiteLift);
  // Low sun: long shadows, away from it.
  const sunUp = light.sunY < HORIZON + 30 ? Math.min(1, light.glow * 1.2) : 0;
  const reach = Math.max(0.5, Math.min(3.0, 560 / (HORIZON - light.sunY + 90)));
  const shadow = { kx: (light.sunX < 540 ? 1 : -1) * reach, ky: 0.24, o: 0.26 * sunUp, fill: css(mix(light.sil, [20, 30, 20], 0.4)) };
  // The low sun also draws a thin bright edge on the side that faces it.
  const rim = { dx: light.sunX < 540 ? -1.9 : 1.9, o: sunUp, fill: css(mix(light.sun, [255, 255, 255], 0.2), 0.6 * sunUp) };
  // Mama comes out across the terrace and down to the child.
  const mamaX = MAMA_AT.x + (1 - mama) * 430;
  const mamaY = MAMA_AT.y - (1 - mama) * 146;
  const svg = (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
      <g transform={layer(cam, 0.1)}>
        <Sky light={light} frame={frame} />
      </g>
      <g transform={layer(cam, 0.16)}>
        <Clouds light={light} frame={frame} />
        <Birds light={light} frame={frame} show={birds} />
      </g>
      <g transform={layer(cam, 0.24)}>
        <Far light={light} />
      </g>
      <g transform={layer(cam, 0.34)}>
        <Ridge light={light} />
        {/* The haze that sits on the land at the day's ends. */}
        <rect x={-400} y={HORIZON - 150} width={W + 800} height={320} fill={css(light.haze, 0.34 * light.hazeK)} filter="url(#softer)" />
      </g>
      <g transform={layer(cam, 0.5)}>
        <TreeLine light={light} />
        <Palm x={-34} y={1300} h={330} lean={34} seed="p3" light={light} frame={frame} depth={0.46} />
        <Palm x={318} y={1296} h={372} lean={-34} seed="p2" light={light} frame={frame} depth={0.4} />
        <Palm x={84} y={1290} h={500} lean={52} seed="p1" light={light} frame={frame} depth={0.34} />
      </g>
      <g transform={layer(cam, 0.8)}>
        <Lawn light={light} />
        {house > 0 && (
          <g opacity={house}>
            <House light={light} />
          </g>
        )}
      </g>
      <g transform={layer(cam, 0.92)}>
        <Laundry light={light} frame={frame} show={laundry} />
        <Sprinkler light={light} frame={frame} show={sprinkler} />
        {/* Shadows first, then the family. */}
        {shadow.o > 0.01 && (
          <g opacity={shadow.o} fill={shadow.fill} stroke={shadow.fill} filter="url(#shadowBlur)">
            {child > 0 && (
              <g transform={`translate(${CHILD_AT.x} ${CHILD_AT.y}) matrix(1 0 ${-shadow.kx} ${-shadow.ky} 0 0)`} opacity={child}>
                <Child flat frame={frame} />
              </g>
            )}
            {mama > 0.02 && (
              <g transform={`translate(${mamaX} ${mamaY}) matrix(1 0 ${-shadow.kx} ${-shadow.ky} 0 0)`} opacity={mama}>
                <Mama flat frame={frame} arrive={mama} />
              </g>
            )}
            {dogs > 0 && (
              <>
                <g transform={`translate(214 1492) matrix(1 0 ${-shadow.kx} ${-shadow.ky} 0 0)`} opacity={dogs}>
                  <Dog kind="sit" flat frame={frame} />
                </g>
                <g transform={`translate(556 1516) matrix(1 0 ${-shadow.kx} ${-shadow.ky} 0 0)`} opacity={dogs}>
                  <Dog kind="run" flat frame={frame} />
                </g>
              </>
            )}
          </g>
        )}
        <defs>
          <filter id="shadowBlur" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>
        {dogs > 0 && (
          <g opacity={dogs}>
            <g transform="translate(214 1492)">
              {rim.o > 0.05 && (
                <g transform={`translate(${rim.dx} -1)`} fill={rim.fill} stroke={rim.fill}>
                  <Dog kind="sit" flat frame={frame} />
                </g>
              )}
              <Dog kind="sit" light={light} frame={frame} coat="#e9c99c" />
            </g>
            <circle cx={486} cy={1508} r={9.5} fill={shade("#f1e3cf", light, 0.03, 0.5)} />
            <g transform="translate(556 1516)">
              {rim.o > 0.05 && (
                <g transform={`translate(${rim.dx} -1)`} fill={rim.fill} stroke={rim.fill}>
                  <Dog kind="run" flat frame={frame} />
                </g>
              )}
              <Dog kind="run" light={light} frame={frame} coat="#8a5a3a" />
            </g>
          </g>
        )}
        {mama > 0.02 && (
          <g transform={`translate(${mamaX} ${mamaY})`} opacity={Math.min(1, mama * 14)}>
            {rim.o > 0.05 && (
              <g transform={`translate(${rim.dx} -1)`} fill={rim.fill} stroke={rim.fill}>
                <Mama flat frame={frame} arrive={mama} />
              </g>
            )}
            <Mama light={light} frame={frame} arrive={mama} />
          </g>
        )}
        {child > 0 && (
          <g transform={`translate(${CHILD_AT.x} ${CHILD_AT.y})`} opacity={child}>
            {rim.o > 0.05 && (
              <g transform={`translate(${rim.dx} -1)`} fill={rim.fill} stroke={rim.fill}>
                <Child flat frame={frame} />
              </g>
            )}
            <Child light={light} frame={frame} />
          </g>
        )}
      </g>
      {/* The kite flies between the garden and the sky: it moves less than the grass, more than the hills. */}
      {kite > 0 && (
        <g opacity={kite}>
          <Kite light={light} frame={frame} pose={pose} cam={cam} handAt={{ x: CHILD_AT.x + 37, y: CHILD_AT.y - 152 }} />
        </g>
      )}
      <g transform={layer(cam, 1.3)}>
        <Grass light={light} frame={frame} />
      </g>
      <g transform={layer(cam, 1.15)}>
        <Motes light={light} frame={frame} />
      </g>
    </svg>
  );
  if (blur <= 0) return svg;
  return <div style={{ position: "absolute", inset: 0, filter: `blur(${blur}px)`, transform: "scale(1.06)" }}>{svg}</div>;
};
