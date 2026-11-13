import React, { createContext, useContext } from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, CX, FONT } from "../theme";
import { ramp } from "./kit";

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

/** Captured screens are 390 × 844 CSS px (1170 × 2532 at 3×): the real app, from the demo household. */
export const CSS_W = 390;
export const CSS_H = 844;
/** A plain strip above the app, where a phone keeps its clock (no clock is drawn: no maker's status bar). */
export const INSET = 12;

/** How the current screen is drawn: video px per CSS px, and the strip above the app. */
const Geo = createContext({ k: 1, inset: 0 });

/* ------------------------------------------------------------------ */
/* Screens                                                             */
/* ------------------------------------------------------------------ */

export interface Cue {
  /** Path under public/, e.g. "shots/en/today.png". */
  src: string;
  /** Frame (within the scene) it appears. */
  at: number;
  /** Crossfade length in frames; 0 cuts (typing frames). */
  fade?: number;
}

function Still({ src, opacity = 1 }: { src: string; opacity?: number }) {
  const { k, inset } = useContext(Geo);
  const size = { width: CSS_W * k, height: CSS_H * k };
  return (
    <>
      {/* The strip above: the still's own blank top rows, so it always matches (white, or dimmed under a sheet). */}
      <div style={{ position: "absolute", left: 0, top: 0, width: size.width, height: inset * k + 2, overflow: "hidden", opacity }}>
        <Img src={staticFile(src)} style={size} />
      </div>
      <Img src={staticFile(src)} style={{ position: "absolute", left: 0, top: inset * k, ...size, opacity }} />
    </>
  );
}

