/**
 * A3 · Act 3 of the 60 (15.0–41.0 s), animated from the C1.6 stills with Fable's C1.6 fixes (trailer-reset 23) and the
 * app's new cards (#152 Kakak's short card, #153 Sari's task card, main 23f6060).
 *
 *  6–8   15.0–24.0  Mama on the lawn, one camera. She looks at her phone, taps the mic (16.3); raises it and says her
 *                   sentence, her words arriving on their onsets; Kakak's card opens out of the phone, rows in turn, the
 *                   button rises, one press (23.0), "Saved".
 *  9–11  24.0–32.0  The hand-over and Sari's work. The firefly leaves Mama's phone (24.0) with a short tapering glow,
 *                   crosses over the laundry and lands in Sari's raised phone (26.4); the pan lands at 26.0 on the
 *                   framing it keeps to 32.0, pushing in slowly. Her card, the press on Sebelum (28.2) and the shutter;
 *                   three strokes of the mop with the deck's sheen behind it, "They run the home." on the second; she
 *                   lifts the phone, the after photo, one tap on "Selesai" (31.15) and the toast to 32.0 and beyond.
 *  12    32.0–35.0  The light swings to late afternoon as the camera widens to the whole house; four ticks from 32.2.
 *  13–14 35.0–41.0  Mama, golden: the status card for two seconds; she lowers the phone under "…when something isn't
 *                   done."; at 39.0 the close-up of the phone in her hand, going dark, the kite crossing its glass, no words.
 *
 * Every plate follows its voice cue (fix 5); presses are a dip and a flash, never held (fix 6). Times are seconds.
 */
import React, { useContext } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Voice } from "../film/scenes";
import { ease, easeIn, easeOut, lerp, ramp, springAt } from "../ui/kit";
import { camMix, layerScale, type Cam } from "../world/camera";
import { World } from "../world/World";
import { Dog } from "../world/Figures";
import { lightAt, mix, css, shadeRgb, type Light } from "../world/tod";
import { CROPS, type Crop, type CropId, CropImg } from "../stills/app";
import { GroundShadow, SmallChild, Staff } from "../stills/staff";
import { Bubble, Caption, Grade, KAKAK, MAMA, MAMA_TRACK, P, PAPER, SPEECH, SayWord, Shafts, Tag, W, H, camFor, mamaFont, speechLife } from "../stills/kit";
import { COPY } from "../film/copy";

const FPS = 30;
const lin = (x: number) => x;
/** 0→1 between two times (s). */
const rs = (t: number, a: number, b: number, e: (x: number) => number = ease) => ramp(t * FPS, a * FPS, b * FPS, e);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

type Part = { id: CropId; scale: number; /** 0–1: the part's arrival (it rises into place). */ vis?: number; /** 0–1: how much of the crop shows, from the top (rows arriving). */ reveal?: number };

/**
 * The app in a bubble from a phone, moving (A3): it opens out of the phone and folds back into it; a press dips the
 * bubble and flashes the terracotta ring for a few frames, then it is gone (fix 6). Several parts of one capture
 * stack in one bubble at their own (here always equal) scale; a part with `vis` rises in and the bubble grows for it.
 */
function AppCard({ parts, x, y, w, to, open, press, t, pad = 14, gap = 30, fill = PAPER, r = 52, inner = 20, label }: { parts: Part[]; x: number; y: number; w?: number; to?: { x: number; y: number }; open: number; press?: { at: number; part?: number }; t: number; pad?: number; gap?: number; fill?: string; r?: number; inner?: number; label?: string }) {
  if (open <= 0.01) return null;
  const widths = parts.map((p) => CROPS[p.id].rect.w * p.scale);
  const bw = w ?? Math.max(...widths) + pad * 2;
  let top = pad;
  const placed = parts.map((p, i) => {
    const c: Crop = CROPS[p.id];
    const pw = c.rect.w * p.scale;
    const ph = c.rect.h * p.scale;
    const vis = p.vis ?? 1;
    const at = { ...p, c, x: (bw - pw) / 2, y: top + (i > 0 ? gap : 0) * vis, pw, ph, vis };
    top += ((i > 0 ? gap : 0) + ph) * vis;
    return at;
  });
  const bh = top + pad;
  // The press: a dip over 0.2 s, the ring bright at once and gone by 0.3 s.
  const dt = press ? t - press.at : -1;
  const dip = dt >= 0 && dt < 0.22 ? Math.sin((dt / 0.22) * Math.PI) : 0;
  const ring = dt >= 0 && dt < 0.32 ? (dt < 0.05 ? dt / 0.05 : 1 - (dt - 0.05) / 0.27) : 0;
  const s = (0.86 + 0.14 * open) * (1 - 0.03 * dip);
  const moving = open < 0.995 || dip > 0 || placed.some((p) => p.vis < 0.995);
  const origin = to ?? { x: x + bw / 2, y: y + bh };
  const pp = press ? placed[press.part ?? 0] : null;
  return (
    <div data-moving={moving ? "" : undefined} style={{ position: "absolute", inset: 0, opacity: Math.min(1, open * 1.6), transform: `scale(${s})`, transformOrigin: `${origin.x}px ${origin.y}px` }}>
      <Bubble x={x} y={y} w={bw} h={bh} r={r} fill={fill} to={to} tailW={40} label={label ?? `app: ${parts.map((p) => p.id).join("+")}`}>
        {placed.map((p) => (
          <div key={p.id} style={{ position: "absolute", left: 0, top: 0, width: bw, height: bh, opacity: clamp01(p.vis * 1.4), transform: `translateY(${(1 - p.vis) * 26}px)`, clipPath: p.reveal !== undefined ? `inset(0 0 ${((1 - p.reveal) * p.ph + (bh - p.y - p.ph)).toFixed(1)}px 0)` : undefined }}>
            <CropImg id={p.id} scale={p.scale} x={p.x} y={p.y} radius={inner} />
          </div>
        ))}
      </Bubble>
      {pp && pp.c.press && ring > 0 && (
        <div style={{ position: "absolute", left: x + pp.x, top: y + pp.y, width: pp.pw, height: pp.ph }}>
          <div style={{ position: "absolute", left: (pp.c.press.x - pp.c.rect.x) * pp.scale - 12, top: (pp.c.press.y - pp.c.rect.y) * pp.scale - 12, width: pp.c.press.w * pp.scale + 24, height: pp.c.press.h * pp.scale + 24, borderRadius: pp.c.press.r * pp.scale + 12, border: `7px solid ${KAKAK}`, opacity: 0.9 * ring, boxSizing: "border-box" }} />
        </div>
      )}
    </div>
  );
}

