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
  FramedPhone,
  HookBubbles,
  NotificationCard,
  Screen,
  ScreenTrack,
  Shutter,
  TapRing,
  ramp,
} from "./components";
import { COPY, type Locale } from "./copy";
import { loadFonts } from "./theme";
import { HOOK, K15, K60, type KakakTimes, S1, S6, S7, S8, S9, SHOTS_15, SHOTS_60, STAFF15, STAFF60, TWO_PHONES, type Span, type StaffTimes, len } from "./timeline";

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
 * The screen fills the frame (scale 1 = as wide as the frame, as large as on
 * a phone in the hand); the camera pushes in on what matters. A key says
 * which CSS row of the screen to look at (`fy`), how close, and where on the
 * frame that row should land (`y`). Everything that must be read lands
 * between 220 and about 1,350 px, clear of the caption and the platforms'
 * buttons.
 */
type Key = { at: number; fy: number; scale: number; y: number };
const cam = (at: number, fy: number, y = 780, scale = 1): Key => ({ at, fy, scale, y });

function useCamera(keys: Key[]): Camera {
  const frame = useCurrentFrame();
  let i = keys.findIndex((k) => k.at > frame);
  if (i === -1) i = keys.length;
  const a = keys[Math.max(0, i - 1)];
  const b = keys[Math.min(keys.length - 1, i)];
  const t = a === b ? 1 : ramp(frame, a.at, b.at);
  const lerp = (p: number, q: number) => p + (q - p) * t;
  return { scale: lerp(a.scale, b.scale), fx: CSS_W / 2, fy: lerp(a.fy, b.fy), y: lerp(a.y, b.y) };
}

/** The screen sliding in from one side at the start of a shot. */
function useSlideIn(from: number, duration = 14, side: 1 | -1 = 1) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, from + duration);
  return { x: (1 - t) * 1080 * side, opacity: 1 };
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

/** What follows each save: the toast on Today (status card out of view), or Kakak's "Done". */
const SAVED: Key[] = [cam(0, 609, 1000, 1.1), cam(0, 470, 780), cam(0, 609, 1000, 1.1)];

