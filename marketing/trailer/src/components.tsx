import React, { createContext, useContext } from "react";
import { AbsoluteFill, Easing, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, H, SAFE, W } from "./theme";

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** Captured screens are 390 × 844 CSS px (1170 × 2532 at 3×). */
export const CSS_W = 390;
export const CSS_H = 844;

/**
 * Full-bleed (owner, 14 Nov: "imagine viewing this on the phone"): the app's
 * screen fills the frame's width, so its text is as large as on a phone held
 * in the hand. 2.77 video px per CSS px; the screen is taller than the frame,
 * and the camera chooses which part shows.
 */
export const KB = W / CSS_W;
export const BLEED_H = Math.round(CSS_H * KB);

export const ease = Easing.bezier(0.33, 0, 0.2, 1);

/** 0 → 1 between two frames, eased. */
export function ramp(frame: number, from: number, to: number) {
  return interpolate(frame, [from, to], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
}

/** How the current screen is drawn: px per CSS px, and the plain strip above the app (framed phones only). */
const Geo = createContext({ k: KB, inset: 0 });

/* ------------------------------------------------------------------ */
/* Background                                                          */
/* ------------------------------------------------------------------ */

/** Warm white by day (seen around the hook, the two-phone moment and the end card). */
export function Backdrop({ evening = 0 }: { evening?: number }) {
  const mix = (a: string, b: string) => {
    const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
    const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
    return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * evening)).join(",")})`;
  };
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 80% at 46% 38%, ${mix("fffefb", "34373c")} 0%, ${mix("fbf8f3", "25272b")} 55%, ${mix("f5f1ea", "1c1e21")} 100%)`,
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
  const { k, inset } = useContext(Geo);
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
  const style: React.CSSProperties = { position: "absolute", left: 0, top: inset, width: CSS_W * k, height: CSS_H * k };
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
  /** Size: 1 = exactly the frame's width, never more (design lead, v3). Below 1 only where a shot needs room. */
  scale: number;
  /** The CSS row of the screen to look at, and where on the frame it lands (video px). */
  fy: number;
  y: number;
  /** The screen's left edge on the frame (only when it is smaller than the frame). */
  left?: number;
}

/** Where the screen fades out: the caption sits alone on the plain band below. */
export const FADE_FROM = 1180;
export const FADE_TO = 1300;

/**
 * The app's screen, full-bleed: exactly as wide as the frame (never wider),
 * panned to what matters, fading out above the caption's band at y 1300.
 * `x` slides it sideways (owner ↔ staff); `dim` darkens it for the night;
 * `fade` (0–1) is how much of the bottom fade applies.
 */