/** A bubble's life: it springs open at `at` and folds away over 8 frames on easeIn from `close` (25, 1.2). */
function life(t: number, fps: number, at: number, close = Infinity) {
  if (t < at - 0.04) return 0;
  const o = springAt(t * FPS, fps, at * FPS, { damping: 15, stiffness: 190, mass: 0.7 });
  return Math.max(0, Math.min(1, o)) * (1 - rs(t, close, close + 8 / FPS, easeIn));
}

/**
 * A plate on its voice cue (25, 1.2, v17's behaviour on the warm plate): in from 5 frames before her word to 7
 * after on `ease`, rising 16 px; each word 50 % → 100 % as she says it; out from 2 to 10 frames after the cue on
 * `ease`. A plate held for the picture (`until`) leaves the same way over 8 frames. `text`: "\n" breaks a line.
 */
function Plate({ t, from, to, until, text, pulse }: { t: number; from: number; to: number; until?: number; text: string; pulse: number }) {
  const end = until ?? to + 2 / FPS;
  const inT = rs(t, from - 5 / FPS, from + 7 / FPS);
  const o = inT * (1 - rs(t, end, end + 8 / FPS));
  if (o < 0.01) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o, transform: `translateY(${((1 - inT) * 16).toFixed(2)}px)` }}>
      <Caption text={text} pulse={t <= to ? pulse : 0} lit={{ t, from, to }} />
    </div>
  );
}

/** A shutter: a soft white blink at a phone. */
function Blink({ t, at, x, y }: { t: number; at: number; x: number; y: number }) {
  const k = t >= at && t < at + 0.2 ? Math.sin(((t - at) / 0.2) * Math.PI) : 0;
  if (k <= 0) return null;
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <radialGradient id={`blink-${at}`}><stop offset="0" stopColor="#ffffff" stopOpacity={0.95} /><stop offset="1" stopColor="#fff6e8" stopOpacity={0} /></radialGradient>
      </defs>
      <circle cx={x} cy={y} r={30 + 26 * k} fill={`url(#blink-${at})`} opacity={k} />
    </svg>
  );
}

function useVoice() {
  const v = useContext(Voice);
  const cue = (id: string) => {
    const c = v.cue(id);
    return c ? { from: c.from / FPS, to: c.to / FPS } : { from: 0, to: 0 };
  };
  return { cue, pulse: v.pulse ?? 0 };
}

/* ------------------------------------------------------------------ */
/* 6–8 · 15.0–24.0 · Mama tells Kakak                                  */
/* ------------------------------------------------------------------ */

const MEDIUM6 = camFor(1.75, MAMA, { x: 300, y: 1270 });
const DOG = (light: Light, frame: number) => (
  <g transform="translate(158 1492)">
    <Dog kind="sit" light={light} frame={frame} coat="#e9c99c" />
  </g>
);
/**
 * Mama's sentence bubble (25, 1.3): Fraunces upright 500 at 62 px, line height 1.18; padding 30 / 32 / 40; about
 * 620 × 282 with all three lines in. In the 60 it opens at one line and grows a line at a time with her voice.
 */
const MS = 62;
const MLH = 1.18;
const MBW = 620;
const mbh = (lines: number) => Math.round(62 + lines * MS * MLH);
const SAY = [["Kak,", "have", "Sari"], ["mop", "the", "terrace"], ["every", "Monday", "at", "9."]];
/** Where her phone is, from the reading pose (read 1) to the speaking pose (read 0). */
const phoneOf = (cam: Cam, read: number, at = MAMA) => {
  const a = P(cam, at.x - 40, at.y - 210);
  const b = P(cam, at.x - 23, at.y - 259);
  return { x: lerp(b.x, a.x, read), y: lerp(b.y, a.y, read) };
};

