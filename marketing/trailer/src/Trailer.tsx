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
  KB,
  NotificationCard,
  Screen,
  ScreenTrack,
  Shutter,
  TapRing,
  ramp,
  screenPoint,
} from "./components";
import { COPY, type Locale } from "./copy";
import { W } from "./theme";
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
 * The screen is exactly the frame's width (design lead, v3: never wider; at
 * that size the text is already as large as on a phone in the hand). The
 * camera pans: a key says which CSS row to look at (`fy`) and where on the
 * frame it lands (`y`). What must be read lands between 220 and about 1,180
 * px, above the screen's fade; the caption sits alone on the band below.
 * Only shot 1 uses a smaller screen (`scale` < 1, shifted `left`).
 */
type Key = { at: number; fy: number; y: number; scale: number; left: number };
const cam = (at: number, fy: number, y = 780, scale = 1, left?: number): Key => ({ at, fy, y, scale, left: left ?? (W - W * scale) / 2 });

function useCamera(keys: Key[]): Camera {
  const frame = useCurrentFrame();
  let i = keys.findIndex((k) => k.at > frame);
  if (i === -1) i = keys.length;
  const a = keys[Math.max(0, i - 1)];
  const b = keys[Math.min(keys.length - 1, i)];
  const t = a === b ? 1 : ramp(frame, a.at, b.at);
  const lerp = (p: number, q: number) => p + (q - p) * t;
  return { scale: lerp(a.scale, b.scale), fy: lerp(a.fy, b.fy), y: lerp(a.y, b.y), left: lerp(a.left, b.left) };
}

/** The screen sliding in from one side at the start of a shot. */
function useSlideIn(from: number, duration = 14, side: 1 | -1 = 1) {
  const frame = useCurrentFrame();
  const t = ramp(frame, from, from + duration);
  return { x: (1 - t) * 1080 * side };
}

function Shot({ span, children }: { span: Span; children: React.ReactNode }) {
  return (
    <Sequence from={span[0]} durationInFrames={len(span)} layout="none">
      {children}
    </Sequence>
  );
}

/** Where a confirm button lands: whole, above the fade. */
const BUTTON_Y = 1110;

/* ------------------------------------------------------------------ */
/* The owner's three sentences to Kakak                                */
/* ------------------------------------------------------------------ */

/** What follows each save: the toast on Today (status card out of view), or Kakak's "Done". */
const SAVED: Key[] = [cam(0, 609, 1080), cam(0, 470, 760), cam(0, 609, 1080)];

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
          // Sentences 2 and 3: the card's rows, switches and button together.
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

function staffCamera(t: StaffTimes, from: number) {
  const p = (k: string) => tap(`staff.${k}`);
  return [
    cam(from, p("card").y, 700),
    cam(t.sheet, p("card").y, 700),
    cam(t.sheet + 10, 490, 760),
    // The two finished photos, each with its tick and its time.
    cam(t.finish - 16, 490, 760),
    cam(t.finish - 4, p("finish").y, BUTTON_Y),
    cam(t.done + 4, p("finish").y, BUTTON_Y),
    // Done: the top of her list, one more done and the task gone (the toast
    // and the Lapor button at the bottom stay out of view).
    cam(t.done + 18, 300, 640),
  ];
}

