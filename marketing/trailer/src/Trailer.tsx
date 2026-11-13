import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import tapsJson from "../public/shots/taps.json";
import {
  AiTag,
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
import { HOOK, K15, K60, type KakakTimes, S1, S6, S7, S8, S9, SHOTS_15, SHOTS_60, STAFF15, STAFF60, type Span, type StaffTimes, len } from "./timeline";

loadFonts();

const taps = tapsJson as Record<string, { x: number; y: number }>;
const tap = (key: string) => taps[key] ?? { x: CSS_W / 2, y: CSS_H / 2 };

/** How many typing and scroll stills the capture saved (capture/trailer.capture.ts). */
const TYPING_FRAMES = [14, 22, 18];
const SHEET_SCROLL_FRAMES = 14;
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
/* Camera                                                              */
/* ------------------------------------------------------------------ */

/**
 * Every shot is pushed in (design lead, v2: the phone never smaller than in
 * the Kakak shots). A key says which CSS row of the screen to look at, how
 * close, and where on the frame that row should sit (default: the middle of
 * the room above the caption).
 */
type Key = { at: number; fy: number; scale: number; y?: number };
const LOOK_Y = 720;
const cam = (at: number, fy: number, scale = 1.36, y = LOOK_Y): Key => ({ at, fy, scale, y });

function useCamera(keys: Key[]): Camera {
  const frame = useCurrentFrame();
  let i = keys.findIndex((k) => k.at > frame);
  if (i === -1) i = keys.length;
  const a = keys[Math.max(0, i - 1)];
  const b = keys[Math.min(keys.length - 1, i)];
  const t = a === b ? 1 : ramp(frame, a.at, b.at);
  const lerp = (p: number, q: number) => p + (q - p) * t;
  const fy = lerp(a.fy, b.fy);
  const y = lerp(a.y ?? LOOK_Y, b.y ?? LOOK_Y);
  return { scale: lerp(a.scale, b.scale), fx: CSS_W / 2, fy, ty: y - onFrame(0, fy).y };
}

/** The phone sliding in from one side at the start of a shot. */
function useSlideIn(from: number, duration = 14, side: 1 | -1 = 1) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, from + duration);
  return { x: (1 - t) * 760 * side, opacity: t };
}

function Shot({ span, children }: { span: Span; children: React.ReactNode }) {
  return (
    <Sequence from={span[0]} durationInFrames={len(span)} layout="none">
      {children}
    </Sequence>
  );
}

/* ------------------------------------------------------------------ */
/* The owner's three sentences to Kakak                                */
/* ------------------------------------------------------------------ */

/** Where to look on each of the three cards, and on what follows the save. */
const CARD_FOCUS = [380, 400, 410];
const SAVED_FOCUS = [600, 470, 600];
const TYPING_FOCUS = 420;

