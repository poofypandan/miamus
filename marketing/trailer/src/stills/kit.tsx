/**
 * C1.5 pieces: the film's speech bubbles, Kakak's caption plate, sky titles, film labels and the press ring.
 * The visual language is trailer-reset 11 (one place in focus; the app speaks in a bubble from a phone).
 * Every size here is px on the 1080 × 1920 frame; nothing that carries words is under 38 px (see readability.tsx).
 */
import React from "react";
import { type Cam, project } from "../world/camera";
import { FONT, HAND, SERIF } from "../theme";

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
export function Bubble({ x, y, w, h, r = 48, to, fill = CREAM, edge = "rgba(120,80,50,0.16)", tailW = 54, children }: { x: number; y: number; w: number; h: number; r?: number; to?: { x: number; y: number }; fill?: string; edge?: string; tailW?: number; children?: React.ReactNode }) {
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
      <div style={{ ...abs(x, y, w, h), boxSizing: "border-box", borderRadius: r, overflow: "hidden" }}>{children}</div>
    </>
  );
}

/** Mama's words: Fraunces italic on cream paper. */
export function MamaSays({ lines, x = 120, y = 236, w = 798, size = 78, to }: { lines: React.ReactNode[]; x?: number; y?: number; w?: number; size?: number; to: { x: number; y: number } }) {
  const h = Math.round(lines.length * size * 1.16 + 100);
  return (
    <Bubble x={x} y={y} w={w} h={h} to={to}>
      <div style={{ padding: "50px 56px", font: `italic 500 ${size}px/1.16 ${SERIF}`, color: INK, letterSpacing: -0.6 }}>
        {lines.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </Bubble>
  );
}

/** Kakak's mark: the little house with a heart (her avatar in the app). */
export function KakakMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ flex: "none", display: "block" }}>
      <circle cx={50} cy={50} r={48} fill="#fbf1ee" stroke="#f1ddd7" strokeWidth={3} />
      <path d="M 24 47 L 50 26 L 76 47" stroke={KAKAK} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 32 54 L 32 76 M 68 54 L 68 76" stroke={KAKAK} strokeWidth={8} strokeLinecap="round" />
      <path d="M 50 72 C 38 63 40 50 50 57 C 60 50 62 63 50 72 Z" fill={KAKAK} />
    </svg>
  );
}

/** Kakak's spoken line: one warm near-black plate on the caption line, readable from its first frame. At most two lines. */
export function Caption({ text, tab, y = CLEAR.bottom, mark = true }: { text: React.ReactNode; tab?: string; y?: number; mark?: boolean }) {
  return (
    <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: y, transform: "translateY(-100%)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", maxWidth: "100%" }}>
        {tab && <div style={{ marginLeft: 30, marginBottom: -2, padding: "10px 24px 12px", borderRadius: "18px 18px 0 0", background: CREAM, color: INK, font: `600 38px/1 ${FONT}`, whiteSpace: "nowrap" }}>{tab}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 20, padding: mark ? "16px 34px 16px 18px" : "18px 34px", borderRadius: 34, background: "rgba(38,29,26,0.93)", color: CREAM, font: `600 50px/1.18 ${FONT}`, letterSpacing: -0.4, boxShadow: "0 12px 30px rgba(40,20,10,0.28)" }}>
          {mark && <KakakMark size={64} />}
          <div>{text}</div>
        </div>
      </div>
    </div>
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

/** A small name tag over a member of staff (a film label, not app UI). */
export function Tag({ x, y, name }: { x: number; y: number; name: string }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, transform: "translate(-50%, -100%)", display: "flex", alignItems: "center", gap: 12, padding: "12px 24px 12px 14px", borderRadius: 999, background: CREAM, boxShadow: "0 8px 18px rgba(70,35,20,0.22)", font: `600 40px/1 ${FONT}`, color: INK, whiteSpace: "nowrap" }}>
      <div style={{ width: 44, height: 44, borderRadius: 999, background: GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Check size={28} />
      </div>
      <span>{name}</span>
    </div>
  );
}

/** A press: one terracotta ring around the control that is tapped (11, section 4). */
export function PressRing({ x, y, w, h, r }: { x: number; y: number; w: number; h: number; r: number }) {
  return <div style={{ position: "absolute", left: x - 14, top: y - 14, width: w + 28, height: h + 28, borderRadius: r + 14, border: `7px solid ${KAKAK}`, opacity: 0.85, boxSizing: "border-box" }} />;
}

/** The task as a light: a small terracotta glow with a soft trail (a picture of the push, not UI). */
export function TaskLight({ x, y, from }: { x: number; y: number; from?: { x: number; y: number } }) {
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <radialGradient id="taskGlow">
          <stop offset="0%" stopColor="#fff1e4" stopOpacity={1} />
          <stop offset="30%" stopColor="#e88a6e" stopOpacity={0.9} />
          <stop offset="100%" stopColor={KAKAK} stopOpacity={0} />
        </radialGradient>
        <linearGradient id="taskTrail" x1={from?.x ?? x} y1={from?.y ?? y} x2={x} y2={y} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#e88a6e" stopOpacity={0} />
          <stop offset="1" stopColor="#f3b196" stopOpacity={0.75} />
        </linearGradient>
      </defs>
      {from && <path d={`M ${from.x} ${from.y} Q ${(from.x + x) / 2} ${Math.min(from.y, y) - 160} ${x} ${y}`} stroke="url(#taskTrail)" strokeWidth={9} fill="none" strokeLinecap="round" />}
      <circle cx={x} cy={y} r={62} fill="url(#taskGlow)" />
      <circle cx={x} cy={y} r={13} fill="#fff6ee" />
    </svg>
  );
}

/** A warm wash so the whole frame, cards included, sits in one light. */
export const Grade = ({ k = 1 }: { k?: number }) => (
  <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, rgba(255,214,170,${0.05 * k}) 0%, rgba(255,190,140,${0.03 * k}) 60%, rgba(90,50,30,${0.1 * k}) 100%)`, mixBlendMode: "multiply", pointerEvents: "none" }} />
);
