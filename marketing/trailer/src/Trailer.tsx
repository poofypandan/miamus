import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import tapsJson from "../public/shots/taps.json";
import {
  Caption,
  Backdrop,
  CSS_H,
  CSS_W,
  type Camera,
  type Cue,
  EndCard,
  HookBubbles,
  NotificationCard,
  Phone,
  ScreenTrack,
  Shutter,
  TapRing,
  onFrame,
  ramp,
} from "./components";
import { COPY, type Locale } from "./copy";
import { loadFonts } from "./theme";
import {
  HOOK,
  K15,
  K60,
  type KakakTimes,
  S1,
  S6,
  S7,
  S8,
  S9,
  SHOTS_15,
  SHOTS_60,
  STAFF15,
  STAFF60,
  type Span,
  type StaffTimes,
  len,
} from "./timeline";

loadFonts();

const taps = tapsJson as Record<string, { x: number; y: number }>;
const tap = (key: string) => taps[key] ?? { x: CSS_W / 2, y: CSS_H / 2 };

/** How many typing stills the capture saved per sentence (capture/trailer.capture.ts). */
const TYPING_FRAMES = [14, 22, 18];
const SCROLL_FRAMES = 61;
const pad = (n: number) => String(n).padStart(2, "0");

export type TrailerProps = {
  locale: Locale;
  cut: "60" | "15";
  /**
   * MUSIC SLOT. A licensed track under public/music/ (for example
   * "music/track.mp3"), or null for a silent render with captions only.
   * See public/music/README.md and public/music/cue-sheet.md.
   */
  music: string | null;
};

/* ------------------------------------------------------------------ */
/* Camera and motion helpers                                           */
/* ------------------------------------------------------------------ */

const rest: Camera = { scale: 1, fx: CSS_W / 2, fy: CSS_H / 2 };

/** Where a zoomed detail should sit on the frame: the middle of the room above the caption. */
const FOCUS_Y = 720;
/** The lift that brings CSS row `fy` of the screen to FOCUS_Y, at full zoom. */
const liftFor = (fy: number) => FOCUS_Y - onFrame(0, fy).y;

/** A gentle push in and back out, keyed by frame. */
function useCamera(keys: { at: number; scale: number; fx?: number; fy?: number; ty?: number }[]): Camera {
  const frame = useCurrentFrame();
  if (keys.length === 0) return rest;
  let i = keys.findIndex((k) => k.at > frame);
  if (i === -1) i = keys.length;
  const a = keys[Math.max(0, i - 1)];
  const b = keys[Math.min(keys.length - 1, i)];
  const t = a === b ? 1 : ramp(frame, a.at, b.at);
  const lerp = (p: number, q: number) => p + (q - p) * t;
  return {
    scale: lerp(a.scale, b.scale),
    fx: lerp(a.fx ?? CSS_W / 2, b.fx ?? CSS_W / 2),
    fy: lerp(a.fy ?? CSS_H / 2, b.fy ?? CSS_H / 2),
    ty: lerp(a.ty ?? 0, b.ty ?? 0),
  };
}

/** The phone sliding in from one side at the start of a shot. */
function useSlideIn(from: number, duration = 14, side: 1 | -1 = 1) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, from + duration);
  return { x: (1 - t) * 640 * side, opacity: t };
}

function Shot({ span, children }: { span: Span; children: React.ReactNode }) {
  return (
    <Sequence from={span[0]} durationInFrames={len(span)} layout="none">
      {children}
    </Sequence>
  );
}

/* ------------------------------------------------------------------ */
/* The owner's three sentences to Kakak (shots 2–4)                    */
/* ------------------------------------------------------------------ */