export function Screen({
  children,
  camera,
  x = 0,
  opacity = 1,
  dim = 0,
  fade = 1,
  overlay,
}: {
  children: React.ReactNode;
  camera: Camera;
  x?: number;
  opacity?: number;
  dim?: number;
  fade?: number;
  overlay?: React.ReactNode;
}) {
  const s = Math.min(1, camera.scale);
  const left = camera.left ?? (W - W * s) / 2;
  // A row y lands at ty + y·KB·s. The top edge stays at or above the
  // platforms' 220 px; the bottom edge at or below the fade.
  let ty = camera.y - camera.fy * KB * s;
  ty = Math.min(SAFE.top, Math.max(FADE_TO - BLEED_H * s, ty));
  const mask = fade > 0 ? `linear-gradient(to bottom, #000 0px, #000 ${FADE_FROM}px, rgba(0,0,0,${1 - fade}) ${FADE_TO}px)` : undefined;
  return (
    <AbsoluteFill style={{ opacity, transform: `translateX(${x}px)`, overflow: "hidden", ...(mask ? { WebkitMaskImage: mask, maskImage: mask } : {}) }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: W,
          height: BLEED_H,
          transform: `translate(${left}px, ${ty}px) scale(${s})`,
          transformOrigin: "0 0",
          background: C.paper,
        }}
      >
        <Geo.Provider value={{ k: KB, inset: 0 }}>
          {children}
          {dim > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(16,17,19,${dim})` }} />}
          {overlay}
        </Geo.Provider>
      </div>
    </AbsoluteFill>
  );
}

/** Where a CSS point of a full-bleed screen lands on the frame, for this camera. */
export function screenPoint(camera: Camera, x: number, y: number) {
  const s = Math.min(1, camera.scale);
  const left = camera.left ?? (W - W * s) / 2;
  let ty = camera.y - camera.fy * KB * s;
  ty = Math.min(SAFE.top, Math.max(FADE_TO - BLEED_H * s, ty));
  return { x: left + x * KB * s, y: ty + y * KB * s, s };
}

/**
 * A plain phone outline (no notch, no maker's shape, no status bar), used
 * only where a device helps: the owner's phone beside the staff phone.
 */
export function FramedPhone({
  children,
  left,
  top,
  screenW,
  bezel = C.ink,
  opacity = 1,
  overlay,
}: {
  children: React.ReactNode;
  left: number;
  top: number;
  screenW: number;
  bezel?: string;
  opacity?: number;
  overlay?: React.ReactNode;
}) {
  const k = screenW / CSS_W;
  const inset = Math.round(22 * k);
  const screenH = Math.round(CSS_H * k) + inset + Math.round(14 * k);
  const b = Math.round(10 * k);
  return (
    <div style={{ position: "absolute", left, top, width: screenW + 2 * b, height: screenH + 2 * b, opacity }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 55 * k, background: bezel, boxShadow: "0 40px 80px rgba(23,23,23,0.16), 0 8px 24px rgba(23,23,23,0.10)" }} />
      <div style={{ position: "absolute", left: b, top: b, width: screenW, height: screenH, borderRadius: 45 * k, overflow: "hidden", background: C.paper }}>
        <Geo.Provider value={{ k, inset }}>
          {children}
          {overlay}
        </Geo.Provider>
      </div>
    </div>
  );
}

/** A soft circle where a tap lands (phones don't show touches; storyboard). */
export function TapRing({ x, y, at }: { x: number; y: number; at: number }) {
  const frame = useCurrentFrame();
  const { k, inset } = useContext(Geo);
  const t = frame - at;
  if (t < -2 || t > 18) return null;
  const grow = interpolate(t, [-2, 4, 18], [0.55, 0.9, 1.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fade = interpolate(t, [-2, 2, 18], [0, 0.55, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d = 44 * k * grow;
  return (
    <div
      style={{
        position: "absolute",
        left: x * k - d / 2,
        top: inset + y * k - d / 2,
        width: d,
        height: d,
        borderRadius: "50%",
        background: "rgba(23,23,23,0.18)",
        border: `${Math.max(2, k)}px solid rgba(255,255,255,0.9)`,
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
 * The caption: one line, in the app's typeface, on the plain band below the
 * screen's fade (y 1300 to 1500), inside the area Reels, TikTok and Shorts
 * leave free: above the bottom 420 px, clear of the right 160 px. Never on
 * top of app text. `sub` only where it adds something.
 */
export function Caption({ text, sub, from, to }: { text: string; sub?: string; from: number; to: number }) {
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
        top: FADE_TO + 12,
        height: SAFE.bottom - FADE_TO - 12,
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        opacity: o,
        transform: `translateY(${(1 - inT) * 14}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 840,
          padding: "16px 32px 18px",
          borderRadius: 30,
          background: "rgba(23,23,23,0.9)",
          fontFamily: FONT,
          textAlign: "center",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: sub ? 40 : 44, fontWeight: 600, lineHeight: 1.15, letterSpacing: -0.4, textWrap: "balance" } as React.CSSProperties}>{text}</div>
        {sub && <div style={{ marginTop: 6, fontSize: 27, fontWeight: 500, color: "rgba(255,255,255,0.78)", lineHeight: 1.25 }}>{sub}</div>}
      </div>
    </div>
  );
}

