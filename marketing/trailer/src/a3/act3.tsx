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
import { ease, easeOut, lerp, ramp, springAt } from "../ui/kit";
import { camMix, layerScale, type Cam } from "../world/camera";
import { World } from "../world/World";
import { Dog } from "../world/Figures";
import { lightAt, mix, css, shadeRgb, type Light } from "../world/tod";
import { CROPS, type Crop, type CropId, CropImg } from "../stills/app";
import { GroundShadow, SmallChild, Staff } from "../stills/staff";
import { Bubble, Caption, Grade, INK, KAKAK, MAMA, P, PAPER, SERIF, Shafts, Tag, W, H, camFor } from "../stills/kit";
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

/** A bubble's life: it springs open at `at` and folds away between `close` and `close + 0.16 s`. */
function life(t: number, fps: number, at: number, close = Infinity) {
  if (t < at - 0.04) return 0;
  const o = springAt(t * FPS, fps, at * FPS, { damping: 15, stiffness: 190, mass: 0.7 });
  return Math.max(0, Math.min(1, o)) * (1 - rs(t, close, close + 0.16, lin));
}

/** A plate on its voice cue: in from just before the word, out after it, unless held (`until`). */
function Plate({ t, from, to, until, text, pulse }: { t: number; from: number; to: number; until?: number; text: React.ReactNode; pulse: number }) {
  const end = until ?? to + 0.25;
  const o = rs(t, from - 0.15, from + 0.08) * (1 - rs(t, end, end + 0.2, lin));
  if (o < 0.01) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <Caption text={text} pulse={t <= to ? pulse : 0} />
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
  const cam = camMix(MEDIUM6, camFor(1.79, MAMA, { x: 300, y: 1270 }), rs(t, 15, 24, lin));
  const speak = rs(t, 16.5, 16.78) * (1 - rs(t, 20.48, 20.78));
  const ph = phoneOf(cam, 1 - speak);
  const head = P(cam, MAMA.x + 8, MAMA.y - 286);
  const words = (COPY.en as unknown as { spoken: { words: [string, number][] } }).spoken.words;
  const t1 = cue("T1").from || 16.7;
  let wi = 0;
  const lines = SAY.map((line) =>
    line.map((w) => {
      const on = t1 + (words[wi++]?.[1] ?? 0);
      return { w, o: rs(t, on - 0.06, on + 0.1) };
    })
  );
  const say = life(t, fps, 16.58, 20.62);
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
      {say > 0.01 && (
        <div data-moving={say < 0.995 ? "" : undefined} style={{ position: "absolute", inset: 0, opacity: Math.min(1, say * 1.6), transform: `scale(${0.88 + 0.12 * say})`, transformOrigin: `${head.x}px ${head.y}px` }}>
          <Bubble x={120} y={250} w={798} h={Math.round(3 * 78 * 1.16 + 100)} to={{ x: head.x + 10, y: head.y - 14 }} label="Mama's words">
            <div style={{ padding: "50px 56px", font: `italic 500 78px/1.16 ${SERIF}`, color: INK, letterSpacing: -0.6 }}>
              {lines.map((line, i) => (
                <div key={i}>
                  {line.map((w, j) => (
                    <React.Fragment key={j}>
                      {j > 0 && " "}
                      <span style={{ opacity: w.o }}>{w.w}</span>
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
          </Bubble>
        </div>
      )}
      <AppCard parts={[{ id: "stop", scale: 1.13 }]} x={stopC.x - sdy / 2 - 8} y={stopC.y - sdy / 2 - 8} pad={8} r={999} inner={999} fill="#fafbfd" open={life(t, fps, 16.78, 20.42)} t={t} />
      {/* 8 · Kakak's short card: rows in turn, the button rises, one press, folds to "Saved". */}
      <AppCard
        parts={[
          { id: "cardRows2", scale: 2.72, reveal: lerp(0, 0.533, rs(t, 20.86, 21.02)) + 0.234 * rs(t, 21.26, 21.4) + 0.233 * rs(t, 21.66, 21.8) },
          { id: "looksBtn", scale: 2.72, vis: rs(t, 22.36, 22.62, easeOut) },
        ]}
        x={33}
        y={200}
        to={phoneOf(cam, 1)}
        open={life(t, fps, 20.7, 23.24)}
        press={{ at: 23.0, part: 1 }}
        t={t}
      />
      <AppCard parts={[{ id: "savedLine", scale: 2.95 }]} x={170} y={560} pad={14} fill="#ffffff" inner={0} to={phoneOf(cam, 1)} open={life(t, fps, 23.32)} t={t} />
      <Plate t={t} from={l4.from} to={l4.to} text="I'll take it from there." pulse={pulse} />
      <Grade />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 9–11 · 24.0–32.0 · the hand-over, Sari's work                       */
/* ------------------------------------------------------------------ */

const SARI = { x: 668, y: 1314 };
const SARI_S = 0.72;
/** Fix 3: Mama two steps to the left of the laundry (its left post is at x 206), so her figure is clear of the cloths. */
const MAMA9 = { x: 132, y: 1458 };
const K0 = camFor(1.2, MAMA9, { x: 330, y: 1270 });
const K1 = camFor(1.3, { x: 430, y: 1300 }, { x: 540, y: 1060 });
const SARI_AT = { x: 600, y: 1290 };
const KZ = (z: number) => camFor(z, SARI, SARI_AT);
/** One camera: the pan lands at 26.0 on Sari, then a slow push-in to 32.0 (fix 4). */
function camAt(t: number): Cam {
  if (t < 26) {
    const u = rs(t, 24, 26, ease);
    const K2 = KZ(2.0);
    const mid = { x: 2 * K1.x - (K0.x + K2.x) / 2, y: 2 * K1.y - (K0.y + K2.y) / 2, z: 2 * K1.z - (K0.z + K2.z) / 2 };
    const b = (k: keyof Cam) => (1 - u) * (1 - u) * K0[k] + 2 * u * (1 - u) * mid[k] + u * u * K2[k];
    const z = lerp(K0.z, 2.0, u * u * (3 - 2 * u));
    // Keep the bezier's path for x and y, but let the zoom ease on its own.
    return { x: b("x"), y: b("y"), z };
  }
  return KZ(lerp(2.0, 2.62, rs(t, 26, 32, (x) => x * x * (3 - 2 * x))));
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
const flyU = (t: number) => rs(t, 24.05, 26.4, (x) => x * x * (3 - 2 * x));

/** Sari's strokes: three long ones from 28.8 (the second carries "They run the home."), gentle ones before. */
const STROKES: [number, number][] = [[28.8, 29.5], [29.62, 30.34], [30.4, 30.8]];
function sariMop(t: number) {
  for (let i = 0; i < STROKES.length; i++) {
    const [a, b] = STROKES[i];
    if (t >= a && t <= b) {
      const u = (t - a) / (b - a);
      const dir = i % 2 === 0 ? 1 : -1;
      return { lean: 0.75 + 0.3 * Math.sin(u * Math.PI), sweep: -dir * Math.cos(u * Math.PI) };
    }
  }
  if (t > STROKES[0][0] && t < STROKES[2][1]) {
    const i = STROKES.findIndex(([a]) => a > t);
    return { lean: 0.75, sweep: i % 2 === 1 ? 1 : -1 };
  }
  return { lean: 0.28, sweep: Math.sin(t * 2.4) * 0.55 };
}
/** How far along the deck the mop has wiped (sweep units), for the sheen. */
function wiped(t: number) {
  if (t < STROKES[0][0]) return null;
  const s = sariMop(t);
  return t < STROKES[0][1] ? { a: -1, b: Math.max(-1, s.sweep) } : { a: -1, b: 1 };
}

function HandOver({ t }: { t: number }) {
  const { fps } = useVideoConfig();
  const { cue, pulse } = useVoice();
  const frame = Math.round(t * FPS);
  const light = lightAt(lerp(7.2, 7.46, rs(t, 24, 32, lin)));
  const cam = camAt(t);
  const phoneUp = (t >= 26.08 && t < 28.66) || t >= 30.84;
  const mop = sariMop(t);
  // The wet sheen on the deck she stands on, wiped along it behind the mop (in her own layer, so it stays under her).
  const w = wiped(t);
  const wk = w ? rs(t, 28.85, 29.05) * (0.85 + 0.15 * rs(t, 30.8, 31.4)) : 0;
  const sheen = mix(light.sun, [255, 255, 255], 0.45);
  const sari = (
    <g transform={`translate(${SARI.x} ${SARI.y}) scale(${SARI_S})`}>
      {w && wk > 0.01 && (
        <g opacity={wk}>
          <rect x={92 + w.a * 38 - 34} y={-7} width={(w.b - w.a) * 38 + 68} height={13} rx={6.5} fill="rgba(120,100,80,0.18)" />
          <rect x={92 + w.a * 38 - 28} y={-5} width={(w.b - w.a) * 38 + 56} height={6} rx={3} fill={css(sheen, 0.7)} />
        </g>
      )}
      <GroundShadow light={light} />
      <Staff light={light} top="#3f8f8a" legs="#39445a" bun tool="mop" phone={phoneUp} mop={phoneUp ? undefined : mop} />
    </g>
  );
  const sPhone = P(cam, FLY.p3.x, FLY.p3.y);
  // The light: born at her phone at 24.0, across the garden, into Sari's phone at 26.4, where it glows and settles.
  const u = flyU(t);
  const fly = (uu: number) => P(cam, flyAt(uu).x, flyAt(uu).y);
  const born = rs(t, 24.0, 24.18);
  const landed = rs(t, 26.4, 26.9);
  const head = fly(u);
  const r = 15 + 3 * layerScale(cam, 0.92);
  const tail = [...Array(9).keys()].map((k) => ({ ...fly(flyU(t - (k + 1) * 0.03)), k: (k + 1) / 10 }));
  const l5 = cue("L5");
  const l7 = cue("L7a");
  const card = life(t, fps, 27.0, 28.42);
  return (
    <>
      <World light={light} frame={760 + frame - 720} cam={cam} mama={1} mamaAt={{ ...MAMA9, s: 1 }} mamaPose={{ shade: 0, phone: 1, read: 1 }} laundry={1} birds={1} extra={sari} />
      <Shafts k={0.9} />
      {t < 27.2 && (
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
          <circle cx={head.x} cy={head.y} r={r * 2.4 * (1 + 0.5 * landed)} fill="url(#a3fly)" opacity={born * (1 - 0.55 * rs(t, 26.9, 27.2, lin))} />
          <circle cx={head.x} cy={head.y} r={r * 0.32} fill="#fffaf0" opacity={born * (1 - landed)} />
        </svg>
      )}
      {/* 10 · her card from the phone: "Pel teras", 09.00, the Sebelum place; the press at 28.2, the shutter. */}
      <AppCard parts={[{ id: "sariCard", scale: 3.2 }]} x={250} y={196} pad={12} r={40} inner={18} fill="#ffffff" to={{ x: sPhone.x, y: sPhone.y - 14 }} open={card} press={{ at: 28.2 }} t={t} />
      <Blink t={t} at={28.3} x={sPhone.x} y={sPhone.y - 6} />
      {/* 11b · the after photo, one tap on Selesai, the toast. */}
      <Blink t={t} at={30.9} x={sPhone.x} y={sPhone.y - 6} />
      <AppCard parts={[{ id: "selesai", scale: 2.72 }]} x={69} y={560} pad={14} r={40} inner={14} fill="#ffffff" to={{ x: sPhone.x, y: sPhone.y - 14 }} open={life(t, fps, 30.94, 31.2)} press={{ at: 31.12 }} t={t} />
      <AppCard parts={[{ id: "sariSelesai", scale: 2.95 }]} x={278} y={600} pad={14} fill="#ffffff" inner={0} to={{ x: sPhone.x, y: sPhone.y - 14 }} open={life(t, fps, 31.22)} t={t} />
      <Plate t={t} from={l5.from} to={l5.to} text={<>And everyone at home<br />knows what to do.</>} pulse={pulse} />
      <Plate t={t} from={l7.from} to={l7.to} until={31.98} text="They run the home." pulse={pulse} />
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

function Household({ t }: { t: number }) {
  const { cue, pulse } = useVoice();
  const frame = Math.round(t * FPS);
  const k = rs(t, 32, 35, ease);
  // The light swings to late afternoon: the crossfade from the morning carries the change, so no cold blue noon shows.
  const light = lightAt(lerp(16.45, 17.2, rs(t, 32, 33.6, ease)));
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
      <Plate t={t} from={l8.from} to={l8.to} until={99} text={<>And you? You'll only<br />hear from me…</>} pulse={pulse} />
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
      <AppCard parts={[{ id: "statusIn", scale: 3.4 }]} x={70} y={330} pad={14} fill="#f1fcf8" inner={0} to={phoneOf(cam, 1)} open={life(t, fps, 35.04, 36.86)} t={t} />
      <Plate t={t} from={l8.from} to={l8.to} until={36.95} text={<>And you? You'll only<br />hear from me…</>} pulse={pulse} />
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
            <rect x={-190} y={-404} width={380} height={808} fill="url(#a3lit)" opacity={0.5 * (1 - dark)} />
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
  const fade12 = rs(t, 32.0, 32.4, lin);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0e0f24" }}>
      {t < 24 && <AbsoluteFill><MamaTells t={t} /></AbsoluteFill>}
      {t >= 24 && t < 32.4 && <AbsoluteFill><HandOver t={t} /></AbsoluteFill>}
      {t >= 32 && t < 35 && <AbsoluteFill style={{ opacity: fade12 }}><Household t={t} /></AbsoluteFill>}
      {t >= 35 && t < 39 && <AbsoluteFill><MamaGolden t={t} /></AbsoluteFill>}
      {t >= 39 && <AbsoluteFill><QuietPhone t={t} /></AbsoluteFill>}
    </AbsoluteFill>
  );
}

