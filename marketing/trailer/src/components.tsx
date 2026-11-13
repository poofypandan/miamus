import React from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, CX, FONT, SAFE } from "./theme";

/* ------------------------------------------------------------------ */
/* Geometry of the phone on the frame                                  */
/* ------------------------------------------------------------------ */

/** Captured screens are 390 × 844 CSS px (1170 × 2532 at 3×). */
export const CSS_W = 390;
export const CSS_H = 844;
/** On the frame the screen is drawn this wide; everything else follows. */
export const SCREEN_W = 452;
export const K = SCREEN_W / CSS_W; // video px per CSS px
export const IMG_H = Math.round(CSS_H * K);
/** Plain strips above and below the app (no status bar: none is faked). */
export const INSET_TOP = 26;
export const INSET_BOTTOM = 16;
export const SCREEN_H = IMG_H + INSET_TOP + INSET_BOTTOM;
export const BEZEL = 12;
export const PHONE_W = SCREEN_W + BEZEL * 2;
export const PHONE_H = SCREEN_H + BEZEL * 2;
export const PHONE_TOP = 236;
export const PHONE_LEFT = CX - PHONE_W / 2;
/** Where a CSS point of the app lands on the frame (phone at rest). */
export function onFrame(x: number, y: number) {
  return { x: PHONE_LEFT + BEZEL + x * K, y: PHONE_TOP + BEZEL + INSET_TOP + y * K };
}

export const ease = Easing.bezier(0.33, 0, 0.2, 1);

/** 0 → 1 between two frames, eased. */
export function ramp(frame: number, from: number, to: number) {
  return interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
}

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

/** A plain soft background; `evening` (0–1) dims it for the two notification shots. */
export function Backdrop({ evening = 0 }: { evening?: number }) {
  const mix = (a: string, b: string) => {
    const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
    const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * evening)).join(",")})`;
  };
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 80% at 46% 38%, ${mix("ffffff", "34373c")} 0%, ${mix("f4f2ee", "25272b")} 55%, ${mix("ebe7e0", "1c1e21")} 100%)`,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Screens                                                             */
/* ------------------------------------------------------------------ */

export interface Cue {
  /** Path under public/, e.g. "shots/id/today.png". */
  src: string;
  /** Frame (within the shot) it appears. */
  at: number;
  /** Crossfade length in frames; 0 cuts (typing frames). */
  fade?: number;
}

/** Plays a list of stills: each one from its frame on, crossfading over the one before. */
export function ScreenTrack({ cues }: { cues: Cue[] }) {
  const frame = useCurrentFrame();
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  let current = -1;
  sorted.forEach((c, i) => {
    if (c.at <= frame) current = i;
  });
  if (current < 0) current = 0;
  const cur = sorted[current];
  const prev = sorted[current - 1];
  const fade = cur.fade ?? 8;
  const t = fade > 0 ? ramp(frame, cur.at, cur.at + fade) : 1;
  const style: React.CSSProperties = { position: "absolute", left: 0, top: INSET_TOP, width: SCREEN_W, height: IMG_H };
  return (
    <>
      {prev && t < 1 && <Img src={staticFile(prev.src)} style={style} />}
      <Img src={staticFile(cur.src)} style={{ ...style, opacity: t }} />
      {/* Keep the next still loading before it is needed. */}
      {sorted[current + 1] && <Img src={staticFile(sorted[current + 1].src)} style={{ ...style, opacity: 0 }} />}
    </>
  );
}

export interface Camera {
  /** Zoom, 1 = at rest. */
  scale: number;
  /** The CSS point of the screen the zoom keeps in place. */
  fx: number;
  fy: number;
  /** Lifts the phone (video px, negative = up), so a zoomed detail sits mid-frame. */
  ty?: number;
}

/**
 * A plain phone outline (no notch, no maker's shape, no status bar): the
 * app's screen inside a rounded frame. `x` shifts it sideways for the
 * owner/staff hand-over; `dim` darkens the screen for the evening shots.
 */