function KakakShot({ locale, k, t, focusY, startTyped = false, rise = false }: { locale: Locale; k: 0 | 1 | 2; t: KakakTimes; focusY: number; startTyped?: boolean; rise?: boolean }) {
  const dir = `shots/${locale}`;
  const n = TYPING_FRAMES[k];
  const cues: Cue[] = [];
  if (startTyped) {
    cues.push({ src: `${dir}/k${k}-type-${pad(n - 1)}.jpg`, at: 0, fade: 0 });
  } else {
    cues.push({ src: `${dir}/k${k}-open.png`, at: 0, fade: 0 });
    for (let i = 0; i < n; i++) cues.push({ src: `${dir}/k${k}-type-${pad(i)}.jpg`, at: t.typingFrom + Math.round((t.typingLength * i) / n), fade: 0 });
  }
  cues.push({ src: `${dir}/k${k}-thinking.png`, at: t.send + 3, fade: 4 });
  cues.push({ src: `${dir}/k${k}-card.png`, at: t.card, fade: 9 });
  cues.push({ src: `${dir}/k${k}-saved.png`, at: t.saved, fade: 9 });
  const [zIn, zFull, zHold, zOut] = t.zoom;
  const camera = useCamera([
    { at: 0, scale: 1, fy: focusY },
    { at: zIn, scale: 1, fy: focusY },
    { at: zFull, scale: 1.3, fy: focusY, ty: liftFor(focusY) },
    { at: zHold, scale: 1.3, fy: focusY, ty: liftFor(focusY) },
    { at: zOut, scale: 1, fy: focusY },
  ]);
  const slide = useSlideIn(0, 16, 1);
  const s = tap(`${locale}.k${k}.send`);
  const c = tap(`${locale}.k${k}.confirm`);
  return (
    <Phone
      camera={camera}
      y={rise ? (1 - slide.opacity) * 120 : 0}
      opacity={rise ? slide.opacity : 1}
      overlay={
        <>
          <TapRing x={s.x} y={s.y} at={t.send} />
          <TapRing x={c.x} y={c.y} at={t.confirm} />
        </>
      }
    >
      <ScreenTrack cues={cues} />
    </Phone>
  );
}

/* ------------------------------------------------------------------ */
/* Sari's phone: Pel teras, with photos (shot 5)                       */
/* ------------------------------------------------------------------ */

const STAFF_BEZEL = "#7d7770";

function StaffShot({ t, zoomOnDone }: { t: StaffTimes; zoomOnDone: boolean }) {
  const cues: Cue[] = [
    { src: "shots/staff/list.png", at: 0, fade: 0 },
    { src: "shots/staff/sheet.png", at: t.sheet, fade: 8 },
    { src: "shots/staff/photo-before.png", at: t.beforeIn, fade: 4 },
    { src: "shots/staff/photo-after.png", at: t.afterIn, fade: 4 },
    { src: "shots/staff/done.png", at: t.done, fade: 9 },
  ];
  const slide = useSlideIn(0, zoomOnDone ? 16 : 10, 1);
  const camera = useCamera(
    zoomOnDone
      ? [
          { at: 0, scale: 1, fy: 790 },
          { at: t.done + 4, scale: 1, fy: 790 },
          { at: t.done + 30, scale: 1.16, fy: 790, ty: liftFor(790) * 0.6 },
        ]
      : []
  );
  const p = (k: string) => tap(`staff.${k}`);
  return (
    <Phone
      x={slide.x}
      opacity={slide.opacity}
      bezel={STAFF_BEZEL}
      camera={camera}
      overlay={
        <>
          <TapRing x={p("card").x} y={p("card").y} at={t.card} />
          <TapRing x={p("before").x} y={p("before").y} at={t.before} />
          <TapRing x={p("after").x} y={p("after").y} at={t.after} />
          <TapRing x={p("finish").x} y={p("finish").y} at={t.finish} />
          <Shutter at={t.beforeIn - 2} />
          <Shutter at={t.afterIn - 2} />
        </>
      }
    >
      <ScreenTrack cues={cues} />
    </Phone>
  );
}

/* ------------------------------------------------------------------ */
/* The trailer                                                         */
/* ------------------------------------------------------------------ */