function StaffScreen({ t, from = 0, fade = 1 }: { t: StaffTimes; from?: number; fade?: number }) {
  const cues: Cue[] = [
    { src: "shots/staff/list.png", at: 0, fade: 0 },
    { src: "shots/staff/sheet.png", at: t.sheet, fade: 8 },
    { src: "shots/staff/photo-before.png", at: t.beforeIn, fade: 4 },
    { src: "shots/staff/photo-after.png", at: t.afterIn, fade: 4 },
    { src: "shots/staff/done.png", at: t.done, fade: 9 },
  ];
  const p = (k: string) => tap(`staff.${k}`);
  const camera = useCamera(staffCamera(t, from));
  return (
    <Screen
      camera={camera}
      fade={fade}
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

/**
 * 5. The owner's phone beside Sari's: what was said to Kakak, and her list.
 * Then the camera pushes straight into Sari's phone: her screen grows from
 * its outline to the frame's width.
 */
const STAFF_PHONE = { left: 500, top: 300, screenW: 380 };
function Shot5({ locale }: { locale: Locale }) {
  const frame = useCurrentFrame();
  const owner = ramp(frame, 0, 10);
  const staffIn = ramp(frame, 4, 18);
  const push = ramp(frame, TWO_PHONES.until, TWO_PHONES.until + 14);
  // The full-bleed screen starts exactly over the outlined phone's screen.
  const start = screenPoint(cam(0, tap("staff.card").y, 700), 0, 0);
  const k0 = STAFF_PHONE.screenW / W; // outline screen ÷ frame width
  const b = Math.round(10 * (STAFF_PHONE.screenW / CSS_W));
  const insetTop = Math.round(22 * (STAFF_PHONE.screenW / CSS_W));
  const ox = STAFF_PHONE.left + b;
  const oy = STAFF_PHONE.top + b + insetTop - start.y * k0;
  const sc = k0 + (1 - k0) * push;
  return (
    <>
      <AbsoluteFill style={{ opacity: 1 - ramp(frame, TWO_PHONES.until, TWO_PHONES.until + 6) }}>
        <FramedPhone left={60} top={300 + (1 - owner) * 60} screenW={380} opacity={owner * (1 - push)}>
          <ScreenTrack cues={[{ src: `shots/${locale}/k0-card.png`, at: 0, fade: 0 }]} />
        </FramedPhone>
        <FramedPhone left={STAFF_PHONE.left + (1 - staffIn) * 300} top={STAFF_PHONE.top} screenW={STAFF_PHONE.screenW} bezel={STAFF_BEZEL} opacity={staffIn}>
          <ScreenTrack cues={[{ src: "shots/staff/list.png", at: 0, fade: 0 }]} />
        </FramedPhone>
      </AbsoluteFill>
      {frame >= TWO_PHONES.until && (
        <AbsoluteFill style={{ transform: `translate(${ox * (1 - push)}px, ${oy * (1 - push)}px) scale(${sc})`, transformOrigin: "0 0" }}>
          <StaffScreen t={STAFF60} from={TWO_PHONES.until + 14} fade={push} />
        </AbsoluteFill>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The trailer                                                         */
/* ------------------------------------------------------------------ */

/** Dark only for the night notification (shot 8). */
function eveningAt(frame: number, cut: "60" | "15") {
  if (cut === "15") return 0;
  const [c, d] = SHOTS_60.s8;
  return interpolate(frame, [c, c + 20, d - 8, d + 8], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
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

      {/* One caption per shot, alone on the band below the screen's fade. */}
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

/**
 * 1. Today, the status card out of view: Kakak's button, the tap, her sheet.
 * This shot alone uses a slightly smaller screen shifted left, so the whole
 * "Tell Kakak" pill stays clear of the right 160 px (design lead, v3).
 */
const SHOT1_SCALE = 0.82;
const SHOT1_LEFT = 40;
function Shot1({ locale }: { locale: Locale }) {
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const rise = ramp(frame, 0, 16);
  const open = tap(`${locale}.open`);
  const camera = useCamera([
    cam(0, open.y, 1110, SHOT1_SCALE, SHOT1_LEFT),
    cam(S1.sheet + 4, open.y, 1110, SHOT1_SCALE, SHOT1_LEFT),
    cam(S1.sheet + 20, 440, 820),
  ]);
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

/** 6. 17.00 on Sari's phone: the walk reminder, her tap, the photo on the walk, both dogs ticked, done. */
function Shot6({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const frame = useCurrentFrame();
  const walk = tap("staff.walk");
  const save = tap("staff.walkSave");
  const camera = useCamera([
    cam(0, 320, 760),
    cam(S6.push - 2, 320, 760),
    cam(S6.push + 12, 130, 560),
    cam(S6.open, 130, 560),
    cam(S6.open + 10, walk.y, 700),
    cam(S6.picked, walk.y, 700),
    // The photo and the two ticked dogs, then down to Simpan.
    cam(S6.picked + 10, 430, 760),
    cam(S6.save - 14, 430, 760),
    cam(S6.save - 4, save.y, BUTTON_Y),
    cam(S6.done, save.y, BUTTON_Y),
    // Done: the top of her list, every pet routine so far done.
    cam(S6.done + 14, 420, 700),
  ]);
  const dim = 0.4 * ramp(frame, 8, 22) * (1 - ramp(frame, S6.open, S6.open + 8));
  return (
    <Screen
      camera={camera}
      dim={dim}
      overlay={
        <>
          <NotificationCard {...copy.staffPush} at={S6.push} until={S6.open + 2} />
          <TapRing x={CSS_W / 2} y={130} at={S6.open} />
          <TapRing x={walk.x} y={walk.y} at={S6.camera} />
          <Shutter at={S6.picked - 2} />
          <TapRing x={save.x} y={save.y} at={S6.save} />
        </>
      }
    >
      <ScreenTrack
        cues={[
          { src: "shots/staff/walk-list.png", at: 0, fade: 0 },
          { src: "shots/staff/walk-picked.png", at: S6.picked, fade: 4 },
          { src: "shots/staff/walk-done.png", at: S6.done, fade: 8 },
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
  const camera = useCamera([cam(0, 172, 600), cam(S7.scrollFrom - 8, 172, 600), cam(S7.scrollFrom + 24, 330, 780), cam(S7.scrollFrom + S7.scrollLength, 330, 780)]);
  return (
    <Screen x={slide.x} camera={camera}>
      <ScreenTrack cues={cues} />
    </Screen>
  );
}

/** 8. Night: the owner's one alert, the 21.30 lights not done. */
function Shot8({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const frame = useCurrentFrame();
  const camera = useCamera([cam(0, 330, 780), cam(S8.push - 4, 330, 780), cam(S8.push + 20, 130, 560)]);
  return (
    <Screen camera={camera} dim={0.72 * ramp(frame, 0, 24)} overlay={<NotificationCard {...copy.ownerPush} at={S8.push} />}>
      <ScreenTrack cues={[{ src: `${dir}/scroll/${pad(SCROLL_FRAMES - 1)}.jpg`, at: 0, fade: 0 }]} />
    </Screen>
  );
}

/** Where to look on each glimpse. */
const GLIMPSE = { kitchen: cam(0, 330, 760), pets: cam(0, 400, 760), repairs: cam(0, 210, 620) };

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
        <Outro line={copy.endLine15} last={`${dir}/status.png`} lastCam={cam(0, 172, 600)} />
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
  const camera = useCamera([cam(0, 172, 600)]);
  return (
    <Screen x={slide.x} camera={camera}>
      <ScreenTrack cues={[{ src: `${dir}/status.png`, at: 0, fade: 0 }]} />
    </Screen>
  );
}

// KB is re-exported for scripts that reason about the screen's size.
export { KB };