function KakakShot({ locale, k, t, startTyped = false, aiTag }: { locale: Locale; k: 0 | 1 | 2; t: KakakTimes; startTyped?: boolean; aiTag?: string }) {
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
  // The confirm button sits just above the caption, so the card's rows, its
  // switches and the button show together.
  const BUTTON_Y = 1270;
  const saved = SAVED[k];
  const camera = useCamera(
    t.scrollLength
      ? [
          cam(0, 440, 820),
          cam(t.card, 440, 820),
          // Sentence 1: the card's top first, Kakak's name with the AI tag
          // and her reply; then the sheet scrolls down to "Looks right".
          cam(t.card + 18, name.y, 260),
          cam(t.scrollFrom, name.y, 260),
          cam(t.scrollFrom + t.scrollLength, c.y, BUTTON_Y),
          cam(t.saved + 4, c.y, BUTTON_Y),
          { ...saved, at: t.saved + 20 },
        ]
      : [
          cam(0, 440, 820),
          cam(t.card, 440, 820),
          cam(t.card + 20, c.y, BUTTON_Y),
          cam(t.saved + 4, c.y, BUTTON_Y),
          { ...saved, at: t.saved + 20 },
        ]
  );
  return (
    <Screen
      camera={camera}
      overlay={
        <>
          {aiTag && <AiTag text={aiTag} x={name.x} y={name.y} from={t.tag[0]} to={t.tag[1]} />}
          <TapRing x={s.x} y={s.y} at={t.send} />
          <TapRing x={c.x} y={c.y} at={t.confirm} />
        </>
      }
    >
      <ScreenTrack cues={cues} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Sari's phone: Pel teras, with photos                                */
/* ------------------------------------------------------------------ */

const STAFF_BEZEL = "#7d7770";

function StaffScreen({ t, from = 0 }: { t: StaffTimes; from?: number }) {
  const cues: Cue[] = [
    { src: "shots/staff/list.png", at: 0, fade: 0 },
    { src: "shots/staff/sheet.png", at: t.sheet, fade: 8 },
    { src: "shots/staff/photo-before.png", at: t.beforeIn, fade: 4 },
    { src: "shots/staff/photo-after.png", at: t.afterIn, fade: 4 },
    { src: "shots/staff/done.png", at: t.done, fade: 9 },
  ];
  const p = (k: string) => tap(`staff.${k}`);
  const camera = useCamera([
    cam(from, p("card").y, 700),
    cam(t.sheet, p("card").y, 700),
    cam(t.sheet + 10, 490, 760),
    // The two finished photos, each with its tick and its time.
    cam(t.finish - 16, 490, 760),
    cam(t.finish - 4, p("finish").y, 1150),
    cam(t.done + 4, p("finish").y, 1150),
    // Done: the toast with its tick.
    cam(t.done + 20, 801, 1150, 1.06),
  ]);
  return (
    <Screen
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
    </Screen>
  );
}

/** 5. The owner's phone beside Sari's: what was said to Kakak, and her list. Then her screen fills the frame. */
function Shot5({ locale }: { locale: Locale }) {
  const frame = useCurrentFrame();
  const owner = ramp(frame, 0, 10);
  const staff = ramp(frame, 4, 18);
  const handover = ramp(frame, TWO_PHONES.until, TWO_PHONES.until + 12);
  const W2 = 380;
  return (
    <>
      <AbsoluteFill style={{ opacity: 1 - handover }}>
        <FramedPhone left={60} top={300 + (1 - owner) * 60} screenW={W2} opacity={owner}>
          <ScreenTrack cues={[{ src: `shots/${locale}/k0-card.png`, at: 0, fade: 0 }]} />
        </FramedPhone>
        <FramedPhone left={500 + (1 - staff) * 300} top={300} screenW={W2} bezel={STAFF_BEZEL} opacity={staff}>
          <ScreenTrack cues={[{ src: "shots/staff/list.png", at: 0, fade: 0 }]} />
        </FramedPhone>
      </AbsoluteFill>
      {frame >= TWO_PHONES.until && (
        <AbsoluteFill style={{ opacity: handover, transform: `scale(${0.94 + 0.06 * handover})` }}>
          <StaffScreen t={STAFF60} from={TWO_PHONES.until} />
        </AbsoluteFill>
      )}
    </>
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

      {/* One caption per shot, low in the platforms' safe area, above everything. */}
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
        <Shot5 locale={locale} />
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
        <Outro line={copy.endLine60} last={`${dir}/glimpse-repairs.png`} lastCam={GLIMPSE.repairs} />
      </Shot>
    </>
  );
}

/** 1. Today, the status card out of view: a push in on Kakak's button, the tap, her sheet. */
function Shot1({ locale }: { locale: Locale }) {
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const rise = ramp(frame, 0, 16);
  const open = tap(`${locale}.open`);
  const camera = useCamera([cam(0, 600, 820), cam(S1.tap - 8, open.y, 1050, 1.14), cam(S1.sheet + 4, open.y, 1050, 1.14), cam(S1.sheet + 20, 440, 820)]);
  return (
    <AbsoluteFill style={{ opacity: rise, transform: `translateY(${(1 - rise) * 80}px)` }}>
      <Screen camera={camera} overlay={<TapRing x={open.x} y={open.y} at={S1.tap} />}>
        <ScreenTrack
          cues={[
            { src: `${dir}/today.png`, at: 0, fade: 0 },
            { src: `${dir}/k0-open.png`, at: S1.sheet, fade: 10 },
          ]}
        />
      </Screen>
    </AbsoluteFill>
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
    cam(0, 320, 760),
    cam(S6.push - 2, 320, 760),
    cam(S6.push + 12, 130, 560, 1.08),
    cam(S6.open, 130, 560, 1.08),
    cam(S6.open + 10, lights.y, 700),
    cam(S6.picked, lights.y, 700),
    cam(S6.picked + 10, save.y - 120, 920),
    cam(S6.done, save.y - 120, 920),
    // Done: "every task today is done", and the green tick.
    cam(S6.done + 14, 360, 700),
    cam(S6.done + 40, 801, 1150, 1.06),
  ]);
  const dim = 0.5 * ramp(frame, 8, 22) * (1 - ramp(frame, S6.open, S6.open + 8));
  return (
    <Screen
      x={slide.x}
      camera={camera}
      dim={dim}
      overlay={
        <>
          <NotificationCard {...copy.staffPush} at={S6.push} until={S6.open + 2} />
          <TapRing x={CSS_W / 2} y={130} at={S6.open} />
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
    </Screen>
  );
}

/** 7. All on track: held on the status line, then a slow scroll past each person. */
function Shot7({ locale }: { locale: Locale }) {
  const dir = `shots/${locale}`;
  const slide = useSlideIn(0, 16, -1);
  const cues: Cue[] = [{ src: `${dir}/status.png`, at: 0, fade: 0 }];
  for (let i = 0; i < SCROLL_FRAMES; i++) cues.push({ src: `${dir}/scroll/${pad(i)}.jpg`, at: S7.scrollFrom + Math.round((S7.scrollLength * i) / SCROLL_FRAMES), fade: 0 });
  const camera = useCamera([cam(0, 172, 560, 1.18), cam(S7.scrollFrom - 8, 172, 560, 1.18), cam(S7.scrollFrom + 24, 330, 780), cam(S7.scrollFrom + S7.scrollLength, 330, 780)]);
  return (
    <Screen x={slide.x} camera={camera}>
      <ScreenTrack cues={cues} />
    </Screen>
  );
}

/** 8. Evening: the owner's one alert, the walk that wasn't done. */
function Shot8({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const camera = useCamera([cam(0, 330, 780), cam(S8.push - 4, 330, 780), cam(S8.push + 20, 130, 560, 1.1)]);
  return (
    <Screen camera={camera} dim={0.62 * ramp(frame, 0, 24)} overlay={<NotificationCard {...copy.ownerPush} at={S8.push} />}>
      <ScreenTrack cues={[{ src: `${dir}/scroll/${pad(SCROLL_FRAMES - 1)}.jpg`, at: 0, fade: 0 }]} />
    </Screen>
  );
}

/** Where to look on each glimpse. */
const GLIMPSE = { kitchen: cam(0, 330, 780), pets: cam(0, 390, 780), repairs: cam(0, 210, 640, 1.12) };

/** 9. Kitchen, Pets, Repairs: a beat or two each, read at a glance. */
function Shot9({ dir }: { dir: string }) {
  const camera = useCamera([
    { ...GLIMPSE.kitchen, at: 0 },
    { ...GLIMPSE.kitchen, at: S9.pets - 4 },
    { ...GLIMPSE.pets, at: S9.pets + 4 },
    { ...GLIMPSE.pets, at: S9.repairs - 4 },
    { ...GLIMPSE.repairs, at: S9.repairs + 4 },
  ]);
  return (
    <Screen camera={camera}>
      <ScreenTrack
        cues={[
          { src: `${dir}/glimpse-kitchen.png`, at: 0, fade: 6 },
          { src: `${dir}/glimpse-pets.png`, at: S9.pets - 3, fade: 6 },
          { src: `${dir}/glimpse-repairs.png`, at: S9.repairs - 3, fade: 6 },
        ]}
      />
    </Screen>
  );
}

function Outro({ line, last, lastCam }: { line: string; last: string; lastCam: Key }) {
  const frame = useCurrentFrame();
  const out = ramp(frame, 0, 14);
  const camera = useCamera([{ ...lastCam, at: 0 }]);
  return (
    <>
      <Screen camera={camera} opacity={1 - out}>
        <ScreenTrack cues={[{ src: last, at: 0, fade: 0 }]} />
      </Screen>
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
        <Rise>
          <KakakShot locale={locale} k={0} t={K15} startTyped aiTag={copy.aiTag} />
        </Rise>
      </Shot>
      <Shot span={Q.s5}>
        <StaffScreen t={STAFF15} />
      </Shot>
      <Shot span={Q.s7}>
        <Shot7Short dir={dir} />
      </Shot>
      <Shot span={Q.end}>
        <Outro line={copy.endLine15} last={`${dir}/status.png`} lastCam={cam(0, 172, 560, 1.18)} />
      </Shot>
    </>
  );
}

/** The screen rising in after the hook. */
function Rise({ children }: { children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const rise = ramp(frame, 0, 16);
  return <AbsoluteFill style={{ opacity: rise, transform: `translateY(${(1 - rise) * 80}px)` }}>{children}</AbsoluteFill>;
}

function Shot7Short({ dir }: { dir: string }) {
  const slide = useSlideIn(0, 12, -1);
  const camera = useCamera([cam(0, 172, 560, 1.18)]);
  return (
    <Screen x={slide.x} camera={camera}>
      <ScreenTrack cues={[{ src: `${dir}/status.png`, at: 0, fade: 0 }]} />
    </Screen>
  );
}
