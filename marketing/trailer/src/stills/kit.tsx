/**
 * C1.5 pieces: the film's speech bubbles, Kakak's caption plate, sky titles, film labels and the press ring.
 * The visual language is trailer-reset 11 (one place in focus; the app speaks in a bubble from a phone).
 * Every size here is px on the 1080 × 1920 frame; nothing that carries words is under 38 px (see readability.tsx).
 */
import React from "react";
import { type Cam, project } from "../world/camera";
import { FONT, HAND, SERIF } from "../theme";
import { ease, easeOut, ramp } from "../ui/kit";

export const W = 1080;
export const H = 1920;
export const INK = "#1f1a17";
export const MUTE = "#6f645b";
export const CREAM = "#fff6e8";
export const PAPER = "#fffdf8";
export const KAKAK = "#b65f55";
export const GREEN = "#1f8a55";
/** The band free of platform chrome. Words stay between x 64 and 918. */
export const CLEAR = { top: 192, bottom: 1440, left: 64, right: 918 };
export const CX = (CLEAR.left + CLEAR.right) / 2;
export { FONT, HAND, SERIF };

export const MAMA = { x: 286, y: 1458 };

/** A camera that puts a garden-layer point (depth 0.92) at a place on the frame, at zoom z. */
export function camFor(z: number, world: { x: number; y: number }, at: { x: number; y: number }): Cam {
  const s = 1 + (z - 1) * (0.25 + 0.75 * 0.92);
  return { z, x: (world.x - 540 - (at.x - 540) / s) / 0.92, y: (world.y - 960 - (at.y - 960) / s) / 0.92 };
}
/** Where a garden-layer point lands on the frame. */
export const P = (cam: Cam, x: number, y: number) => project(cam, 0.92, x, y);

const abs = (x: number, y: number, w?: number, h?: number): React.CSSProperties => ({ position: "absolute", left: x, top: y, width: w, height: h });

/** A bubble: a rounded shape with a soft tail to whoever (or whichever phone) is speaking. */
export function Bubble({ x, y, w, h, r = 48, to, fill = CREAM, edge = "rgba(120,80,50,0.16)", tailW = 54, label = "bubble", children }: { x: number; y: number; w: number; h: number; r?: number; to?: { x: number; y: number }; fill?: string; edge?: string; tailW?: number; label?: string; children?: React.ReactNode }) {
  r = Math.min(r, w / 2, h / 2);
  let tail: string | null = null;
  if (to) {
    const below = to.y > y + h;
    const above = to.y < y;
    if (below || above) {
      const yb = below ? y + h - 3 : y + 3;
      const bx = Math.max(x + r + tailW, Math.min(x + w - r - tailW, x + w / 2 + (to.x - (x + w / 2)) * 0.55));
      const my = yb + (to.y - yb) * 0.55;
      tail = `M ${bx - tailW / 2} ${yb} Q ${bx - tailW * 0.2} ${my} ${to.x} ${to.y} Q ${bx + tailW * 0.45} ${my} ${bx + tailW / 2} ${yb} Z`;
    } else {
      const left = to.x < x;
      const xb = left ? x + 3 : x + w - 3;
      const by = Math.max(y + r + tailW, Math.min(y + h - r - tailW, y + h / 2 + (to.y - (y + h / 2)) * 0.55));
      const mx = xb + (to.x - xb) * 0.55;
      tail = `M ${xb} ${by - tailW / 2} Q ${mx} ${by - tailW * 0.2} ${to.x} ${to.y} Q ${mx} ${by + tailW * 0.45} ${xb} ${by + tailW / 2} Z`;
    }
  }
  return (
    <>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0, filter: "drop-shadow(0 14px 26px rgba(70,35,20,0.24))" }}>
        {tail && <path d={tail} fill={fill} stroke={edge} strokeWidth={2} />}
        <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke={edge} strokeWidth={2} />
        {tail && <path d={tail} fill={fill} />}
      </svg>
      <div data-bubble={label} style={{ ...abs(x, y, w, h), boxSizing: "border-box", borderRadius: r, overflow: "hidden" }}>{children}</div>
    </>
  );
}

/**
 * Mama's type (owner, A4 notes, 20 Nov): upright, the film's sans at 600 like every other bubble and plate. The
 * italic serif was hard to read. One place to change.
 */
export const mamaFont = (size: number) => `600 ${size}px/1.16 ${FONT}`;
export const MAMA_TRACK = -0.6;

