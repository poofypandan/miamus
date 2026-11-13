import React, { createContext, useContext } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import tapsJson from "../../public/shots/taps.json";
import { CX, FONT, SAFE } from "../theme";
import { BigLine, EndCard, NameChip, StaffChip, TravelLine } from "../ui/extras";
import { Hand, Pile } from "../ui/hook";
import { KakakMark } from "../ui/kakak";
import { Vignette, clamp01, ease, easeIn, easeOut, keys, lerp, ramp, springAt } from "../ui/kit";
import { type Cue, Glow, NotificationCard, Phone, type PhoneCam, ScreenTrack, Shutter, Tag, TapRing, look, phonePoint } from "../ui/phone";
import { World } from "../world/World";
import type { Cam } from "../world/camera";
import { lightAt } from "../world/tod";
import { COPY, type Locale } from "./copy";
import { ENDING, ENDING15, HOOK, HOOK15, KNOW, QUIET, S15, S60, SARI, SARI15, TELL, TELL15, len } from "./timeline";

const taps = tapsJson as Record<string, { x: number; y: number }>;
const tap = (key: string) => taps[key] ?? { x: 195, y: 422 };
const pad = (n: number) => String(n).padStart(2, "0");

/** The night the hook falls into, and the dawn that follows it. */
const NIGHT = "#0e0f24";

/**
 * The family's framing: the camera looks down a little, so the child, her
 * mother and the dogs stand in the middle of the frame, above the captions
 * and clear of the platforms' own buttons, with the kite high over them.
 */
const GARDEN: Cam = { x: -20, y: 340, z: 1.06 };
/** The child's call sits in the sky, left of the kite's string. */
const CALL = { x: 92, y: 452, size: 104 };

/** Kakak's voice, for the things that move with it: how loud she is this frame, and when each line is said. */
export const Voice = createContext<{ level: number; cue: (id: string) => { from: number; to: number } | null }>({ level: 0, cue: () => null });

export interface SceneProps {
  locale: Locale;
  /** The scene's first frame in the film: the world's wind and clouds run on the film's clock. */
  t0: number;
  /** The 15-second cut's shorter telling. */
  fast?: boolean;
}