function KakakShot({
  locale,
  k,
  t,
  startTyped = false,
  rise = false,
  aiTag,
}: {
  locale: Locale;
  k: 0 | 1 | 2;
  t: KakakTimes;
  startTyped?: boolean;
  rise?: boolean;
  /** The AI tag's text: only the first time Kakak appears. */
  aiTag?: string;
}) {
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
  if (t.scrollLength) {
    for (let i = 0; i < SHEET_SCROLL_FRAMES; i++) cues.push({ src: `${dir}/k0-scroll-${pad(i)}.jpg`, at: t.scrollFrom + Math.round((t.scrollLength * i) / SHEET_SCROLL_FRAMES), fade: 0 });
  }
  cues.push({ src: `${dir}/k${k}-saved.png`, at: t.saved, fade: 9 });

  const c = tap(`${locale}.k${k}.confirm`);
  const s = tap(`${locale}.k${k}.send`);
  const name = tap(`${locale}.k${k}.name`);
  const beforeConfirm = t.scrollLength ? t.scrollFrom : t.confirm - 18;
  const camera = useCamera([
    cam(0, TYPING_FOCUS, 1.32),
    cam(t.card + 2, TYPING_FOCUS, 1.32),
    cam(t.card + 22, CARD_FOCUS[k], 1.36),
    cam(beforeConfirm, CARD_FOCUS[k], 1.36),
    // Down to the button (sentence 1 scrolls the sheet there), then the tap.
    cam(t.scrollLength ? t.scrollFrom + t.scrollLength : t.confirm - 4, c.y - 110, 1.36),
    cam(t.saved + 4, c.y - 110, 1.36),
    cam(t.saved + 22, SAVED_FOCUS[k], k === 1 ? 1.36 : 1.5),
  ]);
  const slide = useSlideIn(0, 16, 1);
  return (
    <Phone
      camera={camera}
      y={rise ? (1 - slide.opacity) * 120 : 0}
      opacity={rise ? slide.opacity : 1}
      overlay={
        <>
          {aiTag && <AiTag text={aiTag} x={name.x} y={name.y} from={t.tag[0]} to={t.tag[1]} />}
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
/* Sari's phone: Pel teras, with photos                                */
/* ------------------------------------------------------------------ */

const STAFF_BEZEL = "#7d7770";

function StaffShot({ t }: { t: StaffTimes }) {
  const cues: Cue[] = [
    { src: "shots/staff/list.png", at: 0, fade: 0 },
    { src: "shots/staff/sheet.png", at: t.sheet, fade: 8 },
    { src: "shots/staff/photo-before.png", at: t.beforeIn, fade: 4 },
    { src: "shots/staff/photo-after.png", at: t.afterIn, fade: 4 },
    { src: "shots/staff/done.png", at: t.done, fade: 9 },
  ];
  const slide = useSlideIn(0, 14, 1);
  const p = (k: string) => tap(`staff.${k}`);
  const camera = useCamera([
    cam(0, p("card").y, 1.4),
    cam(t.sheet, p("card").y, 1.4),
    cam(t.sheet + 10, 500, 1.34),
    // The two finished photos, each with its tick and its time.
    cam(t.afterIn + 4, 500, 1.34),
    cam(t.finish - 6, 560, 1.34),
    cam(t.done + 4, 560, 1.34),
    cam(t.done + 24, 700, 1.4),
  ]);
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

/** Dark only for the two evening notification shots (design lead, v2). */
function eveningAt(frame: number, cut: "60" | "15") {
  if (cut === "15") return 0;
  const [a, b] = SHOTS_60.s6;
  const [c, d] = SHOTS_60.s8;
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  return interpolate(frame, [a, a + 16, b - 10, b + 6], [0, 1, 1, 0], clamp) + interpolate(frame, [c, c + 20, d - 8, d + 8], [0, 1, 1, 0], clamp);
}

/**
 * The music's level, as a safety net under whatever track is dropped in
 * (the arc itself belongs to the track; timeline.ts MUSIC_ARC): quiet under
 * the hook, almost nothing under shot 8, and no fade at the end, which
 * should resolve on the last beat.
 */
function musicVolume(f: number, cut: "60" | "15") {
  const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  if (cut === "15") return interpolate(f, [0, SHOTS_15.s2[0] - 6, SHOTS_15.s2[0], 448, 450], [0.25, 0.25, 0.8, 0.8, 0], clamp);
  const [s8a, s8b] = SHOTS_60.s8;
  return interpolate(f, [0, SHOTS_60.s1[0] - 6, SHOTS_60.s1[0], s8a - 10, s8a + 10, s8b - 10, s8b, 1797, 1800], [0.25, 0.25, 0.8, 0.8, 0.06, 0.06, 0.8, 0.8, 0], clamp);
}

export const Trailer: React.FC<TrailerProps> = ({ locale, cut, music }) => {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const S = SHOTS_60;
  const Q = SHOTS_15;
  return (
    <AbsoluteFill style={{ backgroundColor: "#fbf8f3" }}>
      <Backdrop evening={eveningAt(frame, cut)} />
      {music && <Audio src={staticFile(music)} volume={(f) => musicVolume(f, cut)} />}

      {cut === "60" ? <Sixty locale={locale} /> : <Fifteen locale={locale} />}

      {/* One caption per shot, in the safe area, above everything. */}
      {cut === "60" ? (
        <>
          <Shot span={S.s1}><Caption {...copy.s1} from={4} to={len(S.s1)} /></Shot>
          <Shot span={S.s2}><Caption {...copy.s2} from={4} to={len(S.s2)} /></Shot>
          <Shot span={S.s3}><Caption {...copy.s3} from={4} to={len(S.s3)} /></Shot>
          <Shot span={S.s4}><Caption {...copy.s4} from={4} to={len(S.s4)} /></Shot>
          <Shot span={S.s5}><Caption {...copy.s5} from={6} to={len(S.s5)} /></Shot>
          <Shot span={S.s6}><Caption {...copy.s6} from={S6.push + 4} to={len(S.s6)} /></Shot>
          <Shot span={S.s7}><Caption {...copy.s7} from={6} to={len(S.s7)} /></Shot>
          <Shot span={S.s8}><Caption {...copy.s8} from={20} to={len(S.s8)} /></Shot>
          <Shot span={S.s9}><Caption {...copy.s9} from={2} to={len(S.s9)} /></Shot>
        </>
      ) : (
        <>
          <Shot span={Q.s2}><Caption text={copy.short.s2} from={4} to={len(Q.s2)} /></Shot>
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
      <Shot span={S.s1}>
        <Shot1 locale={locale} />
      </Shot>
      <Shot span={S.s2}>
        <KakakShot locale={locale} k={0} t={K60[0]} aiTag={copy.aiTag} />
      </Shot>
      <Shot span={S.s3}>
        <KakakShot locale={locale} k={1} t={K60[1]} />
      </Shot>
      <Shot span={S.s4}>
        <KakakShot locale={locale} k={2} t={K60[2]} />
      </Shot>
      <Shot span={S.s5}>
        <StaffShot t={STAFF60} />
      </Shot>
      <Shot span={S.s6}>
        <Shot6 locale={locale} />
      </Shot>
      <Shot span={S.s7}>
        <Shot7 locale={locale} />
      </Shot>
      <Shot span={S.s8}>
        <Shot8 locale={locale} />
      </Shot>
      <Shot span={S.s9}>
        <Shot9 dir={dir} />
      </Shot>
      <Shot span={S.end}>
        <Outro line={copy.endLine60} last={`${dir}/glimpse-repairs.png`} lastFocus={GLIMPSE.repairs} />
      </Shot>
    </>
  );
}

/** 1. Today, the status card out of view: a push in on Kakak's button, the tap, her sheet. */
function Shot1({ locale }: { locale: Locale }) {
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const rise = ramp(frame, 0, 18);
  const open = tap(`${locale}.open`);
  const camera = useCamera([cam(0, open.y - 60, 1.42), cam(S1.tap - 6, open.y - 50, 1.52), cam(S1.sheet + 4, open.y - 50, 1.52), cam(S1.sheet + 20, TYPING_FOCUS, 1.32)]);
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

/** 6. 21.30 on Sari's phone: the reminder, her tap, the photo of the dogs with the lights off, the tick. */
function Shot6({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const frame = useCurrentFrame();
  const slide = useSlideIn(0, 14, 1);
  const lights = tap("staff.lights");
  const save = tap("staff.lightsSave");
  const camera = useCamera([
    cam(0, 330, 1.36),
    cam(S6.push - 2, 330, 1.36),
    cam(S6.push + 14, 140, 1.42, 560),
    cam(S6.open, 140, 1.42, 560),
    cam(S6.open + 10, lights.y, 1.42),
    cam(S6.picked, lights.y, 1.42),
    cam(S6.picked + 10, 470, 1.34),
    cam(S6.done, 470, 1.34),
    cam(S6.done + 14, 560, 1.3),
  ]);
  const dim = 0.5 * ramp(frame, 8, 22) * (1 - ramp(frame, S6.open, S6.open + 8));
  return (
    <Phone
      x={slide.x}
      opacity={slide.opacity}
      bezel={STAFF_BEZEL}
      camera={camera}
      dim={dim}
      overlay={
        <>
          <NotificationCard {...copy.staffPush} at={S6.push} until={S6.open + 2} />
          <TapRing x={CSS_W / 2} y={150} at={S6.open} />
          <TapRing x={lights.x} y={lights.y} at={S6.camera} />
          <Shutter at={S6.picked - 2} />
          <TapRing x={save.x} y={save.y} at={S6.save} />
        </>
      }
    >
      <ScreenTrack
        cues={[
          { src: "shots/staff/evening.png", at: 0, fade: 0 },
          { src: "shots/staff/lights-picked.png", at: S6.picked, fade: 4 },
          { src: "shots/staff/lights-done.png", at: S6.done, fade: 8 },
        ]}
      />
    </Phone>
  );
}

/** 7. All on track: held on the status line, then a slow scroll past each person. */
function Shot7({ locale }: { locale: Locale }) {
  const dir = `shots/${locale}`;
  const slide = useSlideIn(0, 16, -1);
  const cues: Cue[] = [{ src: `${dir}/status.png`, at: 0, fade: 0 }];
  for (let i = 0; i < SCROLL_FRAMES; i++) cues.push({ src: `${dir}/scroll/${pad(i)}.jpg`, at: S7.scrollFrom + Math.round((S7.scrollLength * i) / SCROLL_FRAMES), fade: 0 });
  const camera = useCamera([cam(0, 175, 1.5, 560), cam(S7.scrollFrom - 8, 175, 1.5, 560), cam(S7.scrollFrom + 24, 300, 1.34), cam(S7.scrollFrom + S7.scrollLength, 300, 1.34)]);
  return (
    <Phone x={slide.x} opacity={slide.opacity} camera={camera}>
      <ScreenTrack cues={cues} />
    </Phone>
  );
}

/** 8. Evening: the owner's one alert, the walk that wasn't done. */
function Shot8({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const camera = useCamera([cam(0, 300, 1.34), cam(S8.push - 4, 300, 1.34), cam(S8.push + 20, 140, 1.46, 560)]);
  return (
    <Phone camera={camera} dim={0.62 * ramp(frame, 0, 24)} overlay={<NotificationCard {...copy.ownerPush} at={S8.push} />}>
      <ScreenTrack cues={[{ src: `${dir}/scroll/${pad(SCROLL_FRAMES - 1)}.jpg`, at: 0, fade: 0 }]} />
    </Phone>
  );
}

/** Where to look on each glimpse. */
const GLIMPSE = { kitchen: 330, pets: 380, repairs: 250 };

/** 9. Kitchen, Pets, Repairs: a beat or two each, read at a glance. */
function Shot9({ dir }: { dir: string }) {
  const camera = useCamera([
    cam(0, GLIMPSE.kitchen, 1.38),
    cam(S9.pets - 4, GLIMPSE.kitchen, 1.38),
    cam(S9.pets + 4, GLIMPSE.pets, 1.32),
    cam(S9.repairs - 4, GLIMPSE.pets, 1.32),
    cam(S9.repairs + 4, GLIMPSE.repairs, 1.46),
  ]);
  return (
    <Phone camera={camera}>
      <ScreenTrack
        cues={[
          { src: `${dir}/glimpse-kitchen.png`, at: 0, fade: 6 },
          { src: `${dir}/glimpse-pets.png`, at: S9.pets - 3, fade: 6 },
          { src: `${dir}/glimpse-repairs.png`, at: S9.repairs - 3, fade: 6 },
        ]}
      />
    </Phone>
  );
}

function Outro({ line, last, lastFocus }: { line: string; last: string; lastFocus: number }) {
  const frame = useCurrentFrame();
  const out = ramp(frame, 0, 14);
  const camera = useCamera([cam(0, lastFocus, 1.46)]);
  return (
    <>
      <Phone opacity={1 - out} y={out * 60} camera={camera}>
        <ScreenTrack cues={[{ src: last, at: 0, fade: 0 }]} />
      </Phone>
      <EndCard line={line} from={10} />
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
        <KakakShot locale={locale} k={0} t={K15} startTyped rise aiTag={copy.aiTag} />
      </Shot>
      <Shot span={Q.s5}>
        <StaffShot t={STAFF15} />
      </Shot>
      <Shot span={Q.s7}>
        <Shot7Short dir={dir} />
      </Shot>
      <Shot span={Q.end}>
        <Outro line={copy.endLine15} last={`${dir}/status.png`} lastFocus={175} />
      </Shot>
    </>
  );
}

function Shot7Short({ dir }: { dir: string }) {
  const slide = useSlideIn(0, 12, -1);
  const camera = useCamera([cam(0, 175, 1.5, 560)]);
  return (
    <Phone x={slide.x} opacity={slide.opacity} camera={camera}>
      <ScreenTrack cues={[{ src: `${dir}/status.png`, at: 0, fade: 0 }]} />
    </Phone>
  );
}
