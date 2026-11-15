import React from "react";
import { spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { CAPTION_BOTTOM, CLEAR, FONT } from "../theme";
import { easeOut, ramp } from "./kit";
import { CSS_H, CSS_W, Geo } from "./phone";

/**
 * v11: one key element of the app, cut from its real capture (never redrawn), enlarged to read at arm's length, and
 * floated centred in the safe area over the softly blurred garden. Children are drawn in the capture's own CSS px
 * (the same space as the phone overlays: Glow, SpokenInput…), so the terracotta ring and live words line up.
 */
export type Region = { x: number; y: number; w: number; h: number };

// v11 (owner): cards centred in the area free of platform UI, between the tag line and Kakak's caption, about 88% of
// its width. The caption plate sits just above the bottom zone, under the card.
const CX = (CLEAR.left + CLEAR.right) / 2;
const ZONE_TOP = CLEAR.top + 76; // room for the tag
const ZONE_BOTTOM = CAPTION_BOTTOM - 150; // above a caption plate
const CY = (ZONE_TOP + ZONE_BOTTOM) / 2;
const WIDTH = Math.round(0.88 * (CLEAR.right - CLEAR.left));
const GAP = 34;

/** A second card that arrives under the first (e.g. "Saved" under Kakak's card): the first eases up to make room. */
export interface Below {
  src: string;
  region: Region;
  at: number;
  check?: number;
  children?: React.ReactNode;
}

export function CaptureCard({
  src,
  region,
  at,
  out,
  width = WIDTH,
  tag,
  press,
  check,
  fadeBottom = false,
  below,
  children,
}: {
  src: string;
  region: Region;
  at: number;
  out: number;
  width?: number;
  /** Who it is for ("You", "Sari"). */
  tag?: string;
  /** A press on the card: a slight dip and a soft ripple at this point (frame, CSS px of the capture). */
  press?: { at: number; x: number; y: number };
  /** A check settles on the card's corner at this frame. */
  check?: number;
  /** The cut runs through a box: soften the bottom edge. */
  fadeBottom?: boolean;
  below?: Below;
  children?: React.ReactNode;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at - 1 || frame > out + 14) return null;
  const k = width / region.w;
  const h = region.h * k;
  const land = spring({ frame: frame - at, fps, config: { damping: 17, stiffness: 120, mass: 0.8 } });
  const leave = ramp(frame, out, out + 12);
  const dip = press ? 1 - 0.018 * (0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(1, Math.max(0, (frame - press.at) / 12)))) : 1;
  const o = Math.min(1, land * 1.6) * (1 - leave);
  const left = CX - width / 2;
  const kb = below ? width / below.region.w : 0;
  const hb = below ? below.region.h * kb : 0;
  const arrive = below ? spring({ frame: frame - below.at, fps, config: { damping: 18, stiffness: 110, mass: 0.8 } }) : 0;
  // Centred alone; when the second card comes, the pair is centred together.
  const top = CY - h / 2 - arrive * (GAP + hb) / 2 + (1 - land) * 70 - leave * 26;
  const mask = fadeBottom ? "linear-gradient(to bottom, #000 0, #000 88%, transparent 100%)" : undefined;
  return (
    <div style={{ position: "absolute", left, top, width, height: h, opacity: o, transform: `scale(${(0.95 + 0.05 * land) * dip})`, transformOrigin: "50% 50%" }}>
      {tag && (
        <div style={{ position: "absolute", left: 6, top: -66, padding: "8px 22px 9px", borderRadius: 999, background: "rgba(255,252,247,0.9)", color: "#3a3330", fontFamily: FONT, fontSize: 30, fontWeight: 600, letterSpacing: 0.2, boxShadow: "0 6px 18px rgba(20,16,30,0.18)" }}>
          {tag}
        </div>
      )}
      <Sheet src={src} region={region} k={k} mask={mask}>
        {children}
      </Sheet>
      {below && frame >= below.at && (
        <div style={{ position: "absolute", left: 0, top: h + GAP + (1 - arrive) * 50, width, height: hb, opacity: Math.min(1, arrive * 1.6) }}>
          <Sheet src={below.src} region={below.region} k={kb}>
            {below.children}
          </Sheet>
          {below.check !== undefined && <Check at={below.check} x={width - 30} y={-10} />}
        </div>
      )}
      {press && <Ripple at={press.at} x={(press.x - region.x) * k} y={(press.y - region.y) * k} size={64 * k} />}
      {check !== undefined && <Check at={check} x={width - 30} y={-10} />}
    </div>
  );
}