function MamaTells({ t }: { t: number }) {
  const { fps } = useVideoConfig();
  const { cue, pulse } = useVoice();
  const frame = Math.round(t * FPS);
  const light = lightAt(lerp(6.8, 6.94, rs(t, 15, 24, lin)));
  // A4 (24, should): for the card (from 20.3) the camera widens a little, so Mama sits lower and the card's top is at 13 %.
  const cam = camFor(lerp(lerp(1.75, 1.79, rs(t, 15, 24, lin)), 1.5, rs(t, 20.3, 20.68)), MAMA, { x: 300, y: 1270 });
  const speak = rs(t, 16.5, 16.78) * (1 - rs(t, 20.48, 20.78));
  const ph = phoneOf(cam, 1 - speak);
  const head = P(cam, MAMA.x + 8, MAMA.y - 286);
  const words = (COPY.en as unknown as { spoken: { words: [string, number][] } }).spoken.words;
  const t1 = cue("T1").from || 16.7;
  let wi = 0;
  const lines = SAY.map((line) =>
    line.map((w) => {
      const on = t1 + (words[wi++]?.[1] ?? 0);
      return { w, on };
    })
  );
  // 25, 1.2: the bubble springs in with a little overshoot and leaves over 8 frames on easeIn; it grows a line at a
  // time (8 frames, `ease`, from 3 frames before that line's first word); each word rises in on its own onset.
  const sb = speechLife(frame, fps, Math.round(16.58 * FPS), Math.round(20.62 * FPS));
  const grown = 1 + rs(t, lines[1][0].on - 3 / FPS, lines[1][0].on + 5 / FPS) + rs(t, lines[2][0].on - 3 / FPS, lines[2][0].on + 5 / FPS);
  const l4 = cue("L4b");
  const sdy = 96 * 1.13;
  const stopC = { x: 140, y: ph.y - 10 };
  return (
    <>
      <World light={light} frame={460 + frame - 450} cam={cam} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={{ shade: speak, phone: 1, read: 1 - speak }} birds={1} extra={DOG(light, frame)} />
      <Shafts />
      {/* 6 · the mic, from the phone she is looking at; pressed at 16.3. */}
      <AppCard parts={[{ id: "micIn", scale: 3.4 }]} x={330} y={300} pad={10} fill="#fafbfd" inner={0} to={ph} open={life(t, fps, 15.06, 16.44)} press={{ at: 16.3 }} t={t} />
      {/* 7 · her words, on their onsets; rings from the phone while she speaks; the app's stop button, small. */}
      {speak > 0.05 && t < 20.7 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          {[0, 0.45].map((d) => {
            const k = (((t - 16.7 + d) % 0.9) + 0.9) % 0.9 / 0.9;
            return <circle key={d} cx={ph.x} cy={ph.y} r={26 + 44 * k} fill="none" stroke={KAKAK} strokeWidth={4 - 2 * k} opacity={0.55 * (1 - k) * speak} />;
          })}
        </svg>
      )}
      {sb && (
        <div data-moving={sb.moving ? "" : undefined} style={{ position: "absolute", inset: 0, opacity: sb.o, transform: `translateY(${sb.dy.toFixed(2)}px) scale(${sb.s.toFixed(4)})`, transformOrigin: `${head.x}px ${head.y}px` }}>
          <Bubble x={120} y={250} w={MBW} h={mbh(grown)} to={{ x: head.x + 10, y: head.y - 14 }} speech label="Mama's words">
            <div style={{ padding: "30px 40px 32px", font: mamaFont(MS, MLH), color: SPEECH.ink, letterSpacing: MAMA_TRACK, whiteSpace: "nowrap" }}>
              {lines.map((line, i) => (
                <div key={i}>
                  {line.map((w, j) => <SayWord key={j} w={w.w} f={t * FPS} at={w.on * FPS} gap={j < line.length - 1} />)}
                </div>
              ))}
            </div>
          </Bubble>
        </div>
      )}
      <AppCard parts={[{ id: "stop", scale: 1.13 }]} x={stopC.x - sdy / 2 - 8} y={stopC.y - sdy / 2 - 8} pad={8} r={999} inner={999} fill="#fafbfd" open={life(t, fps, 16.78, 20.42)} t={t} />
      {/* 8 · Kakak's short card: rows in by 21.5, the button up at 21.9, one press at 22.6, "Saved" 22.9–24.0 (A4 fix A). */}
      <AppCard
        parts={[
          { id: "cardRows2", scale: 2.72, reveal: lerp(0, 0.533, rs(t, 20.84, 20.98)) + 0.234 * rs(t, 21.08, 21.2) + 0.233 * rs(t, 21.34, 21.48) },
          { id: "looksBtn", scale: 2.72, vis: rs(t, 21.66, 21.9, easeOut) },
        ]}
        x={33}
        y={250}
        to={phoneOf(cam, 1)}
        open={life(t, fps, 20.7, 22.76)}
        press={{ at: 22.6, part: 1 }}
        t={t}
      />
      {/* "Saved" holds, then closes into the firefly's light at her phone (23.82–24.0), the thing that travels. */}
      <AppCard parts={[{ id: "savedLine", scale: 2.95 }]} x={170} y={560} pad={14} fill="#ffffff" inner={0} to={phoneOf(cam, 1)} open={life(t, fps, 22.9, 23.82)} t={t} />
      <SeedLight t={t} at={phoneOf(cam, 1)} from={23.8} />
      <Plate t={t} from={l4.from} to={l4.to} text="I'll take it from there." pulse={pulse} />
      <Grade />
    </>
  );
}