export function Phone({
  children,
  x = 0,
  y = 0,
  opacity = 1,
  camera = { scale: 1, fx: CSS_W / 2, fy: CSS_H / 2 },
  bezel = C.ink,
  dim = 0,
  overlay,
}: {
  children: React.ReactNode;
  x?: number;
  y?: number;
  opacity?: number;
  camera?: Camera;
  bezel?: string;
  dim?: number;
  /** Drawn above the dimmed screen (notification cards, tap rings). */
  overlay?: React.ReactNode;
}) {
  const ox = BEZEL + camera.fx * K;
  const oy = BEZEL + INSET_TOP + camera.fy * K;
  return (
    <div
      style={{
        position: "absolute",
        left: PHONE_LEFT + x,
        top: PHONE_TOP + y,
        width: PHONE_W,
        height: PHONE_H,
        opacity,
        transform: `translateY(${camera.ty ?? 0}px) scale(${camera.scale})`,
        transformOrigin: `${ox}px ${oy}px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 64,
          background: bezel,
          boxShadow: "0 40px 80px rgba(23,23,23,0.16), 0 8px 24px rgba(23,23,23,0.10)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: BEZEL,
          top: BEZEL,
          width: SCREEN_W,
          height: SCREEN_H,
          borderRadius: 52,
          overflow: "hidden",
          background: C.paper,
        }}
      >
        {children}
        {dim > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(16,17,19,${dim})` }} />}
        {overlay}
      </div>
    </div>
  );
}

