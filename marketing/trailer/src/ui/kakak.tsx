import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, CAPTION_BOTTOM, CX, FONT, H, SAFE } from "../theme";
import { clamp01, ease, easeOut, ramp, springAt } from "./kit";

/**
 * Kakak, as she is in the app (src/components/kakak/kakak-avatar.tsx): the
 * Miamus house with a heart inside, no face, one warm colour. Here she also
 * speaks: her mark draws itself at sunrise, and it glows with her voice
 * beside every caption, so it is always clear who is talking, and that she
 * is the app's AI helper, not a person.
 */
/*
 * A2 (owner, 20 Nov; trailer-reset 21, 22): the film's Kakak is treatment 1 "Tidy": the Miamus roof and a fuller heart
 * with a rounded tip, no walls, on the pale blush disc. The roof never moves; the heart is alive. No glow rings.
 */
const ROOF = "112,214 256,104 400,214";
function heartPath(x: number, y: number, w: number, h: number) {
  const p = (u: number, v: number) => `${(x + u * w).toFixed(1)} ${(y + v * h).toFixed(1)}`;
  return `M${p(0.5, 0.26)}C${p(0.44, 0.1)} ${p(0.34, 0)} ${p(0.23, 0)}C${p(0.09, 0)} ${p(0, 0.13)} ${p(0, 0.31)}C${p(0, 0.56)} ${p(0.24, 0.76)} ${p(0.43, 0.95)}Q${p(0.5, 1.02)} ${p(0.57, 0.95)}C${p(0.76, 0.76)} ${p(1, 0.56)} ${p(1, 0.31)}C${p(1, 0.13)} ${p(0.91, 0)} ${p(0.77, 0)}C${p(0.66, 0)} ${p(0.56, 0.1)} ${p(0.5, 0.26)}Z`;
}
const HEART = heartPath(160, 204, 192, 176);
/** The heart's centre, the point it grows from. */
const HC = "256 292";
const VIEWBOX = "92 78 328 328";

/** A2: how much the heart grows with her voice: up to 6 % on her loudest syllables (21: seen at 64 px). */
const PULSE = 0.06;

export function KakakAvatar({ size, glow = 0, pulse = 0 }: { size: number; glow?: number; pulse?: number }) {
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
        boxSizing: "border-box",
      }}
    >
      <svg viewBox={VIEWBOX} width={size * 0.64} height={size * 0.64} fill="none">
        <polyline points={ROOF} stroke={C.kakak} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" />
        <path d={HEART} fill={C.kakak} transform={`translate(${HC}) scale(${(1 + PULSE * pulse).toFixed(4)}) translate(-${HC.replace(" ", " -")})`} />
      </svg>
    </div>
  );
}

/**
 * Her entrance: the circle arrives, the roof and the walls draw in one
 * line, the heart lands and beats. `level` (0–1) is her voice.
 */
