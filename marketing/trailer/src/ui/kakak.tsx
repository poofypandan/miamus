import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, CAPTION_BOTTOM, CX, FONT, H, SAFE } from "../theme";
import { clamp01, easeOut, ramp, springAt } from "./kit";

/**
 * Kakak, as she is in the app (src/components/kakak/kakak-avatar.tsx): the
 * Miamus house with a heart inside, no face, one warm colour. Here she also
 * speaks: her mark draws itself at sunrise, and it glows with her voice
 * beside every caption, so it is always clear who is talking, and that she
 * is the app's AI helper, not a person.
 */
const ROOF = "112,214 256,104 400,214";
const WALLS = "M152 400V262M360 262V400";
const HEART =
  "M256 322.4C232.4 304.7 182.8 271.7 182.8 230.4C182.8 204.4 201.7 185.6 224.1 185.6C239.5 185.6 250.1 195 256 206.8C261.9 195 272.5 185.6 287.9 185.6C310.3 185.6 329.2 204.4 329.2 230.4C329.2 271.7 279.6 304.7 256 322.4Z";
const VIEWBOX = "92 84 328 336";

export function KakakAvatar({ size, glow = 0 }: { size: number; glow?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: C.kakakTint,
        border: `${Math.max(1.5, size * 0.022)}px solid ${C.kakakLine}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        boxShadow: glow > 0.02 ? `0 0 ${size * (0.25 + 0.5 * glow)}px ${size * 0.06 * glow}px rgba(214,128,116,${(0.55 * glow).toFixed(3)})` : undefined,
        transform: `scale(${1 + 0.05 * glow})`,
      }}
    >
      <svg viewBox={VIEWBOX} width={size * 0.64} height={size * 0.64 * (336 / 328)} fill="none">
        <polyline points={ROOF} stroke={C.kakak} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
        <path d={WALLS} stroke={C.kakak} strokeWidth={40} strokeLinecap="round" />
        <path d={HEART} fill={C.kakak} />
      </svg>
    </div>
  );
}

/**
 * Her entrance: the circle arrives, the roof and the walls draw in one
 * line, the heart lands and beats. `level` (0–1) is her voice.
 */
export function KakakMark({ size, at, level = 0 }: { size: number; at: number; level?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const disc = springAt(frame, fps, at, { damping: 14, stiffness: 120, mass: 0.9 });
  const roof = ramp(frame, at + 6, at + 22, easeOut);
  const walls = ramp(frame, at + 16, at + 30, easeOut);
  const heart = springAt(frame, fps, at + 28, { damping: 9, stiffness: 180, mass: 0.7 });
  // A heartbeat once she is whole: two soft pulses, then rest.
  const t = Math.max(0, frame - at - 44);
  const phase = (t % 34) / 34;
  const beat = t > 0 ? Math.max(0, Math.sin(phase * Math.PI * 2 * 2)) * (phase < 0.5 ? 1 : 0) * 0.045 : 0;
  const glow = clamp01(heart) * (0.35 + 0.65 * level);
  if (frame < at) return null;
  return (
    <div style={{ width: size, height: size, position: "relative", transform: `scale(${0.6 + 0.4 * disc})`, opacity: Math.min(1, disc * 1.6) }}>
      {/* Rings that widen with her voice. */}
      {[0, 1].map((i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            inset: -size * (0.1 + 0.16 * i) * (0.6 + level),
            borderRadius: "50%",
            border: `${2.5 - i}px solid rgba(255,236,226,${(0.5 - 0.2 * i) * glow})`,
          }}
        />
      ))}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: C.kakakTint,
          border: `${size * 0.016}px solid ${C.kakakLine}`,
          boxShadow: `0 0 ${size * (0.3 + 0.5 * glow)}px ${size * 0.05 * glow}px rgba(255,214,196,${0.75 * glow}), 0 ${size * 0.06}px ${size * 0.16}px rgba(40,20,30,0.22)`,
        }}
      />
      <svg viewBox={VIEWBOX} width={size * 0.64} height={size * 0.64 * (336 / 328)} fill="none" style={{ position: "absolute", left: size * 0.18, top: size * 0.172 }}>
        <polyline points={ROOF} stroke={C.kakak} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - roof} opacity={roof > 0 ? 1 : 0} />
        <path d={WALLS} stroke={C.kakak} strokeWidth={40} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - walls} opacity={walls > 0 ? 1 : 0} />
        <g transform={`translate(256 254) scale(${Math.max(0, heart) * (1 + beat)}) translate(-256 -254)`}>
          <path d={HEART} fill={C.kakak} />
        </g>
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Captions                                                            */
/* ------------------------------------------------------------------ */

export interface CaptionCue {
  /** Frames. */
  from: number;
  to: number;
  text: string;
}

/**
 * Kakak's words, written as she says them: her mark, then the line, each
 * word brightening as it is spoken. Low in the safe area, on its own dark
 * plate, never over app text (the phone's picture melts away above it).
 */
export function Captions({ cues, level = 0 }: { cues: CaptionCue[]; level?: number }) {
  const frame = useCurrentFrame();
  const cue = cues.find((c) => frame >= c.from - 3 && frame <= c.to + 10);
  if (!cue) return null;
  const inT = ramp(frame, cue.from - 3, cue.from + 6, easeOut);
  const outT = ramp(frame, cue.to + 2, cue.to + 10);
  const o = inT * (1 - outT);
  const words = cue.text.split(" ");
  // Each word's moment, by its share of the letters.
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  let seen = 0;
  const span = cue.to - cue.from;
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        width: SAFE.right - SAFE.left,
        bottom: H - CAPTION_BOTTOM,
        display: "flex",
        justifyContent: "center",
        opacity: o,
        transform: `translate(${CX - (SAFE.left + SAFE.right) / 2}px, ${(1 - inT) * 16}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          maxWidth: 830,
          padding: "15px 34px 16px 16px",
          borderRadius: 44,
          background: "rgba(22,19,26,0.84)",
          boxShadow: "0 10px 30px rgba(10,8,20,0.28)",
        }}
      >
        <KakakAvatar size={62} glow={level * (frame <= cue.to ? 1 : 0)} />
        <div style={{ fontFamily: FONT, fontSize: 41, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.3, color: "#fff", textWrap: "balance" } as React.CSSProperties}>
          {words.map((w, i) => {
            const at = cue.from + (span * seen) / total;
            seen += w.length + 1;
            const lit = ramp(frame, at - 3, at + 4);
            return (
              <React.Fragment key={i}>
                {i > 0 && " "}
                <span style={{ opacity: 0.5 + 0.5 * lit }}>{w}</span>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