/** Mama's words: upright on cream paper. */
export function MamaSays({ lines, x = 120, y = 236, w = 798, size = 72, to }: { lines: React.ReactNode[]; x?: number; y?: number; w?: number; size?: number; to: { x: number; y: number } }) {
  const h = Math.round(lines.length * size * 1.16 + 100);
  return (
    <Bubble x={x} y={y} w={w} h={h} to={to} label="Mama's words">
      <div style={{ padding: "50px 56px", font: mamaFont(size), color: INK, letterSpacing: MAMA_TRACK }}>
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </Bubble>
  );
}

/** A soft heart in a box (trailer-reset 22, marks.mjs): x, y top-left, w wide, h tall. */
export function heartPath(x: number, y: number, w: number, h: number) {
  const p = (u: number, v: number) => `${(x + u * w).toFixed(1)} ${(y + v * h).toFixed(1)}`;
  return `M${p(0.5, 0.26)}C${p(0.44, 0.1)} ${p(0.34, 0)} ${p(0.23, 0)}C${p(0.09, 0)} ${p(0, 0.13)} ${p(0, 0.31)}C${p(0, 0.56)} ${p(0.24, 0.76)} ${p(0.43, 0.95)}Q${p(0.5, 1.02)} ${p(0.57, 0.95)}C${p(0.76, 0.76)} ${p(1, 0.56)} ${p(1, 0.31)}C${p(1, 0.13)} ${p(0.91, 0)} ${p(0.77, 0)}C${p(0.66, 0)} ${p(0.56, 0.1)} ${p(0.5, 0.26)}Z`;
}
export const KAKAK_TINT = "#fbf1ee";
export const KAKAK_LINE = "#f1ddd7";
/**
 * Kakak's mark in the film: treatment 1 "Tidy" (owner, 20 Nov; trailer-reset 21 and 22): the Miamus roof and a
 * fuller heart with a rounded tip, no walls, on the pale blush disc with its hairline. The roof never moves; the
 * heart is alive (`pulse`: 0 still, 1 = +6 %, her speaking beat).
 */
