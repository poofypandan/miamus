import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, HAND } from "../theme";
import type { Bubble } from "../film/copy";
import { easeOut, ramp } from "./kit";

/**
 * The hook's pile: the day's questions, landing faster and faster until
 * they cover the garden. Plain rounded shapes, no chat app's look. The
 * owner's questions are white; the short answers from staff ("Sudah, Bu":
 * done, ma'am) are small and grey, because the work was being done all
 * along. It was the asking that never stopped.
 */
const PLACES: { x: number; y: number; rot: number; size: number }[] = [
  // The first ones land around the child's call and around her, so both can still be seen…
  { x: 700, y: 1345, rot: -4, size: 58 },
  { x: 610, y: 760, rot: 2, size: 56 },
  { x: 250, y: 1650, rot: -2, size: 44 },
  { x: 640, y: 1500, rot: 3, size: 58 },
  { x: 210, y: 1380, rot: -5, size: 62 },
  { x: 700, y: 930, rot: 2, size: 54 },
  { x: 262, y: 868, rot: -3, size: 60 },
  { x: 800, y: 620, rot: 4, size: 44 },
  // …then the kite goes, then the child, then the call itself.
  { x: 730, y: 300, rot: -2, size: 58 },
  { x: 404, y: 1088, rot: 3, size: 56 },
  { x: 520, y: 1050, rot: -3, size: 54 },
  { x: 340, y: 470, rot: 2, size: 60 },
  { x: 770, y: 1070, rot: -4, size: 64 },
  { x: 500, y: 566, rot: 3, size: 52 },
  { x: 290, y: 1372, rot: -2, size: 44 },
  { x: 560, y: 1436, rot: 2, size: 58 },
  { x: 250, y: 1548, rot: -3, size: 52 },
  { x: 262, y: 262, rot: 3, size: 50 },
  { x: 820, y: 450, rot: -2, size: 50 },
  { x: 214, y: 1052, rot: 4, size: 50 },
  { x: 430, y: 372, rot: -3, size: 54 },
];

function One({ text, reply, x, y, rot, size, at, fall, i, big, from }: { text: string; reply?: boolean; x: number; y: number; rot: number; size: number; at: number; fall: number; i: number; big?: boolean; from?: { x: number; y: number } }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at) return null;
  const s = spring({ frame: frame - at, fps, config: { damping: big ? 13 : 11, stiffness: big ? 200 : 240, mass: 0.6 } });
  // Letting go: each drops a moment after the last, turning as it falls.
  const t = Math.max(0, frame - fall - (i % 6) * 1.2);
  const drop = t * t * 1.25;
  const spin = t * (i % 2 === 0 ? 0.8 : -0.8);
  const gone = ramp(frame, fall + 3, fall + 17);
  // Long questions stay inside the frame: the pile is in the way, not off the edge.
  const wide = text.length * size * 0.54 + size * 1.5;
  const tx = wide >= 1040 ? 540 : Math.max(wide / 2 + 20, Math.min(1080 - wide / 2 - 20, x));
  // v6: each question rises out of Mama's phone to its place.
  const fly = from ? Math.min(1, s) : 1;
  const cx = from ? from.x + (tx - from.x) * fly : tx;
  const cy = from ? from.y + (y - from.y) * fly : y;
  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top: cy + drop,
        transform: `translate(-50%, -50%) rotate(${rot + spin}deg) scale(${(big ? 0.3 : 0.45) + (big ? 0.7 : 0.55) * s})`,
        opacity: Math.min(1, s * 2.2) * (1 - gone),
        fontFamily: FONT,
        fontSize: size,
        fontWeight: reply ? 500 : 600,
        letterSpacing: -0.4,
        lineHeight: 1,
        whiteSpace: "nowrap",
        color: reply ? C.inkSoft : C.ink,
        background: reply ? "#e9e4dc" : "#ffffff",
        borderRadius: size * 0.82,
        padding: `${size * 0.46}px ${size * 0.74}px ${size * 0.5}px`,
        boxShadow: `0 ${size * 0.22}px ${size * 0.6}px rgba(14,10,30,0.3)`,
      }}
    >
      {text}
    </div>
  );
}

export function Pile({ bubbles, slam, at, slamAt, fall, from }: { bubbles: Bubble[]; slam: string; at: number[]; slamAt: number; fall: number; from?: { x: number; y: number } }) {
  const frame = useCurrentFrame();
  // Every landing jolts the whole pile a little.
  let kick = 0;
  for (const a of [...at, slamAt]) if (frame >= a) kick += Math.exp(-(frame - a) / 2.4);
  const m = frame < fall ? Math.min(1.7, kick) * 7 : 0;
  return (
    <div style={{ position: "absolute", inset: 0, transform: `translate(${(Math.sin(frame * 2.3) * m).toFixed(2)}px, ${(Math.cos(frame * 1.9) * m).toFixed(2)}px)` }}>
      {bubbles.map((b, i) => (
        <One key={i} text={b.text} reply={b.reply} {...PLACES[i % PLACES.length]} at={at[i]} fall={fall} i={i} from={from} />
      ))}
      <One text={slam} x={534} y={990} rot={-2} size={136} at={slamAt} fall={fall} i={3} big from={from} />
    </div>
  );
}

/** A child's handwriting, writing itself on. */
export function Hand({ text, x, y, size, at, dur = 18, rot = -5, out, color = "#fff6e6", shadow = "0 3px 22px rgba(70,24,10,0.42), 0 1px 3px rgba(70,24,10,0.3)" }: { text: string; x: number; y: number; size: number; at: number; dur?: number; rot?: number; out?: number; color?: string; shadow?: string }) {
  const frame = useCurrentFrame();
  if (frame < at) return null;
  const w = ramp(frame, at, at + dur, easeOut);
  const o = out === undefined ? 1 : 1 - ramp(frame, out, out + 12);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `rotate(${rot}deg)`,
        transformOrigin: "left center",
        fontFamily: HAND,
        fontWeight: 600,
        fontSize: size,
        lineHeight: 1,
        whiteSpace: "nowrap",
        color,
        textShadow: shadow,
        clipPath: `inset(-30% ${((1 - w) * 104).toFixed(2)}% -30% -6%)`,
        opacity: o,
      }}
    >
      {text}
    </div>
  );
}

/**
 * v6: the girl's voice, in her own hand, drawn as she says it: "Mama, look!" in the sky beside her
 * (the hook, and again at the end), and a smaller "Mama…?" over the pile that nobody answers.
 */
export function GirlCalls({ cues, call, hookOut, endOut }: { cues: { id: string; from: number; to: number; text: string }[]; call: { x: number; y: number; size: number }; hookOut: number; endOut?: number }) {
  return (
    <>
      {cues.map((c) => {
        // Over the white pile, in dark pencil, so it can be read.
        if (c.id === "G3") return <Hand key={c.id} text={c.text} x={330} y={1190} size={84} rot={-3} at={c.from - 2} out={c.to + 14} color="#3a2418" shadow="0 0 10px rgba(255,250,240,0.95), 0 0 3px rgba(255,250,240,0.9)" />;
        // The first call clears as the questions bury it; the second stays until the camera rises to the sky.
        const out = c.id === "G1" ? hookOut : endOut;
        return <Hand key={c.id} text={c.text} {...call} at={c.from - 2} out={out} />;
      })}
    </>
  );
}