/** How dark the background is: evening for the two notification shots. */
function eveningAt(frame: number, cut: "60" | "15") {
  if (cut === "15") return 0;
  const [a, b] = SHOTS_60.s6;
  const [c, d] = SHOTS_60.s8;
  return interpolate(frame, [a, a + 20, b - 10, b + 4, c, c + 20, d - 6, d + 8], [0, 1, 1, 0.15, 0.15, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/**
 * The music's level, as a safety net under whatever track is dropped in
 * (the arc itself belongs to the track; see timeline.ts MUSIC_ARC): quiet
 * under the hook, almost nothing under shot 8, and no fade at the end, which
 * should resolve on the last beat.
 */
function musicVolume(f: number, cut: "60" | "15") {
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  if (cut === "15") return interpolate(f, [0, SHOTS_15.s2[0] - 6, SHOTS_15.s2[0], 448, 450], [0.25, 0.25, 0.8, 0.8, 0], clamp);
  const [s8a, s8b] = SHOTS_60.s8;
  return interpolate(
    f,
    [0, SHOTS_60.s1[0] - 6, SHOTS_60.s1[0], s8a - 10, s8a + 10, s8b - 10, s8b, 1797, 1800],
    [0.25, 0.25, 0.8, 0.8, 0.06, 0.06, 0.8, 0.8, 0],
    clamp
  );
}

export const Trailer: React.FC<TrailerProps> = ({ locale, cut, music }) => {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const S = SHOTS_60;
  const Q = SHOTS_15;
  return (
    <AbsoluteFill style={{ backgroundColor: "#f4f2ee" }}>
      <Backdrop evening={eveningAt(frame, cut)} />
      {music && <Audio src={staticFile(music)} volume={(f) => musicVolume(f, cut)} />}

      {cut === "60" ? <Sixty locale={locale} /> : <Fifteen locale={locale} />}

      {/* Captions sit above everything, in the safe area. */}
      {cut === "60" ? (
        <>
          <Shot span={S.s1}><Caption {...copy.s1} from={4} to={len(S.s1)} /></Shot>
          <Shot span={S.s2}><Caption {...copy.s2} label={copy.aiLabel} from={4} to={len(S.s2)} /></Shot>
          <Shot span={S.s3}><Caption {...copy.s3} from={4} to={len(S.s3)} /></Shot>
          <Shot span={S.s4}><Caption {...copy.s4} from={4} to={len(S.s4)} /></Shot>
          <Shot span={S.s5}><Caption {...copy.s5} from={6} to={len(S.s5)} /></Shot>
          <Shot span={S.s6}><Caption {...copy.s6} from={10} to={len(S.s6)} /></Shot>
          <Shot span={S.s7}><Caption {...copy.s7} from={6} to={len(S.s7)} /></Shot>
          <Shot span={S.s8}><Caption {...copy.s8} from={20} to={len(S.s8)} /></Shot>
          <Shot span={S.s9}><Caption {...copy.s9} from={2} to={len(S.s9)} /></Shot>
        </>
      ) : (
        <>
          <Shot span={Q.s2}><Caption text={copy.short.s2} label={copy.aiLabel} from={4} to={len(Q.s2)} /></Shot>
          <Shot span={Q.s5}><Caption text={copy.short.s5} from={4} to={len(Q.s5)} /></Shot>
          <Shot span={Q.s7}><Caption text={copy.short.s7} from={4} to={len(Q.s7)} /></Shot>
        </>
      )}
    </AbsoluteFill>
  );
};

function Sixty({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const S = SHOTS_60;
  return (
    <>
      <Shot span={S.hook}>
        <HookBubbles lines={copy.hook} leaveAt={HOOK.leaveAt} stagger={HOOK.stagger} first={HOOK.first} />
      </Shot>

      {/* 1. Today; a tap on Kakak's button. */}
      <Shot span={S.s1}>
        <Shot1 locale={locale} />
      </Shot>

      {/* 2–4. Tell Kakak once, three times. */}
      <Shot span={S.s2}>
        <KakakShot locale={locale} k={0} t={K60[0]} focusY={330} />
      </Shot>
      <Shot span={S.s3}>
        <KakakShot locale={locale} k={1} t={K60[1]} focusY={430} />
      </Shot>
      <Shot span={S.s4}>
        <KakakShot locale={locale} k={2} t={K60[2]} focusY={420} />
      </Shot>

      {/* 5. Sari's phone. */}
      <Shot span={S.s5}>
        <StaffShot t={STAFF60} zoomOnDone />
      </Shot>

      {/* 6. The staff reminder, on time. */}
      <Shot span={S.s6}>
        <Shot6 locale={locale} />
      </Shot>

      {/* 7. All on track, and a slow scroll past each person. */}
      <Shot span={S.s7}>
        <Shot7 locale={locale} />
      </Shot>

      {/* 8. The only time the owner's phone speaks. */}
      <Shot span={S.s8}>
        <Shot8 locale={locale} />
      </Shot>

      {/* 9. Kitchen, Pets, Repairs. */}
      <Shot span={S.s9}>
        <Phone>
          <ScreenTrack
            cues={[
              { src: `${dir}/glimpse-kitchen.png`, at: 0, fade: 6 },
              { src: `${dir}/glimpse-pets.png`, at: S9.pets, fade: 6 },
              { src: `${dir}/glimpse-repairs.png`, at: S9.repairs, fade: 6 },
            ]}
          />
        </Phone>
      </Shot>

      <Shot span={S.end}>
        <Outro locale={locale} line={copy.endLine60} last={`${dir}/glimpse-repairs.png`} />
      </Shot>
    </>
  );
}

function Shot1({ locale }: { locale: Locale }) {
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const rise = ramp(frame, 0, 18);
  const open = tap(`${locale}.open`);
  const camera = useCamera([
    { at: 0, scale: 1.0, fy: 200 },
    { at: S1.tap - 12, scale: 1.04, fy: 200 },
    { at: S1.sheet + 6, scale: 1.0 },
  ]);
  return (
    <Phone y={(1 - rise) * 140} opacity={rise} camera={camera} overlay={<TapRing x={open.x} y={open.y} at={S1.tap} />}>
      <ScreenTrack
        cues={[
          { src: `${dir}/today.png`, at: 0, fade: 0 },
          { src: `${dir}/k0-open.png`, at: S1.sheet, fade: 10 },
        ]}
      />
    </Phone>
  );
}

function Shot6({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const frame = useCurrentFrame();
  const slide = useSlideIn(0, 14, 1);
  const camera = useCamera([
    { at: 0, scale: 1, fy: 140 },
    { at: S6.push + 14, scale: 1, fy: 140 },
    { at: S6.push + 44, scale: 1.4, fy: 140, ty: liftFor(140) * 0.55 },
  ]);
  return (
    <Phone x={slide.x} opacity={slide.opacity} bezel={STAFF_BEZEL} camera={camera} dim={0.55 * ramp(frame, 10, 30)} overlay={<NotificationCard {...copy.staffPush} at={S6.push} />}>
      <ScreenTrack cues={[{ src: "shots/staff/evening.png", at: 0, fade: 0 }]} />
    </Phone>
  );
}

function Shot7({ locale }: { locale: Locale }) {
  const dir = `shots/${locale}`;
  const slide = useSlideIn(0, 16, -1);
  const cues: Cue[] = [{ src: `${dir}/status.png`, at: 0, fade: 0 }];
  for (let i = 0; i < SCROLL_FRAMES; i++) cues.push({ src: `${dir}/scroll/${pad(i)}.jpg`, at: S7.scrollFrom + Math.round((S7.scrollLength * i) / SCROLL_FRAMES), fade: 0 });
  const lift = liftFor(180) * 0.4;
  const camera = useCamera([
    { at: 0, scale: 1, fy: 180 },
    { at: S7.zoomIn[0], scale: 1, fy: 180 },
    { at: S7.zoomIn[1], scale: 1.35, fy: 180, ty: lift },
    { at: S7.zoomOut[0], scale: 1.35, fy: 180, ty: lift },
    { at: S7.zoomOut[1], scale: 1, fy: 180 },
  ]);
  return (
    <Phone x={slide.x} opacity={slide.opacity} camera={camera}>
      <ScreenTrack cues={cues} />
    </Phone>
  );
}

function Shot8({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const camera = useCamera([
    { at: 0, scale: 1, fy: 140 },
    { at: S8.push + 14, scale: 1, fy: 140 },
    { at: S8.push + 48, scale: 1.4, fy: 140, ty: liftFor(140) * 0.55 },
  ]);
  return (
    <Phone camera={camera} dim={0.62 * ramp(frame, 0, 24)} overlay={<NotificationCard {...copy.ownerPush} at={S8.push} />}>
      <ScreenTrack cues={[{ src: `${dir}/scroll/${pad(SCROLL_FRAMES - 1)}.jpg`, at: 0, fade: 0 }]} />
    </Phone>
  );
}

function Outro({ locale, line, last }: { locale: Locale; line: string; last: string }) {
  const copy = COPY[locale];
  const frame = useCurrentFrame();
  const out = ramp(frame, 0, 14);
  return (
    <>
      <Phone opacity={1 - out} y={out * 60} camera={{ scale: 1 - out * 0.06, fx: CSS_W / 2, fy: CSS_H / 2 }}>
        <ScreenTrack cues={[{ src: last, at: 0, fade: 0 }]} />
      </Phone>
      <EndCard line={line} small={copy.endSmall} from={10} />
    </>
  );
}

function Fifteen({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const Q = SHOTS_15;
  return (
    <>
      <Shot span={Q.hook}>
        <HookBubbles lines={copy.hook} leaveAt={HOOK.leaveAt} stagger={HOOK.stagger} first={HOOK.first} />
      </Shot>
      <Shot span={Q.s2}>
        <KakakShot locale={locale} k={0} t={K15} focusY={330} startTyped rise />
      </Shot>
      <Shot span={Q.s5}>
        <StaffShot t={STAFF15} zoomOnDone={false} />
      </Shot>
      <Shot span={Q.s7}>
        <Shot7Short dir={dir} />
      </Shot>
      <Shot span={Q.end}>
        <Outro locale={locale} line={copy.endLine15} last={`${dir}/status.png`} />
      </Shot>
    </>
  );
}

function Shot7Short({ dir }: { dir: string }) {
  const slide = useSlideIn(0, 12, -1);
  const camera = useCamera([
    { at: 0, scale: 1, fy: 180 },
    { at: 12, scale: 1, fy: 180 },
    { at: 40, scale: 1.25, fy: 180, ty: -60 },
  ]);
  return (
    <Phone x={slide.x} opacity={slide.opacity} camera={camera}>
      <ScreenTrack cues={[{ src: `${dir}/status.png`, at: 0, fade: 0 }]} />
    </Phone>
  );
}
