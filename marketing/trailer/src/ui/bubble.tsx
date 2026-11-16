/**
 * v17: a comic speech bubble for the people in the garden (the girl, Mama): soft, rounded, warm cream with a soft
 * brown line and a tail that points to the speaker's head (it follows the camera: pass the head's point on screen).
 * Deliberately unlike the notification chips (white, square-ish, no tail, app type) and Kakak's dark caption plate.
 */
import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { H, W } from "../world/camera";
import { ramp, springAt } from "./kit";

export const BUBBLE = { fill: "#fff6e8", line: "rgba(120,72,44,0.55)", ink: "#3a2418" };

export function SpeechBubble({
  cx,
  cy,
  w,
  h,
  to,
  at,
  out,
  children,
  radius,
}: {
  /** The bubble's centre and size on screen (px). */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** The speaker's head on screen: the tail points there and stops short of it. */
  to: { x: number; y: number };
  at: number;
  out?: number;
  children: React.ReactNode;
  radius?: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at - 1) return null;
  const pop = springAt(frame, fps, at, { damping: 14, stiffness: 170, mass: 0.7 });
  const o = Math.min(1, pop * 1.8) * (out === undefined ? 1 : 1 - ramp(frame, out, out + 12));
  if (o <= 0) return null;
  // It rises a little as it appears, like a thought leaving the speaker.
  const y = cy + (1 - pop) * 46;
  const s = 0.82 + 0.18 * pop;
  const r = radius ?? Math.min(h / 2, 70);
  const left = cx - w / 2;
  const top = y - h / 2;
  // The tail: from two points on the edge nearest the speaker to a tip most of the way toward the head.
  const dx = to.x - cx;
  const dy = to.y - y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  // Where the line to the head leaves the rounded box (approximated by the ellipse inside it).
  const ex = cx + ux * (w / 2) * 0.86;
  const ey = y + uy * (h / 2) * 0.86;
  const reach = Math.max(0, Math.min(150, dist - Math.hypot(ex - cx, ey - y) - 34));
  const tip = { x: ex + ux * reach, y: ey + uy * reach };
  const half = Math.min(46, w * 0.12);
  const px = -uy;
  const py = ux;
  const a = { x: ex + px * half - ux * 30, y: ey + py * half - uy * 30 };
  const b = { x: ex - px * half * 0.45 - ux * 30, y: ey - py * half * 0.45 - uy * 30 };
  // A gently curved tail (a comic tail leans), drawn as two quadratic sides.
  const bend = { x: (a.x + tip.x) / 2 + px * 10, y: (a.y + tip.y) / 2 + py * 10 };
  const bend2 = { x: (b.x + tip.x) / 2 + px * 4, y: (b.y + tip.y) / 2 + py * 4 };
  const tail = `M ${a.x} ${a.y} Q ${bend.x} ${bend.y} ${tip.x} ${tip.y} Q ${bend2.x} ${bend2.y} ${b.x} ${b.y} Z`;
  const box = { x: left, y: top, width: w, height: h, rx: r };
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o, transform: `scale(${s})`, transformOrigin: `${cx}px ${y + h / 2}px` }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0, overflow: "visible", filter: "drop-shadow(0 10px 22px rgba(40,18,10,0.28))" }}>
        {/* The line under everything, then the cream over it, so tail and body read as one shape. */}
        <g stroke={BUBBLE.line} strokeWidth={7} strokeLinejoin="round" fill={BUBBLE.line}>
          <rect {...box} />
          <path d={tail} />
        </g>
        <g fill={BUBBLE.fill}>
          <rect {...box} />
          <path d={tail} />
        </g>
      </svg>
      <div style={{ position: "absolute", left, top, width: w, height: h, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: BUBBLE.ink }}>
        {children}
      </div>
    </div>
  );
}