export function KakakMark({ size, pulse = 0, glow = 0 }: { size: number; pulse?: number; /** 0–1: her voice's loudness, a soft warm glow (v17). */ glow?: number }) {
  const k = 0.64;
  const g = size * k;
  const hs = 1 + 0.06 * pulse;
  return (
    <div style={{ width: size, height: size, flex: "none", borderRadius: "50%", background: KAKAK_TINT, border: `${Math.max(1, size * 0.025).toFixed(2)}px solid ${KAKAK_LINE}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: glow > 0.02 ? `0 0 ${(size * (0.25 + 0.5 * glow)).toFixed(1)}px ${(size * 0.06 * glow).toFixed(1)}px rgba(214,128,116,${(0.55 * glow).toFixed(3)})` : undefined }}>
      <svg width={g} height={g} viewBox="92 78 328 328" style={{ display: "block" }}>
        <polyline points="112,214 256,104 400,214" stroke={KAKAK} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d={heartPath(160, 204, 192, 176)} fill={KAKAK} transform={`translate(256 292) scale(${hs}) translate(-256 -292)`} />
      </svg>
    </div>
  );
}

/** A one-line plate's top edge: every plate hangs from here (A3, trailer-reset 23 fix 5), so a two-line plate grows down. */
export const PLATE_TOP = CLEAR.bottom - 96;
/**
 * Kakak's spoken line: one warm near-black plate on the caption line, readable from its first frame. At most two lines.
 * A3: the plate hangs from PLATE_TOP (its tab, if any, sits above that line), so it never rises into people's feet.
 */
export function Caption({ text, tab, tabSize = 38, y = PLATE_TOP, mark = true, pulse = 0, glow = 0, lit }: { text: React.ReactNode; tab?: string; tabSize?: number; y?: number; mark?: boolean; pulse?: number; glow?: number; /** A4 (v17's motion): with a string `text` ("\n" breaks a line), each word brightens as she says it. Seconds. */ lit?: Lit }) {
  return (
    <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: y, display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "100%" }}>
        {tab && <div style={{ position: "absolute", bottom: "100%", left: 30, marginBottom: -2, padding: "10px 24px 12px", borderRadius: "18px 18px 0 0", background: CREAM, color: INK, font: `600 ${tabSize}px/1 ${FONT}`, whiteSpace: "nowrap" }}>{tab}</div>}
        <div data-bubble="caption" style={{ display: "flex", alignItems: "center", gap: 20, padding: mark ? "16px 34px 16px 18px" : "18px 34px", borderRadius: 34, background: "rgba(38,29,26,0.93)", color: CREAM, font: `600 50px/1.18 ${FONT}`, letterSpacing: -0.4, boxShadow: "0 12px 30px rgba(40,20,10,0.28)" }}>
          {mark && <KakakMark size={64} pulse={pulse} glow={glow} />}
          <div>{typeof text === "string" ? <LitWords text={text} lit={lit} /> : text}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Words in motion (A4: v17's smoothness back)                         */
/* ------------------------------------------------------------------ */

/** A spoken line's clock in seconds: now, and the line's start and end. */
export type Lit = { t: number; from: number; to: number };

/** Each word's moment in a line, by its share of the letters (v17's BigLine and caption plates). */
export function wordTimes(rows: string[][], from: number, to: number): number[][] {
  const total = rows.flat().reduce((n, w) => n + w.length + 1, 0) || 1;
  let seen = 0;
  return rows.map((r) =>
    r.map((w) => {
      const at = from + ((to - from) * seen) / total;
      seen += w.length + 1;
      return at;
    })
  );
}

/** Kakak's words on her plate: readable from the first frame (0.62), each brightening as it is said, eased. */
export function LitWords({ text, lit }: { text: string; lit?: Lit }) {
  const rows = text.split("\n").map((l) => l.split(" "));
  const at = lit ? wordTimes(rows, lit.from, lit.to - (lit.to - lit.from) * 0.08) : null;
  return (
    <>
      {rows.map((r, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {r.map((w, j) => {
            const k = at && lit ? ramp(lit.t, at[i][j] - 0.1, at[i][j] + 0.14, ease) : 1;
            return (
              <React.Fragment key={j}>
                {j > 0 && " "}
                <span style={{ opacity: 0.62 + 0.38 * k }}>{w}</span>
              </React.Fragment>
            );
          })}
        </React.Fragment>
      ))}
    </>
  );
}

/**
 * Words that arrive one by one (v17's BigLine): each rises a little and eases in on its own moment, so a line
 * flows on instead of appearing as a block. `t` and `at` in seconds; `rise` in px.
 */
export function RiseWord({ w, t, at, rise = 26, dur = 0.37, gap = true, style }: { w: React.ReactNode; t: number; at: number; rise?: number; dur?: number; gap?: boolean; style?: React.CSSProperties }) {
  const k = ramp(t, at - 0.07, at + dur - 0.07, easeOut);
  return (
    <>
      <span style={{ display: "inline-block", opacity: k, transform: `translateY(${((1 - k) * rise).toFixed(2)}px)`, ...style }}>{w}</span>
      {gap ? " " : ""}
    </>
  );
}

/** Type set in the sky (L1, L2). */
export function SkyTitle({ children, y, size = 76, color = CREAM }: { children: React.ReactNode; y: number; size?: number; color?: string }) {
  return (
    <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: y, textAlign: "center", font: `600 ${size}px/1.14 ${FONT}`, letterSpacing: -1, color, textShadow: "0 2px 18px rgba(20,10,30,0.35)" }}>
      {children}
    </div>
  );
}

export const Check = ({ size, color = "#fff", stroke = 3 }: { size: number; color?: string; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

/**
 * A name label over a member of staff: the film's cream paper, not an app chip (trailer-reset 20, fix 8):
 * a small paper slip, slightly turned, a hand-drawn terracotta tick, the name at 40 px.
 */
export function Tag({ x, y, name, tilt = -2, tick = true }: { x: number; y: number; name: string; tilt?: number; tick?: boolean }) {
  return (
    <div data-bubble={`label: ${name}`} style={{ position: "absolute", left: x, top: y, transform: `translate(-50%, -100%) rotate(${tilt}deg)`, display: "flex", alignItems: "center", gap: 10, padding: "10px 20px 12px 16px", borderRadius: 10, background: CREAM, boxShadow: "0 6px 14px rgba(70,35,20,0.2)", font: `600 40px/1 ${FONT}`, color: INK, whiteSpace: "nowrap" }}>
      {tick && (
        <svg width={34} height={34} viewBox="0 0 24 24" fill="none" stroke={KAKAK} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 12.8c1.6 1.4 3 2.9 4.3 4.6C11.6 12.6 15 8.6 19.6 5.6" />
        </svg>
      )}
      <span>{name}</span>
    </div>
  );
}

/** An invisible box around a person's head and body, for the frame check (no bubble may overlap it). */
export function Person({ label, box }: { label: string; box: { l: number; t: number; r: number; b: number } }) {
  return <div data-person={label} style={{ position: "absolute", left: box.l, top: box.t, width: box.r - box.l, height: box.b - box.t, pointerEvents: "none" }} />;
}

/** A press: one terracotta ring around the control that is tapped (11, section 4). */
export function PressRing({ x, y, w, h, r }: { x: number; y: number; w: number; h: number; r: number }) {
  return <div style={{ position: "absolute", left: x - 14, top: y - 14, width: w + 28, height: h + 28, borderRadius: r + 14, border: `7px solid ${KAKAK}`, opacity: 0.85, boxSizing: "border-box" }} />;
}

/**
 * The task as a firefly (owner, 20 Nov; trailer-reset 20, fix 5): the same warm light as the fireflies of the
 * "once?" shot, small, with a soft trail of fading sparks behind it. A picture of the push, not UI.
 */
export function Firefly({ x, y, from, r = 22, id = "ff" }: { x: number; y: number; from?: { x: number; y: number }; r?: number; id?: string }) {
  const sparks: { x: number; y: number; k: number }[] = [];
  if (from) {
    const cx = (from.x + x) / 2;
    const cy = Math.min(from.y, y) - 140;
    for (let i = 1; i <= 9; i++) {
      const t = i / 10;
      const bx = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * cx + t * t * x;
      const by = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * cy + t * t * y;
      sparks.push({ x: bx + Math.sin(i * 2.1) * 6, y: by, k: t });
    }
  }
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <radialGradient id={id}>
          <stop offset="0%" stopColor="#fff4d0" stopOpacity={1} />
          <stop offset="35%" stopColor="#ffd890" stopOpacity={0.75} />
          <stop offset="100%" stopColor="#ffb860" stopOpacity={0} />
        </radialGradient>
        {from && (
          <linearGradient id={`${id}-trail`} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={x} y2={y}>
            <stop offset="0" stopColor="#ffd890" stopOpacity={0} />
            <stop offset="1" stopColor="#ffe6b0" stopOpacity={0.55} />
          </linearGradient>
        )}
      </defs>
      {from && <path d={`M ${from.x} ${from.y} Q ${(from.x + x) / 2} ${Math.min(from.y, y) - 140} ${x} ${y}`} stroke={`url(#${id}-trail)`} strokeWidth={4} fill="none" strokeLinecap="round" />}
      {sparks.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2 + p.k * 4} fill="#fff1cf" opacity={0.15 + p.k * 0.6} />
      ))}
      <circle cx={x} cy={y} r={r * 2.4} fill={`url(#${id})`} />
      <circle cx={x} cy={y} r={r * 0.32} fill="#fffaf0" />
    </svg>
  );
}