/** The world out of focus, behind a phone. */
function Backdrop({ tod, frame, cam, blur = 22, wash = 0.08, people = 0 }: { tod: number; frame: number; cam?: Cam; blur?: number; wash?: number; people?: number }) {
  return (
    <>
      <World light={lightAt(tod)} frame={frame} cam={cam} blur={blur} laundry={clamp01((14.5 - tod) * 2) * clamp01((tod - 7) * 2)} child={people} dogs={people} kite={people} />
      {wash > 0 && <AbsoluteFill style={{ background: `rgba(255,250,242,${wash})` }} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 1. The hook: "Mama, look!" and everything that buries it            */
/* ------------------------------------------------------------------ */

export function Hook({ locale, t0, fast }: SceneProps) {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const T = fast ? HOOK15 : HOOK;
  const end = fast ? len(S15.hook) : len(S60.hook);
  const push = frame / end;
  const cam = { x: -24 * push, y: 328 + 20 * push, z: 1 + 0.07 * push };
  const cover = ramp(frame, T.at[2], T.slam);
  const out = ramp(frame, T.fall + 2, end - 2);
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <AbsoluteFill style={{ opacity: 1 - out }}>
        <World light={lightAt(17.62)} frame={frame + t0} cam={cam} child={1} dogs={1} kite={1} birds={1} />
        <Vignette />
        <Hand text={copy.child} {...CALL} at={T.call} />
        <AbsoluteFill style={{ background: `rgba(18,14,30,${(0.44 * cover).toFixed(3)})` }} />
      </AbsoluteFill>
      <Pile bubbles={copy.bubbles} slam={copy.slam} at={T.at} slamAt={T.slam} fall={T.fall} />
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* 2. The turn, before dawn                                            */
/* ------------------------------------------------------------------ */

export function Turn({ locale, t0 }: SceneProps) {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const voice = useContext(Voice);
  const total = len(S60.turn);
  const p = frame / total;
  const l2 = voice.cue("L2");
  const from = l2 ? l2.from - t0 : 93;
  const to = l2 ? l2.to - t0 : 170;
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <AbsoluteFill style={{ opacity: ramp(frame, 0, 28) }}>
        <World light={lightAt(lerp(4.75, 5.55, p))} frame={frame + t0} cam={{ x: 0, y: lerp(-440, -390, p), z: 1 }} />
        <Vignette />
      </AbsoluteFill>
      <BigLine rows={copy.big.rows} word={copy.big.word} from={from} to={to - 6} out={total - 7} />
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Kakak, at sunrise                                                */
/* ------------------------------------------------------------------ */

export function MeetKakak({ locale, t0 }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[locale];
  const voice = useContext(Voice);
  const total = len(S60.kakak);
  const p = frame / total;
  const out = ramp(frame, total - 16, total);
  const name = springAt(frame, fps, 24, { damping: 16, stiffness: 120 });
  const tag = springAt(frame, fps, 38, { damping: 15, stiffness: 150 });
  const gloss = ramp(frame, 52, 66);
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <World light={lightAt(lerp(5.55, 6.3, ease(p)))} frame={frame + t0} cam={{ x: 0, y: lerp(-390, -340, p), z: 1 }} />
      <Vignette strength={0.22} />
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE.right - SAFE.left, top: 420, transform: `translate(${CX - (SAFE.left + SAFE.right) / 2}px, ${-out * 50}px) scale(${1 - out * 0.06})`, opacity: 1 - out, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: FONT, color: "#fff", textAlign: "center" }}>
        <KakakMark size={320} at={2} level={voice.level} />
        <div style={{ marginTop: 44, fontSize: 132, fontWeight: 700, letterSpacing: -3.5, lineHeight: 1, opacity: Math.min(1, name * 1.5), transform: `translateY(${(1 - name) * 30}px)`, textShadow: "0 4px 34px rgba(40,16,40,0.45)" }}>Kakak</div>
        <div style={{ marginTop: 30, fontSize: 40, fontWeight: 600, letterSpacing: 0.2, padding: "13px 32px 15px", borderRadius: 999, background: "rgba(22,19,26,0.86)", opacity: Math.min(1, tag * 1.6), transform: `scale(${0.8 + 0.2 * tag})` }}>{copy.aiTag}</div>
        {copy.gloss && <div style={{ marginTop: 20, fontSize: 32, fontWeight: 600, padding: "9px 26px 11px", borderRadius: 999, background: "rgba(255,255,255,0.2)", opacity: gloss, textShadow: "0 1px 12px rgba(40,16,40,0.7)" }}>{copy.gloss}</div>}
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Tell her once: the owner's phone                                 */
/* ------------------------------------------------------------------ */

const SEND = { x: 350, y: 450 };
const CONFIRM = { x: 195, y: 668 };

export function Tell({ locale, t0, fast }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const rise = springAt(frame, fps, 0, { damping: 19, stiffness: 90, mass: 0.9 });
  const open = tap(`${locale}.open`);
  const cues: Cue[] = [];
  let cam: PhoneCam;
  let overlay: React.ReactNode;
  if (fast) {
    // The 15-second cut: the terrace sentence, already typed.
    const T = TELL15;
    cues.push({ src: `${dir}/k0-type-13.jpg`, at: 0, fade: 0 }, { src: `${dir}/k0-thinking.png`, at: T.send + 3, fade: 4 }, { src: `${dir}/k0-card.png`, at: T.card, fade: 8 });
    for (let i = 0; i < 14; i++) cues.push({ src: `${dir}/k0-scroll-${pad(i)}.jpg`, at: T.scroll[0] + Math.round(((T.scroll[1] - T.scroll[0]) * i) / 14), fade: 0 });
    cues.push({ src: `${dir}/k0-saved.png`, at: T.saved, fade: 8 });
    cam = keys(frame, [
      look(0, 2.35, 400, 720),
      look(T.card, 2.35, 400, 720),
      look(T.card + 10, 2.35, 262, 700),
      look(T.scroll[0], 2.35, 262, 700),
      look(T.scroll[1], 2.35, 548, 720),
      look(T.saved + 2, 2.35, 548, 720),
      look(T.saved + 12, 2.2, 660, 780),
    ]);
    const name = tap(`${locale}.k0.name`);
    overlay = (
      <>
        <Tag text={copy.aiTag} x={name.x + 8} y={name.y} from={T.card + 4} to={T.scroll[0] + 4} />
        <TapRing {...SEND} at={T.send} />
        <TapRing {...CONFIRM} at={T.ok} />
      </>
    );
  } else {
    const T = TELL;
    cues.push({ src: `${dir}/today.png`, at: 0, fade: 0 }, { src: `${dir}/k1-open.png`, at: T.sheet, fade: 8 });
    const n1 = 22;
    for (let i = 0; i < n1; i++) cues.push({ src: `${dir}/k1-type-${pad(i)}.jpg`, at: T.type1[0] + Math.round(((T.type1[1] - T.type1[0]) * i) / n1), fade: 0 });
    cues.push(
      { src: `${dir}/k1-thinking.png`, at: T.send1 + 3, fade: 4 },
      { src: `${dir}/k1-card.png`, at: T.card1, fade: 8 },
      { src: `${dir}/k1-saved.png`, at: T.saved1, fade: 8 },
      { src: `${dir}/k0-type-13.jpg`, at: T.cut2, fade: 6 },
      { src: `${dir}/k0-thinking.png`, at: T.send2 + 3, fade: 4 },
      { src: `${dir}/k0-card.png`, at: T.card2, fade: 8 }
    );
    for (let i = 0; i < 14; i++) cues.push({ src: `${dir}/k0-scroll-${pad(i)}.jpg`, at: T.scroll2[0] + Math.round(((T.scroll2[1] - T.scroll2[0]) * i) / 14), fade: 0 });
    cues.push({ src: `${dir}/k0-saved.png`, at: T.saved2, fade: 8 });
    cam = keys(frame, [
      // Today, from the top down to Kakak's button.
      look(0, 2.2, 190, 700),
      look(T.pan[0], 2.2, 190, 700),
      look(T.pan[1], 2.2, 660, 780),
      look(T.sheet + 2, 2.2, 660, 780),
      // Her sheet: the sentence being typed.
      look(T.sheet + 16, 2.35, 400, 720),
      look(T.card1, 2.35, 400, 720),
      // Her answer and the card's first rows; then down to the two switches and Save.
      look(T.card1 + 12, 2.35, 330, 700),
      look(T.down1[0], 2.35, 330, 700),
      look(T.down1[1], 2.35, 548, 720),
      look(T.saved1 + 2, 2.35, 548, 720),
      // Saved: her "Done", and the routine now in the list.
      look(T.saved1 + 12, 2.35, 520, 700),
      // The second sentence: a cut, as it is said again for something else.
      look(T.cut2 - 1, 2.35, 520, 700),
      look(T.cut2, 2.35, 400, 720),
      look(T.card2, 2.35, 400, 720),
      look(T.card2 + 10, 2.35, 262, 700),
      look(T.scroll2[0], 2.35, 262, 700),
      look(T.scroll2[1], 2.35, 548, 720),
      look(T.saved2 + 2, 2.35, 548, 720),
      look(T.saved2 + 11, 2.2, 660, 780),
    ]);
    overlay = (
      <>
        <TapRing x={open.x} y={open.y} at={T.tap} />
        <TapRing {...SEND} at={T.send1} />
        <Glow x={24} y={546} w={342} h={80} at={T.down1[1] + 2} until={T.save1 + 2} />
        <TapRing {...CONFIRM} at={T.save1} />
        <TapRing {...SEND} at={T.send2} />
        <TapRing {...CONFIRM} at={T.ok2} />
      </>
    );
  }
  cam.Y += (1 - rise) * 1500;
  return (
    <AbsoluteFill>
      <Backdrop tod={7.75} frame={frame + t0} cam={{ x: 0, y: 40, z: 1.04 }} />
      <Phone cam={cam} overlay={overlay}>
        <ScreenTrack cues={cues} />
      </Phone>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Everyone at home knows: the line to Sari's phone                 */
/* ------------------------------------------------------------------ */

const STAFF_BEZEL = "#8a8279";

export function Know({ locale, t0 }: SceneProps) {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const K = KNOW;
  // Her phone, up and to the left, on what she just saved; Sari's comes in lower right, on her list.
  const owner = keys<PhoneCam>(frame, [
    look(0, 2.2, 660, 780),
    look(K.apart[1], 1.35, 700, 600, { X: 240, ry: 10, rz: -3 }),
    look(K.push[0], 1.35, 700, 600, { X: 240, ry: 10, rz: -3 }),
    look(K.push[1], 1.2, 700, 540, { X: -460, ry: 16, rz: -7 }),
  ]);
  const sari = keys<PhoneCam>(frame, [
    look(0, 1.35, 300, 1040, { X: 1560, ry: -10, rz: 3 }),
    look(4, 1.35, 300, 1040, { X: 1560, ry: -10, rz: 3 }),
    look(K.apart[1] + 4, 1.35, 300, 860, { X: 760, ry: -10, rz: 3 }),
    look(K.push[0], 1.35, 300, 860, { X: 760, ry: -10, rz: 3 }),
    look(K.push[1], 2.35, 250, 700),
  ]);
  const from = phonePoint(owner, 195, 735);
  const to = phonePoint(sari, 195, 352);
  return (
    <AbsoluteFill>
      <Backdrop tod={lerp(7.9, 9, frame / len(S60.know))} frame={frame + t0} cam={{ x: 0, y: 40, z: 1.04 }} />
      <Phone cam={owner} fade={1 - ramp(frame, 0, 10)} opacity={1 - ramp(frame, K.push[0] + 4, K.push[1] - 6)}>
        <ScreenTrack cues={[{ src: `${dir}/k0-saved.png`, at: 0, fade: 0 }]} />
      </Phone>
      <Phone
        cam={sari}
        bezel={STAFF_BEZEL}
        overlay={
          <>
            <Glow x={16} y={290} w={358} h={124} at={K.line[1] - 2} until={len(S60.know) + 6} radius={18} />
            {copy.staffGloss && <Tag text={copy.staffGloss} x={24} y={139} from={K.push[1] + 2} to={len(S60.know)} tone="ink" />}
          </>
        }
      >
        <ScreenTrack cues={[{ src: "shots/staff/list.png", at: 0, fade: 0 }]} />
      </Phone>
      <NameChip x={owner.X} y={phonePoint(owner, 195, 844).y + 62} text={copy.you} from={K.apart[1] - 4} to={K.push[0] + 6} />
      <NameChip x={sari.X} y={phonePoint(sari, 195, 0).y - 56} text="Sari" from={K.apart[1] + 2} to={K.push[0] + 6} />
      <TravelLine from={from} to={to} start={K.line[0]} end={K.line[1]} />
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Sari: the terrace, with photos                                   */
/* ------------------------------------------------------------------ */

export function Sari({ locale, t0, fast }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = fast ? SARI15 : SARI;
  const p = (k: string) => tap(`staff.${k}`);
  const cam = keys<PhoneCam>(frame, [
    look(0, 2.35, 250, 700),
    look(T.sheet, 2.35, 250, 700),
    look(T.sheet + 12, 2.2, 480, 700),
    look(T.afterIn + 2, 2.2, 480, 700),
    // The two finished photos, each with its tick and its time.
    look(T.afterIn + 12, 2.2, 468, 700),
    look(T.finish - 14, 2.2, 468, 700),
    look(T.finish - 3, 2.2, 624, 700),
    look(T.done + 2, 2.2, 624, 700),
    // Done: her list again, and the note that says so.
    look(T.done + 14, 2.2, 690, 790),
  ]);
  if (fast) cam.Y += (1 - springAt(frame, fps, 0, { damping: 19, stiffness: 100, mass: 0.9 })) * 1500;
  const total = fast ? len(S15.sari) : len(S60.sari);
  return (
    <AbsoluteFill>
      <Backdrop tod={lerp(9, 9.5, frame / total)} frame={frame + t0} cam={{ x: 0, y: 40, z: 1.04 }} />
      <Phone
        cam={cam}
        bezel={STAFF_BEZEL}
        overlay={
          <>
            {!fast && <Glow x={16} y={290} w={358} h={124} at={-20} until={T.card + 8} radius={18} />}
            <TapRing x={p("card").x} y={p("card").y} at={T.card} />
            <TapRing x={p("before").x} y={p("before").y} at={T.before} />
            <TapRing x={p("after").x} y={p("after").y} at={T.after} />
            <TapRing x={p("finish").x} y={p("finish").y} at={T.finish} />
            <Shutter at={T.beforeIn - 2} />
            <Shutter at={T.afterIn - 2} />
          </>
        }
      >
        <ScreenTrack
          cues={[
            { src: "shots/staff/list.png", at: 0, fade: 0 },
            { src: "shots/staff/sheet.png", at: T.sheet, fade: 8 },
            { src: "shots/staff/photo-before.png", at: T.beforeIn, fade: 4 },
            { src: "shots/staff/photo-after.png", at: T.afterIn, fade: 4 },
            { src: "shots/staff/done.png", at: T.done, fade: 8 },
          ]}
        />
      </Phone>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* 7. The house through the day                                        */
/* ------------------------------------------------------------------ */

const PEOPLE = [
  { name: "Sari", x: 300, y: 896, done: 8, total: 8 },
  { name: "Yanti", x: 716, y: 822, done: 5, total: 6 },
  { name: "Budi", x: 262, y: 1078, done: 4, total: 4 },
  { name: "Joko", x: 716, y: 1050, done: 4, total: 5 },
];

export function Day({ locale, t0 }: SceneProps) {
  const frame = useCurrentFrame();
  const total = len(S60.day);
  const p = ease(clamp01(frame / (total - 14)));
  const tod = lerp(9.3, 16.5, p);
  const half = Math.round(tod * 2) / 2;
  const hh = Math.floor(half);
  const mm = half % 1 ? "30" : "00";
  const clock = locale === "en" ? `${((hh + 11) % 12) + 1}:${mm} ${hh < 12 ? "AM" : "PM"}` : `${pad(hh)}.${mm}`;
  const label = locale === "en" ? "House" : "Rumah";
  const o = ramp(frame, 0, 10) * (1 - ramp(frame, total - 10, total));
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <World
        light={lightAt(tod)}
        frame={frame * 3 + t0}
        cam={{ x: 0, y: 150, z: lerp(1, 1.06, frame / total) }}
        laundry={clamp01((14.4 - tod) * 1.5)}
        sprinkler={clamp01((tod - 9.6) * 2) * clamp01((12.2 - tod) * 2)}
        birds={0}
      />
      <Vignette strength={0.18} />
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE.right - SAFE.left, top: SAFE.top + 8, transform: `translateX(${CX - (SAFE.left + SAFE.right) / 2}px)`, textAlign: "center", opacity: o }}>
        <span style={{ display: "inline-block", fontFamily: FONT, fontSize: 64, fontWeight: 600, letterSpacing: -1, color: "#fff", fontVariantNumeric: "tabular-nums", textShadow: "0 3px 26px rgba(20,40,80,0.45)" }}>{clock}</span>
      </div>
      <div style={{ opacity: 1 - ramp(frame, total - 10, total) }}>
        {PEOPLE.map((s, i) => (
          <StaffChip key={s.name} {...s} label={label} at={8 + i * 11} until={68 + i * 8} />
        ))}
      </div>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Quiet, and the one notification                                  */
/* ------------------------------------------------------------------ */

export function Quiet({ locale, t0 }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const Q = QUIET;
  const cues: Cue[] = [{ src: `${dir}/status.png`, at: 0, fade: 0 }];
  for (let i = 0; i <= 40; i++) cues.push({ src: `${dir}/scroll/${pad(i)}.jpg`, at: Q.scroll[0] + Math.round(((Q.scroll[1] - Q.scroll[0]) * i) / 40), fade: 0 });
  const rise = springAt(frame, fps, 0, { damping: 19, stiffness: 90, mass: 0.9 });
  const cam = keys<PhoneCam>(frame, [
    look(0, 2.2, 250, 700),
    look(Q.scroll[0], 2.2, 250, 700),
    look(Q.scroll[1], 2.2, 300, 700),
    look(Q.sleep[0], 2.2, 300, 700),
    // Asleep: the whole phone, set down.
    look(Q.sleep[1] + 8, 1.42, 422, 730, { rz: -3 }),
    look(Q.ping, 1.42, 422, 730, { rz: -3 }),
    // The one notification, close enough to read.
    look(Q.ping + 22, 2.5, 150, 690),
    look(Q.away[0], 2.5, 150, 690),
    { ...look(Q.away[1], 2.3, 150, 2900, { rz: 9 }), ease: easeIn },
  ]);
  cam.Y += (1 - rise) * 1500;
  const sleep = ramp(frame, Q.sleep[0], Q.sleep[1]);
  const away = ramp(frame, Q.away[0], Q.away[1]);
  const tod = lerp(16.5, 17.64, ramp(frame, 40, 196));
  const worldCam: Cam = { x: lerp(0, GARDEN.x, away), y: lerp(40, GARDEN.y, away), z: lerp(1.04, GARDEN.z, away) };
  return (
    <AbsoluteFill>
      <Backdrop tod={tod} frame={frame + t0} cam={worldCam} blur={lerp(22, 0, ramp(frame, Q.away[0], Q.away[1] - 4))} wash={0.08 * (1 - away)} people={ramp(frame, Q.sleep[1], Q.ping)} />
      <Vignette strength={0.34 * away} />
      <Phone
        cam={cam}
        sleep={sleep}
        fade={1 - ramp(frame, Q.sleep[0], Q.sleep[0] + 12)}
        above={<NotificationCard {...copy.push} at={Q.ping} />}
      >
        <ScreenTrack cues={cues} />
      </Phone>
      <Hand text={copy.child} x={lerp(150, CALL.x, away)} y={lerp(1000, CALL.y, away)} size={CALL.size} at={Q.call} />
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* 9. The ending: the garden, Mama, the kite, the name                 */
/* ------------------------------------------------------------------ */

export function Ending({ locale, t0, fast }: SceneProps) {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const E = fast ? ENDING15 : ENDING;
  const tod = fast ? lerp(17.74, 18.42, ramp(frame, 24, 112, (t) => t)) : lerp(17.64, 18.42, ramp(frame, 30, 300, (t) => t));
  const cam = keys<Cam>(frame, [
    { at: 0, ...GARDEN },
    { at: E.crane[0], x: -16, y: 330, z: 1.05 },
    { at: E.crane[1], x: 0, y: -1150, z: 1 },
  ]);
  const walk = ramp(frame, E.mama[0], E.mama[1], (t) => 1 - (1 - t) * (1 - t));
  const lift = 0.3 * ramp(frame, E.lift[0], E.lift[1]);
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <World light={lightAt(tod)} frame={frame + t0} cam={cam} child={1} dogs={1} kite={1} mama={walk} kiteLift={lift} birds={1} />
      <Vignette />
      <Hand text={copy.child} {...CALL} at={fast ? 3 : -40} out={E.crane[0] + (fast ? 0 : 8)} />
      <EndCard line={copy.end.line} url={copy.end.url} mark={E.mark} name={E.name} lineAt={E.line} urlAt={E.url} />
    </AbsoluteFill>
  );
}

export { easeOut };