/** The saved task becoming the light, at the phone, in the last frames before the cut to the hand-over. */
function SeedLight({ t, at, from }: { t: number; at: { x: number; y: number }; from: number }) {
  const k = rs(t, from, from + 0.2);
  if (k <= 0) return null;
  return (
    <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
      <defs>
        <radialGradient id="a3seed">
          <stop offset="0%" stopColor="#fff4d0" stopOpacity={1} />
          <stop offset="35%" stopColor="#ffd890" stopOpacity={0.75} />
          <stop offset="100%" stopColor="#ffb860" stopOpacity={0} />
        </radialGradient>
      </defs>
      <circle cx={at.x} cy={at.y - 10} r={46 * k} fill="url(#a3seed)" opacity={k} />
      <circle cx={at.x} cy={at.y - 10} r={7 * k} fill="#fffaf0" opacity={k} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* 9–11 · the hand-over, Sari's work (the 60: 24.0–32.0; the 15: 5.7–10.0) */
/* ------------------------------------------------------------------ */

const SARI = { x: 668, y: 1314 };
const SARI_S = 0.72;
/** Fix 3: Mama two steps to the left of the laundry (its left post is at x 206), so her figure is clear of the cloths. */
const MAMA9 = { x: 132, y: 1458 };
const K0 = camFor(1.2, MAMA9, { x: 330, y: 1270 });
const K1 = camFor(1.3, { x: 430, y: 1300 }, { x: 540, y: 1060 });
const SARI_AT = { x: 600, y: 1290 };
const KZ = (z: number) => camFor(z, SARI, SARI_AT);

/** The beat's times (s). The 60 and the 15 play the same pieces on different clocks. */
export type Beat = {
  t0: number; land: number; end: number; push: [number, number];
  fly: [number, number]; card: [number, number]; press: number; shutter: number;
  strokes: [number, number][]; up: [number, number][]; blink: number; ring: number; toast: number;
  tod: [number, number]; plates: boolean;
};
export const BEAT60: Beat = {
  t0: 24, land: 26, end: 32, push: [2.0, 2.62], fly: [24.05, 26.4], card: [27.0, 28.42], press: 28.2, shutter: 28.3,
  strokes: [[28.8, 29.5], [29.62, 30.34], [30.4, 30.8]], up: [[26.08, 28.66], [30.84, 99]], blink: 30.9, ring: 31.0, toast: 31.05,
  tod: [7.2, 7.46], plates: true,
};
/** The 15 (trailer-reset 24, fix D): the light to Sari, her card, two strokes, the lift, the press sign, the toast a full second. */
export const BEAT15: Beat = {
  t0: 5.7, land: 6.45, end: 10, push: [2.0, 2.45], fly: [5.74, 6.5], card: [6.66, 7.4], press: 7.15, shutter: 7.25,
  strokes: [[7.6, 8.12], [8.18, 8.6]], up: [[6.38, 7.44], [8.64, 99]], blink: 8.7, ring: 8.8, toast: 8.86,
  tod: [17.42, 17.38], plates: false,
};

/** One camera: the pan lands on Sari, then a slow push-in to the end (fix 4). */
function camAt(b: Beat, t: number): Cam {
  if (t < b.land) {
    const u = rs(t, b.t0, b.land, ease);
    const K2 = KZ(b.push[0]);
    const mid = { x: 2 * K1.x - (K0.x + K2.x) / 2, y: 2 * K1.y - (K0.y + K2.y) / 2, z: 2 * K1.z - (K0.z + K2.z) / 2 };
    const q = (k: keyof Cam) => (1 - u) * (1 - u) * K0[k] + 2 * u * (1 - u) * mid[k] + u * u * K2[k];
    return { x: q("x"), y: q("y"), z: lerp(K0.z, b.push[0], u * u * (3 - 2 * u)) };
  }
  return KZ(lerp(b.push[0], b.push[1], rs(t, b.land, b.end, (x) => x * x * (3 - 2 * x))));
}
/** The firefly's way, garden px: from Mama's phone, over the laundry, into Sari's raised phone. */
const FLY = { p0: { x: MAMA9.x - 40, y: MAMA9.y - 222 }, p1: { x: 150, y: 1020 }, p2: { x: 560, y: 960 }, p3: { x: SARI.x - 42 * SARI_S, y: SARI.y - 208 * SARI_S } };
function flyAt(u: number) {
  const a = 1 - u;
  return {
    x: a * a * a * FLY.p0.x + 3 * a * a * u * FLY.p1.x + 3 * a * u * u * FLY.p2.x + u * u * u * FLY.p3.x,
    y: a * a * a * FLY.p0.y + 3 * a * a * u * FLY.p1.y + 3 * a * u * u * FLY.p2.y + u * u * u * FLY.p3.y,
  };
}

/** Sari's strokes (long ones; gentle ones before them). */
function sariMop(b: Beat, t: number) {
  const S = b.strokes;
  for (let i = 0; i < S.length; i++) {
    const [a, e] = S[i];
    if (t >= a && t <= e) {
      const u = (t - a) / (e - a);
      const dir = i % 2 === 0 ? 1 : -1;
      return { lean: 0.75 + 0.3 * Math.sin(u * Math.PI), sweep: -dir * Math.cos(u * Math.PI) };
    }
  }
  if (t > S[0][0] && t < S[S.length - 1][1]) {
    const i = S.findIndex(([a]) => a > t);
    return { lean: 0.75, sweep: i % 2 === 1 ? 1 : -1 };
  }
  return { lean: 0.28, sweep: Math.sin(t * 2.4) * 0.55 };
}
/** How far along the deck the mop has wiped (sweep units), for the sheen. */
function wiped(b: Beat, t: number) {
  if (t < b.strokes[0][0]) return null;
  const s = sariMop(b, t);
  return t < b.strokes[0][1] ? { a: -1, b: Math.max(-1, s.sweep) } : { a: -1, b: 1 };
}

export function HandOver({ t, beat: b = BEAT60 }: { t: number; beat?: Beat }) {
  const { fps } = useVideoConfig();
  const { cue, pulse } = useVoice();
  const frame = Math.round(t * FPS);
  const light = lightAt(lerp(b.tod[0], b.tod[1], rs(t, b.t0, b.end, lin)));
  const cam = camAt(b, t);
  // A4 (24, should): Sari's phone and mop poses cross-fade over four frames at each change, no one-frame jump.
  const h = 2 / FPS;
  const upK = Math.max(...b.up.map(([a, e]) => rs(t, a - h, a + h, lin) * (1 - rs(t, e - h, e + h, lin))));
  const mop = sariMop(b, t);
  const flyU = (tt: number) => rs(tt, b.fly[0], b.fly[1], (x) => x * x * (3 - 2 * x));
  // The wet sheen on the deck she stands on, wiped along it behind the mop (in her own layer, so it stays under her).
  const w = wiped(b, t);
  const wk = w ? rs(t, b.strokes[0][0] + 0.05, b.strokes[0][0] + 0.25) : 0;
  const sheen = mix(light.sun, [255, 255, 255], 0.45);
  const sari = (
    <g transform={`translate(${SARI.x} ${SARI.y}) scale(${SARI_S})`}>
      {w && wk > 0.01 && (
        <g opacity={wk}>
          <rect x={92 + w.a * 38 - 36} y={-8} width={(w.b - w.a) * 38 + 72} height={15} rx={7.5} fill="rgba(110,90,70,0.3)" />
          <rect x={92 + w.a * 38 - 30} y={-6} width={(w.b - w.a) * 38 + 60} height={9} rx={4.5} fill={css(sheen, 0.92)} />
        </g>
      )}
      <GroundShadow light={light} />
      {upK < 0.999 && (
        <g opacity={1 - upK}>
          <Staff light={light} top="#3f8f8a" legs="#39445a" bun tool="mop" mop={mop} />
        </g>
      )}
      {upK > 0.001 && (
        <g opacity={upK}>
          <Staff light={light} top="#3f8f8a" legs="#39445a" bun tool="mop" phone />
        </g>
      )}
    </g>
  );
  const sPhone = P(cam, FLY.p3.x, FLY.p3.y);
  // The light: born at her phone, across the garden, into Sari's phone, where it glows and settles.
  const u = flyU(t);
  const fly = (uu: number) => P(cam, flyAt(uu).x, flyAt(uu).y);
  const born = rs(t, b.t0, b.t0 + 0.18);
  const landed = rs(t, b.fly[1], b.fly[1] + 0.5);
  const head = fly(u);
  const r = 15 + 3 * layerScale(cam, 0.92);
  const tail = [...Array(9).keys()].map((k) => ({ ...fly(flyU(t - (k + 1) * 0.03)), k: (k + 1) / 10 }));
  const l5 = cue("L5");
  const l7 = cue("L7a");
  // The press sign on her phone: the film's small terracotta ring, once (A4 fix B: no "Selesai" bar).
  const rd = t - b.ring;
  const ring = rd >= 0 && rd < 0.32 ? (rd < 0.05 ? rd / 0.05 : 1 - (rd - 0.05) / 0.27) : 0;
  return (
    <>
      <World light={light} frame={760 + frame - 720} cam={cam} mama={1} mamaAt={{ ...MAMA9, s: 1 }} mamaPose={{ shade: 0, phone: 1, read: 1 }} laundry={1} birds={1} extra={sari} />
      <Shafts k={0.9} />
      {t < b.card[0] + 0.2 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id="a3fly">
              <stop offset="0%" stopColor="#fff4d0" stopOpacity={1} />
              <stop offset="35%" stopColor="#ffd890" stopOpacity={0.75} />
              <stop offset="100%" stopColor="#ffb860" stopOpacity={0} />
            </radialGradient>
          </defs>
          {/* The tail: a short glow that tapers and fades behind it, never a line (fix 3). */}
          {u > 0.002 && u < 0.999 && tail.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={r * 1.6 * (1 - p.k * 0.85)} fill="url(#a3fly)" opacity={0.5 * (1 - p.k) * born} />)}
          <circle cx={head.x} cy={head.y} r={r * 2.4 * (1 + 0.5 * landed)} fill="url(#a3fly)" opacity={born * (1 - 0.55 * rs(t, b.card[0] - 0.1, b.card[0] + 0.2, lin))} />
          <circle cx={head.x} cy={head.y} r={r * 0.32} fill="#fffaf0" opacity={born * (1 - landed)} />
        </svg>
      )}
      {/* 10 · her card from the phone: "Pel teras", 09.00, the Sebelum place; the press, the shutter. */}
      <AppCard parts={[{ id: "sariCard", scale: 3.2 }]} x={250} y={196} pad={12} r={40} inner={18} fill="#ffffff" to={{ x: sPhone.x, y: sPhone.y - 14 }} open={life(t, fps, b.card[0], b.card[1])} press={{ at: b.press }} t={t} />
      <Blink t={t} at={b.shutter} x={sPhone.x} y={sPhone.y - 6} />
      {/* 11b · the after photo, the press sign once on her phone, the toast (no "Selesai" bar: it read as a glitch). */}
      <Blink t={t} at={b.blink} x={sPhone.x} y={sPhone.y - 6} />
      {ring > 0 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <circle cx={sPhone.x} cy={sPhone.y - 8} r={22 + 10 * (1 - ring)} fill="none" stroke={KAKAK} strokeWidth={6} opacity={0.9 * ring} />
        </svg>
      )}
      <AppCard parts={[{ id: "sariSelesai", scale: 2.95 }]} x={278} y={600} pad={14} fill="#ffffff" inner={0} to={{ x: sPhone.x, y: sPhone.y - 14 }} open={life(t, fps, b.toast)} t={t} />
      {b.plates && <Plate t={t} from={l5.from} to={l5.to} text={"And everyone at home\nknows what to do."} pulse={pulse} />}
      {b.plates && <Plate t={t} from={l7.from} to={l7.to} until={31.98} text="They run the home." pulse={pulse} />}
      <Grade />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 12 · 32.0–35.0 · they run the home                                  */
/* ------------------------------------------------------------------ */

const staffBox = (cam: Cam, at: { x: number; y: number }, s: number) => {
  const a = P(cam, at.x - 40 * s, at.y - 272 * s);
  const b = P(cam, at.x + 40 * s, at.y);
  return { l: a.x, t: a.y, r: b.x, b: b.y };
};
function PersonBox({ label, box }: { label: string; box: { l: number; t: number; r: number; b: number } }) {
  return <div data-person={label} style={{ position: "absolute", left: box.l, top: box.t, width: box.r - box.l, height: box.b - box.t, pointerEvents: "none" }} />;
}

/** Two lights mixed directly, key by key (colours mixed, numbers eased): no hours in between. */
function blendLight(a: Light, b: Light, k: number): Light {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(a) as (keyof Light)[]) {
    const x = a[key] as unknown;
    const y = b[key] as unknown;
    out[key] = Array.isArray(x) ? mix(x as [number, number, number], y as [number, number, number], k) : typeof x === "number" ? lerp(x, y as number, k) : k < 0.5 ? x : y;
  }
  return out as unknown as Light;
}