export function KakakMark({ size, at, level = 0, pulse = 0 }: { size: number; at: number; level?: number; pulse?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const disc = springAt(frame, fps, at, { damping: 14, stiffness: 120, mass: 0.9 });
  const roof = ramp(frame, at + 6, at + 22, easeOut);
  const heart = springAt(frame, fps, at + 22, { damping: 9, stiffness: 180, mass: 0.7 });
  // v17: once she is whole, the heart grows a little with her voice (her loudness, not a timed beat) and rests when
  // she is quiet.
  const beat = frame > at + 40 ? PULSE * pulse : 0;
  if (frame < at) return null;
  return (
    <div style={{ width: size, height: size, position: "relative", transform: `scale(${0.6 + 0.4 * disc})`, opacity: Math.min(1, disc * 1.6) }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: C.kakakTint,
          border: `${size * 0.016}px solid ${C.kakakLine}`,
          boxShadow: `0 ${size * 0.06}px ${size * 0.16}px rgba(40,20,30,0.22)`,
        }}
      />
      <svg viewBox={VIEWBOX} width={size * 0.64} height={size * 0.64} fill="none" style={{ position: "absolute", left: size * 0.18, top: size * 0.18 }}>
        <polyline points={ROOF} stroke={C.kakak} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - roof} opacity={roof > 0 ? 1 : 0} />
        <g transform={`translate(${HC}) scale(${Math.max(0, heart) * (1 + beat)}) translate(-${HC.replace(" ", " -")})`}>
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
export function Captions({ cues, level = 0, pulse = 0 }: { cues: CaptionCue[]; level?: number; pulse?: number }) {
  const frame = useCurrentFrame();
  // v8: every caption in its window is drawn with its own fade, so two lines close together cross-fade
  // instead of the plate snapping from one to the next.
  const live = cues.filter((c) => frame >= c.from - 5 && frame <= c.to + 10);
  if (!live.length) return null;
  return <>{live.map((c) => <CaptionPlate key={`${c.from}-${c.text}`} cue={c} level={level} pulse={pulse} />)}</>;
}

function CaptionPlate({ cue, level, pulse = 0 }: { cue: CaptionCue; level: number; pulse?: number }) {
  const frame = useCurrentFrame();
  const inT = ramp(frame, cue.from - 5, cue.from + 7, ease); // v11: a gentle entrance, no first-frame pop
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
        transform: `translate(0px, ${(1 - inT) * 16}px)`, // v11: centred in the clear area, off the right-hand buttons
      }}
    >
      <div
        data-bubble="caption"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          maxWidth: 790,
          padding: "15px 34px 16px 16px",
          borderRadius: 44,
          background: "rgba(22,19,26,0.84)",
          boxShadow: "0 10px 30px rgba(10,8,20,0.28)",
        }}
      >
        <KakakAvatar size={62} glow={level * (frame <= cue.to ? 1 : 0)} pulse={frame <= cue.to ? pulse : 0} />
        <div style={{ fontFamily: FONT, fontSize: 50, fontWeight: 600, lineHeight: 1.18, letterSpacing: -0.3, color: "#fff", textWrap: "balance" } as React.CSSProperties}>
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

/**
 * v6: Mama's words. A plain light plate with no mark, in the same place as Kakak's, so the two are
 * never mistaken for each other: Kakak is the dark plate with her heart, Mama is light and plain.
 */
export function MamaCaptions({ cues, kakak = [] }: { cues: CaptionCue[]; kakak?: CaptionCue[] }) {
  const frame = useCurrentFrame();
  const cue = cues.find((c) => frame >= c.from - 5 && frame <= c.to + 12);
  if (!cue) return null;
  // When Kakak speaks over her tail, Mama's plate steps up a row, so the two never sit on each other.
  const lift = kakak.some((k) => k.from - 6 <= cue.to + 12 && k.to + 10 >= cue.from - 3) ? 118 * ramp(frame, cue.from - 3, cue.from + 6) : 0;
  const inT = ramp(frame, cue.from - 5, cue.from + 7, ease); // v11: a gentle entrance, no first-frame pop
  const o = inT * (1 - ramp(frame, cue.to + 4, cue.to + 12));
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
        transform: `translate(0px, ${(1 - inT) * 16 - lift}px)`,
      }}
    >
      <div
        style={{
          maxWidth: 790,
          padding: "17px 36px 18px",
          borderRadius: 44,
          // Warm sand with a fine edge: light, plain, and not the white of the day's questions.
          background: "rgba(240,229,212,0.96)",
          border: "2px solid rgba(150,112,74,0.45)",
          boxShadow: "0 10px 30px rgba(10,8,20,0.26)",
          fontFamily: FONT,
          fontSize: 41,
          fontWeight: 600,
          lineHeight: 1.2,
          letterSpacing: -0.3,
          color: "#2a2420",
          textWrap: "balance",
        } as React.CSSProperties}
      >
        {cue.text}
      </div>
    </div>
  );
}
