import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import tapsJson from "../public/shots/taps.json";
import {
  Backdrop,
  Caption,
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
   * See public/music/README.md.
   */
  music: string | null;
};

/* ------------------------------------------------------------------ */
/* Shot timings, in frames at 30 fps (storyboard tables)               */
/* ------------------------------------------------------------------ */

export const SHOTS_60 = {
  hook: [0, 60],
  s1: [60, 180],
  s2: [180, 390],
  s3: [390, 600],
  s4: [600, 780],
  s5: [780, 990],
  s6: [990, 1140],
  s7: [1140, 1350],
  s8: [1350, 1560],
  s9: [1560, 1680],
  end: [1680, 1800],
} as const;

export const SHOTS_15 = {
  hook: [0, 60],
  s2: [60, 180],
  s5: [180, 270],
  s7: [270, 360],
  end: [360, 450],
} as const;

const rest: Camera = { scale: 1, fx: CSS_W / 2, fy: CSS_H / 2 };

/** A gentle push in and back out, keyed by frame. */
/** Where a zoomed detail should sit on the frame: the middle of the room above the caption. */
const FOCUS_Y = 720;
/** The lift that brings CSS row `fy` of the screen to FOCUS_Y, at full zoom. */
const liftFor = (fy: number) => FOCUS_Y - onFrame(0, fy).y;

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

/* ------------------------------------------------------------------ */
/* The owner's three sentences to Kakak (shots 2–4)                    */
/* ------------------------------------------------------------------ */