function Household({ t }: { t: number }) {
  const { cue, pulse } = useVoice();
  const frame = Math.round(t * FPS);
  const k = rs(t, 32, 35, ease);
  // A4 fix C: a hard cut at 32.0, then the light goes from the morning to gold as a direct blend of the two, never
  // through the blue of midday.
  const light = blendLight(lightAt(7.46), lightAt(17.2), rs(t, 32, 33.0, ease));
  const cam: Cam = { x: lerp(-24, -52, k), y: lerp(336, 322, k), z: lerp(1.3, 1.15, k) };
  const walk = rs(t, 32, 34.6, lin);
  const bob = Math.abs(Math.sin(t * 6.5)) * 4 * (1 - rs(t, 34.4, 34.6));
  const people = [
    { name: "Budi", x: 150, y: 1452, s: 0.9, tx: 0, tilt: -2, el: (l: Light) => <Staff light={l} top="#7d8f4e" legs="#5a4a3a" hat="brim" tool="can" /> },
    { name: "Sari", x: 520, y: 1314, s: 0.64, tx: -46, tilt: -3, el: (l: Light) => <Staff light={l} top="#3f8f8a" legs="#39445a" bun tool="mop" mop={{ lean: 0.4, sweep: Math.sin(t * 3) * 0.7 }} /> },
    { name: "Yanti", x: 820, y: 1312, s: 0.62, tx: 40, tilt: 2, el: (l: Light) => <Staff light={l} top="#e0a84a" legs="#6b4a3a" bun tool="tray" /> },
    // Fix 8: Joko's label sits to his left, clear of Yanti.
    { name: "Joko", x: lerp(712, 640, walk), y: 1530 - bob, s: 0.98, tx: 0, tilt: -1.5, el: (l: Light) => <Staff light={l} top="#5d7fa3" legs="#33384a" hat="cap" /> },
  ];
  const l7 = cue("L7b");
  const l8 = cue("L8");
  return (
    <>
      <World
        light={light}
        frame={1000 + frame - 960}
        cam={cam}
        laundry={1}
        birds={1}
        extra={
          <>
            {people.map((p) => (
              <g key={p.name} transform={`translate(${p.x} ${p.y}) scale(${p.s})`}>
                <GroundShadow light={light} />
                {p.el(light)}
              </g>
            ))}
            <g transform={`translate(${lerp(788, 716, walk)} ${1538 - bob * 0.6}) scale(0.9)`}>
              <SmallChild light={light} />
            </g>
          </>
        }
      />
      {people.map((p, i) => {
        const at = P(cam, p.x, p.y - 292 * p.s);
        const pop = springAt(t * FPS, FPS, (32.2 + 0.3 * i) * FPS, { damping: 13, stiffness: 180, mass: 0.6 });
        if (pop <= 0.01) return null;
        return (
          <div key={p.name} data-moving={pop < 0.995 ? "" : undefined} style={{ position: "absolute", inset: 0, opacity: clamp01(pop * 1.5), transform: `scale(${0.8 + 0.2 * Math.min(1, pop)})`, transformOrigin: `${at.x + p.tx}px ${at.y - 14}px` }}>
            <Tag x={Math.max(170, Math.min(820, at.x + p.tx))} y={at.y - 14} name={p.name} tilt={p.tilt} />
          </div>
        );
      })}
      {people.map((p) => (
        <PersonBox key={`b-${p.name}`} label={p.name} box={staffBox(cam, p, p.s)} />
      ))}
      <Plate t={t} from={l7.from} to={l7.to} text="I just keep track." pulse={pulse} />
      <Plate t={t} from={l8.from} to={l8.to} until={99} text={"And you? You'll only\nhear from me…"} pulse={pulse} />
      <Grade />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 13–14 · 35.0–41.0 · all on track; the quiet phone                   */
/* ------------------------------------------------------------------ */

function MamaGolden({ t }: { t: number }) {
  const { fps } = useVideoConfig();
  const { cue, pulse } = useVoice();
  const frame = Math.round(t * FPS);
  const light = lightAt(lerp(17.28, 17.42, rs(t, 35, 39, lin)));
  const cam = camMix(MEDIUM6, camFor(1.82, MAMA, { x: 300, y: 1270 }), rs(t, 35, 39, lin));
  // She lowers the phone to her side under "…when something isn't done." (37.1–37.9).
  const down = rs(t, 37.1, 37.9);
  const l8 = cue("L8");
  const l9 = cue("L9");
  return (
    <>
      <World light={light} frame={1100 + frame - 1050} cam={cam} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={{ shade: 0, phone: lerp(1, 0.001, down), read: 1 - down }} birds={1} extra={DOG(light, frame)} />
      <AppCard parts={[{ id: "statusIn", scale: 3.4 }]} x={70} y={330} pad={14} fill="#f1fcf8" inner={40} to={phoneOf(cam, 1)} open={life(t, fps, 35.04, 36.86)} t={t} />
      <Plate t={t} from={l8.from} to={l8.to} until={l9.from - 3 / FPS} text={"And you? You'll only\nhear from me…"} pulse={pulse} />
      <Plate t={t} from={l9.from} to={l9.to} until={38.84} text="…when something isn't done." pulse={pulse} />
      <Grade />
    </>
  );
}

/** 14 · the phone asleep in Mama's lowered hand; the screen goes dark; the kite crosses its glass. No words. */
function QuietPhone({ t }: { t: number }) {
  const frame = Math.round(t * FPS);
  const light = lightAt(17.45);
  const cam = camFor(2.3, { x: 420, y: 1420 }, { x: 760, y: 1100 });
  // Fix 9: the arm takes Mama's own skin (her figure's tone under this light) and tapers to the wrist.
  const skinRgb = mix(shadeRgb("#d9a27c", light, 0.03, 0.25), [196, 160, 140], 0.22);
  const skin = css(skinRgb);
  const skinDark = css(mix(skinRgb, [90, 50, 40], 0.22));
  const dark = rs(t, 39.0, 39.4, lin);
  const slide = rs(t, 39.25, 40.95, lin);
  const drift = Math.sin(t * 0.8) * 4;
  // The arm: a tapered shape along a curve from off the top of the frame to the wrist.
  const c = [{ x: 236, y: -80 }, { x: 262, y: 260 }, { x: 330, y: 480 }, { x: 420, y: 640 }];
  const pts = [...Array(21).keys()].map((i) => {
    const u = i / 20;
    const a = 1 - u;
    const x = a * a * a * c[0].x + 3 * a * a * u * c[1].x + 3 * a * u * u * c[2].x + u * u * u * c[3].x;
    const y = a * a * a * c[0].y + 3 * a * a * u * c[1].y + 3 * a * u * u * c[2].y + u * u * u * c[3].y;
    const dx = -3 * a * a * c[0].x + 3 * (a * a - 2 * a * u) * c[1].x + 3 * (2 * a * u - u * u) * c[2].x + 3 * u * u * c[3].x;
    const dy = -3 * a * a * c[0].y + 3 * (a * a - 2 * a * u) * c[1].y + 3 * (2 * a * u - u * u) * c[2].y + 3 * u * u * c[3].y;
    const n = Math.hypot(dx, dy) || 1;
    const hw = lerp(50, 30, u * u);
    return { l: { x: x - (dy / n) * hw, y: y + (dx / n) * hw }, r: { x: x + (dy / n) * hw, y: y - (dx / n) * hw } };
  });
  const arm = `M ${pts.map((p) => `${p.l.x.toFixed(1)} ${p.l.y.toFixed(1)}`).join(" L ")} L ${pts.slice().reverse().map((p) => `${p.r.x.toFixed(1)} ${p.r.y.toFixed(1)}`).join(" L ")} Z`;
  return (
    <>
      <div style={{ position: "absolute", inset: 0, filter: "blur(6px)", transform: "scale(1.04)" }}>
        <World light={light} frame={1180 + frame - 1170} cam={cam} child={1} />
      </div>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="a3glass" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#14161d" />
            <stop offset="0.6" stopColor="#0d0e13" />
            <stop offset="1" stopColor="#1a1512" />
          </linearGradient>
          <linearGradient id="a3sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6b98a" stopOpacity={0.16} />
            <stop offset="0.5" stopColor="#f6b98a" stopOpacity={0.03} />
            <stop offset="1" stopColor="#f6b98a" stopOpacity={0} />
          </linearGradient>
          <radialGradient id="a3lit" cx="0.5" cy="0.4" r="0.7">
            <stop offset="0" stopColor="#fbe9d8" />
            <stop offset="1" stopColor="#d9c4b3" />
          </radialGradient>
          <clipPath id="a3screen">
            <rect x={-190} y={-404} width={380} height={808} rx={44} />
          </clipPath>
          <filter id="a3soft"><feGaussianBlur stdDeviation="3" /></filter>
          <filter id="a3drop" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16" /></filter>
        </defs>
        <path d={arm} fill={skin} />
        <g transform={`translate(560 ${860 + drift}) rotate(-8)`}>
          <rect x={-206} y={-420} width={412} height={840} rx={62} fill="rgba(40,20,10,0.35)" filter="url(#a3drop)" transform="translate(18 26)" />
          <path d="M -150 -300 C -230 -280 -250 -120 -236 40 C -226 150 -170 210 -120 220 L -120 -300 Z" fill={skin} />
          <rect x={-214} y={-420} width={428} height={840} rx={64} fill="#191a20" />
          <rect x={-190} y={-404} width={380} height={808} rx={44} fill="url(#a3glass)" />
          <g clipPath="url(#a3screen)">
            {/* The lock screen's last light, going out. No UI on it. */}
            <rect x={-190} y={-404} width={380} height={808} fill="url(#a3lit)" opacity={0} />
            <rect x={-190} y={-404} width={380} height={808} fill="url(#a3sheen)" />
            <g filter="url(#a3soft)" opacity={0.24 * dark}>
              <path d={`M ${-150 + slide * 60} 404 Q ${-30 + slide * 120} 130 ${66 - 150 + slide * 300} ${-150 + 60 - slide * 60}`} stroke="rgba(255,240,220,0.8)" strokeWidth={2.4} fill="none" />
              <g transform={`translate(${74 - 150 + slide * 300} ${-200 + 60 - slide * 60}) rotate(${16 + slide * 8}) scale(1.3)`}>
                <path d="M 0 -64 L 42 -8 L 0 58 L -42 -8 Z" fill="#e0564f" />
              </g>
            </g>
            <path d={`M -190 ${-170 + slide * 260} L -120 ${-170 + slide * 260} L 190 ${-470 + slide * 260} L 120 ${-470 + slide * 260} Z`} fill="rgba(255,236,214,0.09)" />
          </g>
          {[-150, -64, 22].map((y, i) => (
            <rect key={i} x={190} y={y} width={46} height={78} rx={23} fill={skin} />
          ))}
          <path d="M -236 -20 C -232 -120 -214 -200 -196 -250 C -186 -270 -166 -266 -168 -244 C -176 -170 -184 -90 -186 0 Z" fill={skin} stroke={skinDark} strokeWidth={2} />
        </g>
      </svg>
      <Grade k={1.15} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Act 3                                                               */
/* ------------------------------------------------------------------ */

/** Act 3 of the 60, 15.0 to 41.0 s. Rendered inside a sequence from 15.0 s; frames here are absolute. */
export function Act3({ from }: { from: number }) {
  const t = (useCurrentFrame() + from) / FPS;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0e0f24" }}>
      {t < 24 && <AbsoluteFill><MamaTells t={t} /></AbsoluteFill>}
      {t >= 24 && t < 32 && <AbsoluteFill><HandOver t={t} /></AbsoluteFill>}
      {t >= 32 && t < 35 && <AbsoluteFill><Household t={t} /></AbsoluteFill>}
      {t >= 35 && t < 39 && <AbsoluteFill><MamaGolden t={t} /></AbsoluteFill>}
      {t >= 39 && <AbsoluteFill><QuietPhone t={t} /></AbsoluteFill>}
    </AbsoluteFill>
  );
}


/* ------------------------------------------------------------------ */
/* The 15's middle, 3.0–10.0 (trailer-reset 13; 24, fix D)             */
/* ------------------------------------------------------------------ */

const WIDE15: Cam = { x: -30, y: 300, z: 1.07 };
const SAY15 = ["Kak, have Sari", "mop the terrace", "every Monday at 9."];
const TAB15 = "Kakak · Miamus's AI helper";

/** 3.0–5.7: her sentence whole; at 4.8 it dims and the whole "Looks right" button rises beneath it; one press; both fold. */
function ShortTell({ t }: { t: number }) {
  const { fps } = useVideoConfig();
  const frame = Math.round(t * FPS);
  const light = lightAt(17.62);
  const head = P(WIDE15, MAMA.x + 8, MAMA.y - 286);
  const ph = P(WIDE15, MAMA.x - 23, MAMA.y - 259);
  const sb = speechLife(frame, fps, Math.round(2.9 * FPS), Math.round(5.5 * FPS));
  const dim = 1 - 0.55 * rs(t, 4.8, 5.0);
  return (
    <>
      <World light={light} frame={100 + frame - 90} cam={WIDE15} child={1} mama={1} mamaPose={{ shade: 1, phone: 1 }} dogs={1} kite={1} birds={1} />
      {sb && (
        <div data-moving={sb.moving ? "" : undefined} style={{ position: "absolute", inset: 0, opacity: sb.o * dim, transform: `translateY(${sb.dy.toFixed(2)}px) scale(${sb.s.toFixed(4)})`, transformOrigin: `${head.x}px ${head.y}px` }}>
          <Bubble x={120} y={250} w={MBW} h={mbh(3)} to={{ x: head.x + 4, y: head.y + 4 }} speech label="Mama's words">
            <div style={{ padding: "30px 40px 32px", font: mamaFont(MS, MLH), color: SPEECH.ink, letterSpacing: MAMA_TRACK, whiteSpace: "nowrap" }}>
              {SAY15.map((l) => <div key={l}>{l}</div>)}
            </div>
          </Bubble>
        </div>
      )}
      <AppCard parts={[{ id: "looksBtn", scale: 2.72 }]} x={33} y={640} to={ph} open={life(t, fps, 4.86, 5.5)} press={{ at: 5.3 }} t={t} />
      <Grade />
    </>
  );
}

/** Kakak's plate in the 15: the tab at 44 px, held through both her lines (3.15–7.63), the words following her voice. */
function ShortPlate({ t }: { t: number }) {
  const { cue, pulse } = useVoice();
  const s1 = cue("S1");
  const s2 = cue("S2");
  const a = { from: s1.from || 3.15, to: s1.to || 5.72 };
  const b = { from: s2.from || 5.72, to: s2.to || 7.63 };
  // 25, 1.2: each line its own plate, hung from the same top line; they cross-fade where they overlap, never a gap
  // and never a 5-frame swap. In 5 frames before the word to 7 after (rising 16 px), out on `ease`.
  const inA = rs(t, a.from - 5 / FPS, a.from + 7 / FPS);
  const oA = inA * (1 - rs(t, b.from - 3 / FPS, b.from + 5 / FPS));
  const inB = rs(t, b.from - 5 / FPS, b.from + 7 / FPS);
  const oB = inB * (1 - rs(t, b.to + 2 / FPS, b.to + 10 / FPS));
  return (
    <>
      {oA > 0.01 && (
        <div style={{ position: "absolute", inset: 0, opacity: oA, transform: `translateY(${((1 - inA) * 16).toFixed(2)}px)` }}>
          <Caption text="Hi, I'm Kakak. Tell me once," tab={TAB15} tabSize={40} pulse={t <= a.to ? pulse : 0} lit={{ t, ...a }} />
        </div>
      )}
      {oB > 0.01 && (
        <div style={{ position: "absolute", inset: 0, opacity: oB, transform: `translateY(${((1 - inB) * 16).toFixed(2)}px)` }}>
          <Caption text={"and everyone at home\nknows what to do."} tab={TAB15} tabSize={40} pulse={t >= b.from && t <= b.to ? pulse : 0} lit={{ t, ...b }} />
        </div>
      )}
    </>
  );
}

/** The 15's middle: 3.0 to 10.0 s. Rendered inside a sequence from 3.0 s; `from` is that frame. */
export function Act3Short({ from }: { from: number }) {
  const t = (useCurrentFrame() + from) / FPS;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0e0f24" }}>
      {t < BEAT15.t0 ? <AbsoluteFill><ShortTell t={t} /></AbsoluteFill> : <AbsoluteFill><HandOver t={t} beat={BEAT15} /></AbsoluteFill>}
      <ShortPlate t={t} />
    </AbsoluteFill>
  );
}