/** The cut itself: the capture, clipped to the region, in a white rounded card. */
function Sheet({ src, region, k, mask, children }: { src: string; region: Region; k: number; mask?: string; children?: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, borderRadius: 30, overflow: "hidden", background: "#fff", boxShadow: "0 30px 70px rgba(16,12,30,0.32), 0 6px 18px rgba(16,12,30,0.18)", ...(mask ? { WebkitMaskImage: mask, maskImage: mask } : {}) }}>
      <div style={{ position: "absolute", left: -region.x * k, top: -region.y * k, width: CSS_W * k, height: CSS_H * k }}>
        <img src={staticFile(src)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
        <Geo.Provider value={{ k, inset: 0 }}>{children}</Geo.Provider>
      </div>
    </div>
  );
}

/** A press without a finger: a soft ring that opens and fades. */
export function Ripple({ at, x, y, size }: { at: number; x: number; y: number; size: number }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 20) return null;
  const s = 0.4 + 0.9 * easeOut(t / 20);
  return <div style={{ position: "absolute", left: x - (size * s) / 2, top: y - (size * s) / 2, width: size * s, height: size * s, borderRadius: "50%", border: "4px solid rgba(182,95,85,0.7)", opacity: ramp(frame, at, at + 3) * (1 - t / 20) }} />;
}

/** A check that settles onto a card's corner. */
export function Check({ at, x, y, size = 76 }: { at: number; x: number; y: number; size?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at) return null;
  const s = spring({ frame: frame - at, fps, config: { damping: 11, stiffness: 180, mass: 0.6 } });
  const draw = ramp(frame, at + 3, at + 13);
  return (
    <div style={{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, transform: `scale(${s})`, borderRadius: "50%", background: "#1f9d61", boxShadow: "0 8px 22px rgba(20,90,50,0.35)" }}>
      <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 12.5 L10.5 16.2 L17.8 8.4" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
      </svg>
    </div>
  );
}

/** Kakak listening: the app's halo, breathing (as the app animates it), around the Stop button, in CSS px. */
export function ListeningPulse({ x, y, from, until }: { x: number; y: number; from: number; until: number }) {
  const frame = useCurrentFrame();
  const { k } = React.useContext(Geo);
  if (frame < from || frame > until) return null;
  const o = ramp(frame, from, from + 6) * (1 - ramp(frame, until - 8, until));
  const ring = (delay: number, r: number, a: number) => {
    const p = ((frame - from) / 30 + delay) / 2.4;
    const s = 0.92 + 0.16 * (0.5 - 0.5 * Math.cos(p * 2 * Math.PI));
    return <div style={{ position: "absolute", left: (x - r * s) * k, top: (y - r * s) * k, width: 2 * r * s * k, height: 2 * r * s * k, borderRadius: "50%", background: `rgba(120,118,128,${a * o})` }} />;
  };
  return (
    <>
      {ring(0, 50, 0.16)}
      {ring(0.6, 43, 0.2)}
    </>
  );
}

/** A photo from Sari's task, popping onto her card (cut from her real photo screen), in CSS px. */
export function Thumb({ src, crop, x, y, size, at }: { src: string; crop: Region; x: number; y: number; size: number; at: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k } = React.useContext(Geo);
  if (frame < at) return null;
  const s = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 170, mass: 0.6 } });
  const z = (size / crop.w) * k;
  return (
    <div style={{ position: "absolute", left: x * k, top: y * k, width: size * k, height: (size * crop.h) / crop.w * k, borderRadius: 8 * k, overflow: "hidden", transform: `scale(${s})`, boxShadow: `0 ${4 * k}px ${10 * k}px rgba(20,16,30,0.25)`, border: `${1.5 * k}px solid #fff` }}>
      <img src={staticFile(src)} style={{ position: "absolute", left: -crop.x * z, top: -crop.y * z, width: CSS_W * z, height: CSS_H * z }} />
    </div>
  );
}