/** Plays a list of stills: each one from its frame on, crossfading over the one before. */
export function ScreenTrack({ cues }: { cues: Cue[] }) {
  const frame = useCurrentFrame();
  const sorted = [...cues].sort((a, b) => a.at - b.at);
  let current = 0;
  sorted.forEach((c, i) => {
    if (c.at <= frame) current = i;
  });
  const cur = sorted[current];
  const prev = sorted[current - 1];
  const fade = cur.fade ?? 8;
  const t = fade > 0 ? ramp(frame, cur.at, cur.at + fade) : 1;
  return (
    <>
      {prev && t < 1 && <Still src={prev.src} />}
      <Still src={cur.src} opacity={t} />
      {/* Keep the next still loading before it is needed. */}
      {sorted[current + 1] && <Still src={sorted[current + 1].src} opacity={0} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The phone                                                           */
/* ------------------------------------------------------------------ */

export interface PhoneCam {
  /** Size: video px per CSS px. 2.77 is the frame's full width. */
  k: number;
  /** The CSS point of the screen to look at, and where on the frame it lands. */
  fx: number;
  fy: number;
  X: number;
  Y: number;
  /** A slight turn in space, degrees. */
  rx: number;
  ry: number;
  rz: number;
}

/** A camera on the phone: size, the row to look at, where that row lands; centred across. */
export const look = (at: number, k: number, fy: number, Y: number, more: Partial<PhoneCam> = {}): PhoneCam & { at: number } => ({
  at,
  k,
  fx: CSS_W / 2,
  fy,
  X: CX,
  Y,
  rx: 0,
  ry: 0,
  rz: 0,
  ...more,
});

/**
 * A plain phone: thin dark frame, round corners, no notch and no maker's
 * shape. The app's screen inside it is the real one. The picture below
 * `fadeFrom` melts away so captions never sit on app text.
 */
export function Phone({
  cam,
  children,
  overlay,
  above,
  bezel = "#19191b",
  dim = 0,
  sleep = 0,
  fade = 1,
  fadeFrom = 1040,
  fadeTo = 1150,
  opacity = 1,
}: {
  cam: PhoneCam;
  children: React.ReactNode;
  /** Drawn over the app, in the screen's own space (tap rings, a shutter flash). */
  overlay?: React.ReactNode;
  /** Drawn over everything on the screen, even when it sleeps (a notification). */
  above?: React.ReactNode;
  bezel?: string;
  /** Darken the app (0–1). */
  dim?: number;
  /** The screen asleep (0–1): black glass. */
  sleep?: number;
  fade?: number;
  fadeFrom?: number;
  fadeTo?: number;
  opacity?: number;
}) {
  const k = cam.k;
  const b = 5.5 * k;
  const r = 44 * k;
  const w = CSS_W * k;
  const h = (CSS_H + INSET) * k;
  const left = cam.X - cam.fx * k - b;
  const top = cam.Y - (cam.fy + INSET) * k - b;
  const mask = fade > 0 ? `linear-gradient(to bottom, #000 0px, #000 ${fadeFrom}px, rgba(0,0,0,${(1 - fade).toFixed(3)}) ${fadeTo}px)` : undefined;
  const turned = cam.rx !== 0 || cam.ry !== 0 || cam.rz !== 0;
  if (opacity <= 0) return null;
  return (
    <AbsoluteFill style={{ opacity, ...(mask ? { WebkitMaskImage: mask, maskImage: mask } : {}) }}>
      <div
        style={{
          position: "absolute",
          left,
          top,
          width: w + 2 * b,
          height: h + 2 * b,
          transform: turned ? `perspective(2600px) rotateX(${cam.rx}deg) rotateY(${cam.ry}deg) rotateZ(${cam.rz}deg)` : undefined,
          transformOrigin: `${cam.fx * k + b}px ${(cam.fy + INSET) * k + b}px`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: r + b,
            background: bezel,
            boxShadow: `0 ${26 * k}px ${60 * k}px rgba(10,10,24,0.34), 0 ${5 * k}px ${14 * k}px rgba(10,10,24,0.22), inset 0 0 0 ${Math.max(1, 0.5 * k)}px rgba(255,255,255,0.16)`,
          }}
        />
        <div style={{ position: "absolute", left: b, top: b, width: w, height: h, borderRadius: r, overflow: "hidden", background: C.paper }}>
          <Geo.Provider value={{ k, inset: INSET }}>
            {children}
            {dim > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(16,17,19,${dim})` }} />}
            {overlay}
            {sleep > 0 && <div style={{ position: "absolute", inset: 0, background: `rgba(9,9,12,${sleep})` }} />}
            {above}
          </Geo.Provider>
          {/* Glass: a faint sheen across the screen. */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(118deg, rgba(255,255,255,${0.07 + sleep * 0.07}) 0%, rgba(255,255,255,0) 30%, rgba(255,255,255,0) 70%, rgba(255,255,255,${0.03 + sleep * 0.05}) 100%)`,
              pointerEvents: "none",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
}

/** Where a CSS point of the phone's screen lands on the frame (ignoring any turn). */
export function phonePoint(cam: PhoneCam, x: number, y: number) {
  return { x: cam.X + (x - cam.fx) * cam.k, y: cam.Y + (y - cam.fy) * cam.k };
}

/* ------------------------------------------------------------------ */
/* Things on the screen                                                */
/* ------------------------------------------------------------------ */

/** A soft circle where a tap lands (phones don't show touches). */
export function TapRing({ x, y, at }: { x: number; y: number; at: number }) {
  const frame = useCurrentFrame();
  const { k, inset } = useContext(Geo);
  const t = frame - at;
  if (t < -2 || t > 18) return null;
  const grow = interpolate(t, [-2, 4, 18], [0.55, 0.9, 1.4], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fade = interpolate(t, [-2, 2, 18], [0, 0.6, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const d = 46 * k * grow;
  return (
    <div
      style={{
        position: "absolute",
        left: x * k - d / 2,
        top: (inset + y) * k - d / 2,
        width: d,
        height: d,
        borderRadius: "50%",
        background: "rgba(23,23,23,0.2)",
        border: `${Math.max(2, k)}px solid rgba(255,255,255,0.92)`,
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

/** A soft ring around a part of the screen: where to look. */
export function Glow({ x, y, w, h, at, until, radius = 16 }: { x: number; y: number; w: number; h: number; at: number; until: number; radius?: number }) {
  const frame = useCurrentFrame();
  const { k, inset } = useContext(Geo);
  const o = ramp(frame, at, at + 8) * (1 - ramp(frame, until - 8, until));
  if (o <= 0) return null;
  const breathe = 1 + Math.sin((frame - at) * 0.22) * 0.25;
  return (
    <div
      style={{
        position: "absolute",
        left: x * k,
        top: (inset + y) * k,
        width: w * k,
        height: h * k,
        borderRadius: radius * k,
        boxShadow: `0 0 0 ${2.2 * k}px rgba(182,95,85,${0.9 * o}), 0 0 ${18 * k * breathe}px ${4 * k}px rgba(182,95,85,${0.38 * o})`,
      }}
    />
  );
}

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
 * A notification, drawn plainly in the app's own style (the Miamus mark, the
 * title and body exactly as the app sends them: supabase/migrations/150).
 * Deliberately not a phone maker's lock screen. Sized in the screen's CSS px.
 */
export function NotificationCard({ title, body, time, at, top = 96 }: { title: string; body: string; time: string; at: number; top?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { k, inset } = useContext(Geo);
  if (frame < at) return null;
  const s = spring({ frame: frame - at, fps, config: { damping: 17, stiffness: 120, mass: 0.8 } });
  return (
    <div
      style={{
        position: "absolute",
        left: 14 * k,
        right: 14 * k,
        top: (inset + top) * k,
        transform: `translateY(${(1 - s) * -44 * k}px) scale(${0.94 + 0.06 * s})`,
        opacity: Math.min(1, s * 1.5),
        background: "rgba(255,255,255,0.97)",
        borderRadius: 22 * k,
        padding: `${15 * k}px ${17 * k}px ${16 * k}px`,
        fontFamily: FONT,
        boxShadow: `0 ${14 * k}px ${34 * k}px rgba(0,0,0,0.36)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9 * k }}>
        <BrandMark size={25 * k} />
        <div style={{ fontSize: 14 * k, fontWeight: 600, color: C.ink, flex: 1, letterSpacing: 0.2 }}>Miamus</div>
        <div style={{ fontSize: 12.5 * k, color: C.inkMute }}>{time}</div>
      </div>
      <div style={{ marginTop: 9 * k, fontSize: 18 * k, fontWeight: 700, color: C.ink, lineHeight: 1.22, letterSpacing: -0.2 }}>{title}</div>
      <div style={{ marginTop: 3 * k, fontSize: 16 * k, color: C.inkSoft, lineHeight: 1.3 }}>{body}</div>
    </div>
  );
}

/** A small label over the screen, in its own space: a tag beside Kakak's name, a gloss on a staff word. */
export function Tag({ text, x, y, from, to, anchor = "left", tone = "light" }: { text: string; x: number; y: number; from: number; to: number; anchor?: "left" | "center"; tone?: "light" | "ink" }) {
  const frame = useCurrentFrame();
  const { k, inset } = useContext(Geo);
  const o = ramp(frame, from, from + 8) * (1 - ramp(frame, to - 8, to));
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x * k,
        top: (inset + y) * k,
        transform: `translate(${anchor === "center" ? "-50%" : "0"}, -50%) scale(${0.9 + 0.1 * o})`,
        transformOrigin: anchor === "center" ? "center" : "left center",
        opacity: o,
        fontFamily: FONT,
        fontSize: 12 * k,
        fontWeight: 600,
        lineHeight: 1,
        color: tone === "ink" ? "#fff" : C.ink,
        background: tone === "ink" ? "rgba(23,23,23,0.92)" : "#f4efe9",
        border: tone === "ink" ? "none" : `${Math.max(1, k * 0.7)}px solid rgba(23,23,23,0.12)`,
        borderRadius: 999,
        padding: `${5 * k}px ${9 * k}px`,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}