/** Low morning light: soft shafts slanting in from the sun's side (behind the house, frame right). */
export function Shafts({ from = "right", k = 1 }: { from?: "left" | "right"; k?: number }) {
  const flip = from === "left" ? `translate(${W} 0) scale(-1 1)` : undefined;
  const beams = [
    { x: 1180, w: 120, o: 0.16 },
    { x: 1010, w: 70, o: 0.12 },
    { x: 1330, w: 180, o: 0.1 },
    { x: 860, w: 50, o: 0.09 },
  ];
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0, mixBlendMode: "screen", pointerEvents: "none" }}>
      <defs>
        <linearGradient id="shaft" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffe3bc" stopOpacity={1} />
          <stop offset="0.7" stopColor="#ffd2a0" stopOpacity={0.35} />
          <stop offset="1" stopColor="#ffd2a0" stopOpacity={0} />
        </linearGradient>
        <filter id="shaftBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>
      <g transform={flip} filter="url(#shaftBlur)">
        {beams.map((b, i) => (
          <path key={i} d={`M ${b.x} -100 L ${b.x + b.w} -100 L ${b.x + b.w - 1100} 1900 L ${b.x - 1100 - b.w * 0.6} 1900 Z`} fill="url(#shaft)" opacity={b.o * k} />
        ))}
      </g>
    </svg>
  );
}

/** A warm wash so the whole frame, cards included, sits in one light. */
export const Grade = ({ k = 1 }: { k?: number }) => (
  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(255,214,170,${0.05 * k}) 0%, rgba(255,190,140,${0.03 * k}) 60%, rgba(90,50,30,${0.1 * k}) 100%)`, mixBlendMode: "multiply", pointerEvents: "none" }} />
);