/**
 * The AI disclosure: a small tag beside Kakak's name in her sheet, for two
 * seconds the first time she appears. `x`, `y`: the right end and middle of
 * her name, in CSS px of the screen.
 */
export function AiTag({ text, x, y, from, to }: { text: string; x: number; y: number; from: number; to: number }) {
  const frame = useCurrentFrame();
  const { k, inset } = useContext(Geo);
  const o = ramp(frame, from, from + 8) * (1 - ramp(frame, to - 8, to));
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: (x + 8) * k,
        top: inset + y * k,
        transform: `translateY(-50%) scale(${0.9 + 0.1 * o})`,
        transformOrigin: "left center",
        opacity: o,
        fontFamily: FONT,
        fontSize: 11.5 * k,
        fontWeight: 600,
        lineHeight: 1,
        color: C.ink,
        background: "#f1efeb",
        border: `${Math.max(1, k * 0.8)}px solid rgba(23,23,23,0.12)`,
        borderRadius: 999,
        padding: `${4 * k}px ${8 * k}px`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
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
 * a phone maker's lock screen or banner. Sized in CSS px of the screen.
 */
export function NotificationCard({ title, body, time, at, until, top = 84 }: { title: string; body: string; time: string; at: number; until?: number; top?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k, inset } = useContext(Geo);
  const s0 = spring({ frame: frame - at, fps, config: { damping: 18, stiffness: 120, mass: 0.8 } });
  // Tapped: it lifts away.
  const gone = until === undefined ? 0 : ramp(frame, until, until + 8);
  const s = s0 * (1 - gone);
  if (frame < at || gone >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 12 * k,
        right: 12 * k,
        top: inset + top * k,
        transform: `translateY(${(1 - s) * -50 * k}px)`,
        opacity: Math.min(1, s * 1.4),
        background: "rgba(255,255,255,0.98)",
        borderRadius: 20 * k,
        padding: `${14 * k}px ${16 * k}px ${15 * k}px`,
        fontFamily: FONT,
        boxShadow: `0 ${15 * k}px ${34 * k}px rgba(0,0,0,0.28)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 * k }}>
        <BrandMark size={26 * k} />
        <div style={{ fontSize: 14.5 * k, fontWeight: 600, color: C.ink, flex: 1, letterSpacing: 0.2 }}>Miamus</div>
        <div style={{ fontSize: 13 * k, color: C.inkMute }}>{time}</div>
      </div>
      <div style={{ marginTop: 9 * k, fontSize: 17 * k, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{title}</div>
      <div style={{ marginTop: 3 * k, fontSize: 16 * k, color: C.inkSoft, lineHeight: 1.3 }}>{body}</div>
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
                fontSize: 58,
                fontWeight: 500,
                color: C.ink,
                background: C.paper,
                border: `1.5px solid ${C.border}`,
                borderRadius: 42,
                padding: "28px 42px",
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

/** The end card: the mark, the name, the line, the address (the AI note is in shot 2). */
export function EndCard({ line, from }: { line: string; from: number }) {
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
      <div style={{ opacity: b, transform: `translateY(${(1 - b) * 12}px)`, marginTop: 28, fontSize: 48, fontWeight: 500, lineHeight: 1.25, maxWidth: 780, color: C.ink, textWrap: "balance" } as React.CSSProperties}>
        {/* Words joined by a hyphen never break across lines. */}
        {line.split(" ").map((word, i) => (
          <React.Fragment key={i}>
            {i > 0 && " "}
            <span style={{ whiteSpace: "nowrap" }}>{word}</span>
          </React.Fragment>
        ))}
      </div>
      <div style={{ opacity: c, marginTop: 40, fontSize: 38, fontWeight: 500, color: C.inkSoft, letterSpacing: 0.5 }}>miamus.app</div>
    </div>
  );
}