function KakakShot({
  locale,
  k,
  length,
  typingFrom,
  typingLength,
  focusY,
  startTyped = false,
  rise = false,
}: {
  locale: Locale;
  k: 0 | 1 | 2;
  length: number;
  typingFrom: number;
  typingLength: number;
  focusY: number;
  /** The 15-second cut starts with the sentence already typed. */
  startTyped?: boolean;
  /** The phone rises in (the 15-second cut, straight after the hook). */
  rise?: boolean;
}) {
  const dir = `shots/${locale}`;
  const n = TYPING_FRAMES[k];
  const cues: Cue[] = [{ src: `${dir}/k${k}-open.png`, at: 0, fade: 0 }];
  if (startTyped) {
    cues[0] = { src: `${dir}/k${k}-type-${pad(n - 1)}.jpg`, at: 0, fade: 0 };
  } else {
    for (let i = 0; i < n; i++) cues.push({ src: `${dir}/k${k}-type-${pad(i)}.jpg`, at: typingFrom + Math.round((typingLength * i) / n), fade: 0 });
  }
  const typed = startTyped ? typingFrom : typingFrom + typingLength;
  const send = typed + 8;
  const card = send + 22;
  const confirm = length - 42;
  const saved = confirm + 8;
  cues.push({ src: `${dir}/k${k}-thinking.png`, at: send + 3, fade: 4 });
  cues.push({ src: `${dir}/k${k}-card.png`, at: card, fade: 9 });
  cues.push({ src: `${dir}/k${k}-saved.png`, at: saved, fade: 9 });
  const camera = useCamera([
    { at: 0, scale: 1, fy: focusY },
    { at: card + 6, scale: 1, fy: focusY },
    { at: card + 32, scale: 1.3, fy: focusY, ty: liftFor(focusY) },
    { at: confirm - 18, scale: 1.3, fy: focusY, ty: liftFor(focusY) },
    { at: confirm - 2, scale: 1, fy: focusY },
  ]);
  const slide = useSlideIn(0, 16, 1);
  const s = tap(`${locale}.k${k}.send`);
  const c = tap(`${locale}.k${k}.confirm`);
  return (
    <Phone
      camera={camera}
      x={rise ? 0 : 0}
      y={rise ? (1 - slide.opacity) * 120 : 0}
      opacity={rise ? slide.opacity : 1}
      overlay={
        <>
          <TapRing x={s.x} y={s.y} at={send} />
          <TapRing x={c.x} y={c.y} at={confirm} />
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

function StaffShot({ fast = false }: { fast?: boolean }) {
  // Timings within the shot; the 15-second cut runs the same beats faster.
  const t = fast
    ? { card: 14, sheet: 20, before: 34, beforeIn: 40, after: 52, afterIn: 58, finish: 72, done: 78 }
    : { card: 42, sheet: 50, before: 78, beforeIn: 86, after: 112, afterIn: 120, finish: 152, done: 160 };
  const cues: Cue[] = [
    { src: "shots/staff/list.png", at: 0, fade: 0 },
    { src: "shots/staff/sheet.png", at: t.sheet, fade: 8 },
    { src: "shots/staff/photo-before.png", at: t.beforeIn, fade: 4 },
    { src: "shots/staff/photo-after.png", at: t.afterIn, fade: 4 },
    { src: "shots/staff/done.png", at: t.done, fade: 9 },
  ];
  const slide = useSlideIn(0, fast ? 10 : 16, 1);
  const camera = useCamera(
    fast
      ? [{ at: 0, scale: 1 }]
      : [
          { at: 0, scale: 1 },
          { at: t.done + 4, scale: 1, fy: 790 },
          { at: t.done + 30, scale: 1.25, fy: 790, ty: liftFor(790) },
        ]
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

function Shot({ span, children }: { span: readonly [number, number]; children: React.ReactNode }) {
  return (
    <Sequence from={span[0]} durationInFrames={span[1] - span[0]} layout="none">
      {children}
    </Sequence>
  );
}

/** How dark the background is: evening for the two notification shots. */
function eveningAt(frame: number, cut: "60" | "15") {
  if (cut === "15") return 0;
  const [a] = SHOTS_60.s6;
  const [, b] = SHOTS_60.s6;
  const [c] = SHOTS_60.s8;
  const [, d] = SHOTS_60.s8;
  return interpolate(frame, [a, a + 20, b - 10, b + 4, c, c + 20, d - 6, d + 8], [0, 1, 1, 0.15, 0.15, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export const Trailer: React.FC<TrailerProps> = ({ locale, cut, music }) => {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const dir = `shots/${locale}`;

  return (
    <AbsoluteFill style={{ backgroundColor: "#f4f2ee" }}>
      <Backdrop evening={eveningAt(frame, cut)} />
      {music && (
        <Audio
          src={staticFile(music)}
          // Down to almost nothing under shot 8, back for the end card (storyboard, Sound).
          volume={(f) =>
            cut === "60"
              ? interpolate(f, [0, 12, SHOTS_60.s8[0] - 10, SHOTS_60.s8[0] + 10, SHOTS_60.s8[1] - 10, SHOTS_60.s8[1] + 10, 1788, 1800], [0, 0.8, 0.8, 0.08, 0.08, 0.8, 0.8, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })
              : interpolate(f, [0, 12, 438, 450], [0, 0.8, 0.8, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
          }
        />
      )}

      {cut === "60" ? <Sixty locale={locale} /> : <Fifteen locale={locale} />}

      {/* Captions sit above everything, in the safe area. */}
      {cut === "60" ? (
        <>
          <Shot span={SHOTS_60.s1}><Caption {...copy.s1} from={4} to={120} /></Shot>
          <Shot span={SHOTS_60.s2}><Caption {...copy.s2} label={copy.aiLabel} from={4} to={210} /></Shot>
          <Shot span={SHOTS_60.s3}><Caption {...copy.s3} from={4} to={210} /></Shot>
          <Shot span={SHOTS_60.s4}><Caption {...copy.s4} from={4} to={180} /></Shot>
          <Shot span={SHOTS_60.s5}><Caption {...copy.s5} from={6} to={210} /></Shot>
          <Shot span={SHOTS_60.s6}><Caption {...copy.s6} from={10} to={150} /></Shot>
          <Shot span={SHOTS_60.s7}><Caption {...copy.s7} from={6} to={210} /></Shot>
          <Shot span={SHOTS_60.s8}><Caption {...copy.s8} from={20} to={210} /></Shot>
          <Shot span={SHOTS_60.s9}><Caption {...copy.s9} from={2} to={120} /></Shot>
        </>
      ) : (
        <>
          <Shot span={SHOTS_15.s2}><Caption text={copy.short.s2} label={copy.aiLabel} from={4} to={120} /></Shot>
          <Shot span={SHOTS_15.s5}><Caption text={copy.short.s5} from={4} to={90} /></Shot>
          <Shot span={SHOTS_15.s7}><Caption text={copy.short.s7} from={4} to={90} /></Shot>
        </>
      )}
      {/* Keeps the first screens loading during the hook. */}
      <div style={{ display: "none" }}>{dir}</div>
    </AbsoluteFill>
  );
};

function Sixty({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const open = tap(`${locale}.open`);
  return (
    <>
      <Shot span={SHOTS_60.hook}>
        <HookBubbles lines={copy.hook} leaveAt={50} />
      </Shot>

      {/* 1. Today; a tap on Kakak's button. */}
      <Shot span={SHOTS_60.s1}>
        <S1 locale={locale} openTap={open} />
      </Shot>

      {/* 2–4. Tell Kakak once, three times. */}
      <Shot span={SHOTS_60.s2}>
        <KakakShot locale={locale} k={0} length={210} typingFrom={10} typingLength={48} focusY={330} />
      </Shot>
      <Shot span={SHOTS_60.s3}>
        <KakakShot locale={locale} k={1} length={210} typingFrom={8} typingLength={62} focusY={430} />
      </Shot>
      <Shot span={SHOTS_60.s4}>
        <KakakShot locale={locale} k={2} length={180} typingFrom={6} typingLength={48} focusY={420} />
      </Shot>

      {/* 5. Sari's phone. */}
      <Shot span={SHOTS_60.s5}>
        <StaffShot />
      </Shot>

      {/* 6. The staff reminder, on time. */}
      <Shot span={SHOTS_60.s6}>
        <S6 locale={locale} />
      </Shot>

      {/* 7. All on track, and a slow scroll past each person. */}
      <Shot span={SHOTS_60.s7}>
        <S7 locale={locale} />
      </Shot>

      {/* 8. The only time the owner's phone speaks. */}
      <Shot span={SHOTS_60.s8}>
        <S8 locale={locale} />
      </Shot>

      {/* 9. Kitchen, Pets, Repairs. */}
      <Shot span={SHOTS_60.s9}>
        <Phone>
          <ScreenTrack
            cues={[
              { src: `${dir}/glimpse-kitchen.png`, at: 0, fade: 6 },
              { src: `${dir}/glimpse-pets.png`, at: 40, fade: 6 },
              { src: `${dir}/glimpse-repairs.png`, at: 80, fade: 6 },
            ]}
          />
        </Phone>
      </Shot>

      <Shot span={SHOTS_60.end}>
        <Outro locale={locale} line={copy.endLine60} />
      </Shot>
    </>
  );
}

function S1({ locale, openTap }: { locale: Locale; openTap: { x: number; y: number } }) {
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const rise = ramp(frame, 0, 18);
  const camera = useCamera([
    { at: 0, scale: 1.0, fy: 200 },
    { at: 70, scale: 1.04, fy: 200 },
    { at: 96, scale: 1.0 },
  ]);
  return (
    <Phone y={(1 - rise) * 140} opacity={rise} camera={camera} overlay={<TapRing x={openTap.x} y={openTap.y} at={82} />}>
      <ScreenTrack
        cues={[
          { src: `${dir}/today.png`, at: 0, fade: 0 },
          { src: `${dir}/k0-open.png`, at: 90, fade: 10 },
        ]}
      />
    </Phone>
  );
}

function S6({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const frame = useCurrentFrame();
  const slide = useSlideIn(0, 14, 1);
  const camera = useCamera([
    { at: 0, scale: 1, fy: 140 },
    { at: 50, scale: 1, fy: 140 },
    { at: 80, scale: 1.4, fy: 140, ty: liftFor(140) * 0.55 },
  ]);
  return (
    <Phone
      x={slide.x}
      opacity={slide.opacity}
      bezel={STAFF_BEZEL}
      camera={camera}
      dim={0.55 * ramp(frame, 10, 30)}
      overlay={<NotificationCard {...copy.staffPush} at={36} />}
    >
      <ScreenTrack cues={[{ src: "shots/staff/evening.png", at: 0, fade: 0 }]} />
    </Phone>
  );
}

function S7({ locale }: { locale: Locale }) {
  const dir = `shots/${locale}`;
  const slide = useSlideIn(0, 16, -1);
  const scrollFrom = 96;
  const scrollLength = 104;
  const cues: Cue[] = [{ src: `${dir}/status.png`, at: 0, fade: 0 }];
  for (let i = 0; i < SCROLL_FRAMES; i++) cues.push({ src: `${dir}/scroll/${pad(i)}.jpg`, at: scrollFrom + Math.round((scrollLength * i) / SCROLL_FRAMES), fade: 0 });
  const camera = useCamera([
    { at: 0, scale: 1, fy: 180 },
    { at: 16, scale: 1, fy: 180 },
    { at: 46, scale: 1.35, fy: 180, ty: liftFor(180) * 0.4 },
    { at: 78, scale: 1.35, fy: 180, ty: liftFor(180) * 0.4 },
    { at: 96, scale: 1, fy: 180 },
  ]);
  return (
    <Phone x={slide.x} opacity={slide.opacity} camera={camera}>
      <ScreenTrack cues={cues} />
    </Phone>
  );
}

function S8({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const camera = useCamera([
    { at: 0, scale: 1, fy: 140 },
    { at: 62, scale: 1, fy: 140 },
    { at: 96, scale: 1.4, fy: 140, ty: liftFor(140) * 0.55 },
  ]);
  return (
    <Phone camera={camera} dim={0.62 * ramp(frame, 0, 24)} overlay={<NotificationCard {...copy.ownerPush} at={48} />}>
      <ScreenTrack cues={[{ src: `${dir}/scroll/${pad(SCROLL_FRAMES - 1)}.jpg`, at: 0, fade: 0 }]} />
    </Phone>
  );
}

function Outro({ locale, line }: { locale: Locale; line: string }) {
  const copy = COPY[locale];
  const frame = useCurrentFrame();
  const out = ramp(frame, 0, 14);
  const dir = `shots/${locale}`;
  return (
    <>
      <Phone opacity={1 - out} y={out * 60} camera={{ scale: 1 - out * 0.06, fx: CSS_W / 2, fy: CSS_H / 2 }}>
        <ScreenTrack cues={[{ src: `${dir}/glimpse-repairs.png`, at: 0, fade: 0 }]} />
      </Phone>
      <EndCard line={line} small={copy.endSmall} from={10} />
    </>
  );
}

function Fifteen({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  return (
    <>
      <Shot span={SHOTS_15.hook}>
        <HookBubbles lines={copy.hook} leaveAt={50} />
      </Shot>
      <Shot span={SHOTS_15.s2}>
        <KakakShot locale={locale} k={0} length={120} typingFrom={14} typingLength={0} focusY={330} startTyped rise />
      </Shot>
      <Shot span={SHOTS_15.s5}>
        <StaffShot fast />
      </Shot>
      <Shot span={SHOTS_15.s7}>
        <S7Short dir={dir} />
      </Shot>
      <Shot span={SHOTS_15.end}>
        <Outro15 locale={locale} />
      </Shot>
    </>
  );
}

function S7Short({ dir }: { dir: string }) {
  const slide = useSlideIn(0, 12, -1);
  const camera = useCamera([
    { at: 0, scale: 1, fy: 180 },
    { at: 12, scale: 1, fy: 180 },
    { at: 40, scale: 1.35, fy: 180, ty: liftFor(180) * 0.4 },
  ]);
  return (
    <Phone x={slide.x} opacity={slide.opacity} camera={camera}>
      <ScreenTrack cues={[{ src: `${dir}/status.png`, at: 0, fade: 0 }]} />
    </Phone>
  );
}

function Outro15({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const frame = useCurrentFrame();
  const out = ramp(frame, 0, 12);
  return (
    <>
      <Phone opacity={1 - out} y={out * 60}>
        <ScreenTrack cues={[{ src: `shots/${locale}/status.png`, at: 0, fade: 0 }]} />
      </Phone>
      <EndCard line={copy.endLine15} small={copy.endSmall} from={8} />
    </>
  );
}