/** A soft circle where a tap lands (phones don't show touches; storyboard). */
export function TapRing({ x, y, at }: { x: number; y: number; at: number }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < -2 || t > 18) return null;
  const grow = interpolate(t, [-2, 4, 18], [0.55, 0.9, 1.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fade = interpolate(t, [-2, 2, 18], [0, 0.55, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d = 44 * K * grow;
  return (
    <div
      style={{
        position: "absolute",
        left: x * K - d / 2,
        top: INSET_TOP + y * K - d / 2,
        width: d,
        height: d,
        borderRadius: "50%",
        background: "rgba(23,23,23,0.18)",
        border: "2px solid rgba(255,255,255,0.9)",
        opacity: fade,
      }}
    />
  );
}

/** A brief white flash on the screen: the camera's shutter. */
export function Shutter({ at }: { at: number }) {
  const frame = useCurrentFrame();
  const o = interpolate(frame - at, [0, 2, 9], [0, 0.85, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (o <= 0) return null;
  return <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: o }} />;
}

/* ------------------------------------------------------------------ */
/* Captions                                                            */
/* ------------------------------------------------------------------ */

/**
 * The caption under the phone: dark text on a soft light panel with rounded
 * corners, the app's typeface at medium weight, no outline, no shadow.
 * Stays at least 1.5 s (storyboard). `label` is the AI disclosure line.
 */
export function Caption({
  text,
  say,
  label,
  from,
  to,
}: {
  text: string;
  say?: string;
  label?: string;
  from: number;
  to: number;
}) {
  const frame = useCurrentFrame();
  const inT = ramp(frame, from, from + 10);
  const outT = ramp(frame, to - 8, to);
  const o = inT * (1 - outT);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        width: SAFE.right - SAFE.left,
        top: PHONE_TOP + PHONE_H + 22,
        display: "flex",
        justifyContent: "center",
        opacity: o,
        transform: `translateY(${(1 - inT) * 14}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 820,
          padding: "20px 30px 22px",
          borderRadius: 28,
          background: "rgba(255,255,255,0.94)",
          fontFamily: FONT,
          textAlign: "center",
          color: C.ink,
        }}
      >
        <div style={{ fontSize: 42, fontWeight: 600, lineHeight: 1.18, letterSpacing: -0.4, textWrap: "balance" } as React.CSSProperties}>{text}</div>
        {label && (
          <div style={{ marginTop: 8, fontSize: 27, fontWeight: 500, color: C.inkSoft, lineHeight: 1.25 }}>{label}</div>
        )}
        {say && (
          <div style={{ marginTop: label ? 6 : 8, fontSize: 28, fontWeight: 400, color: C.inkMute, lineHeight: 1.3, textWrap: "balance" } as React.CSSProperties}>{say}</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The brand mark and the notification card                            */
/* ------------------------------------------------------------------ */

/** The Miamus mark (src/components/brand/brand-mark.tsx): the roofline and the M on an ink tile. */
export function BrandMark({ size, radius = 0.2237 }: { size: number; radius?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size * radius, background: C.ink, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
        <polyline points="112,214 256,104 400,214" stroke="#fff" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points="152,400 152,262 256,354 360,262 360,400" stroke="#fff" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/**
 * A notification, drawn plainly in the app's own style (white card, the
 * Miamus mark, the title and body as the app sends them). Deliberately not
 * a phone maker's lock screen or banner.
 */
export function NotificationCard({ title, body, time, at }: { title: string; body: string; time: string; at: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - at, fps, config: { damping: 18, stiffness: 120, mass: 0.8 } });
  if (frame < at) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 14,
        right: 14,
        top: INSET_TOP + 96,
        transform: `translateY(${(1 - s) * -60}px)`,
        opacity: Math.min(1, s * 1.4),
        background: "rgba(255,255,255,0.97)",
        borderRadius: 24,
        padding: "16px 18px 18px",
        fontFamily: FONT,
        boxShadow: "0 18px 40px rgba(0,0,0,0.28)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <BrandMark size={30} />
        <div style={{ fontSize: 17, fontWeight: 600, color: C.ink, flex: 1, letterSpacing: 0.2 }}>Miamus</div>
        <div style={{ fontSize: 15, color: C.inkMute }}>{time}</div>
      </div>
      <div style={{ marginTop: 10, fontSize: 20, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 19, color: C.inkSoft, lineHeight: 1.3 }}>{body}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Hook and end card                                                   */
/* ------------------------------------------------------------------ */

/** Three short questions arriving like messages: plain rounded bubbles, no chat app's look. */
export function HookBubbles({ lines, leaveAt, stagger = 14, first = 0 }: { lines: [string, string, string]; leaveAt: number; stagger?: number; first?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const leave = ramp(frame, leaveAt, leaveAt + 12);
  return (
    <div style={{ position: "absolute", left: SAFE.left + 40, width: SAFE.right - SAFE.left - 80, top: 640, opacity: 1 - leave, transform: `translateY(${-leave * 80}px)` }}>
      {lines.map((line, i) => {
        const s = spring({ frame: frame - first - i * stagger, fps, config: { damping: 16, stiffness: 160, mass: 0.7 } });
        return (
          <div key={line} style={{ display: "flex", justifyContent: i === 1 ? "flex-end" : "flex-start", marginBottom: 34 }}>
            <div
              style={{
                fontFamily: FONT,
                fontSize: 54,
                fontWeight: 500,
                color: C.ink,
                background: C.paper,
                border: `1.5px solid ${C.border}`,
                borderRadius: 40,
                padding: "26px 40px",
                transform: `translateY(${(1 - s) * 30}px) scale(${0.92 + s * 0.08})`,
                opacity: Math.min(1, s * 1.5),
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The end card: the mark, the name, the line, the address; the AI note in small print. */
export function EndCard({ line, small, from }: { line: string; small: string; from: number }) {
  const frame = useCurrentFrame();
  const a = ramp(frame, from, from + 16);
  const b = ramp(frame, from + 8, from + 26);
  const c = ramp(frame, from + 18, from + 36);
  return (
    <div style={{ position: "absolute", left: SAFE.left, width: SAFE.right - SAFE.left, top: SAFE.top, height: SAFE.bottom - SAFE.top, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: FONT, color: C.ink, textAlign: "center" }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 16}px)`, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <BrandMark size={150} />
        <div style={{ marginTop: 34, fontSize: 84, fontWeight: 700, letterSpacing: -1.5 }}>Miamus</div>
      </div>
      <div style={{ opacity: b, transform: `translateY(${(1 - b) * 12}px)`, marginTop: 28, fontSize: 46, fontWeight: 500, lineHeight: 1.25, maxWidth: 760, color: C.ink, textWrap: "balance" } as React.CSSProperties}>
        {/* Words joined by a hyphen ("benar-benar") never break across lines. */}
        {line.split(" ").map((word, i) => (
          <React.Fragment key={i}>
            {i > 0 && " "}
            <span style={{ whiteSpace: "nowrap" }}>{word}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ opacity: c, marginTop: 40, fontSize: 36, fontWeight: 500, color: C.inkSoft, letterSpacing: 0.5 }}>miamus.app</div>
      <div style={{ opacity: c, position: "absolute", bottom: 24, fontSize: 26, color: C.inkMute }}>{small}</div>
    </div>
  );
}
