import React, { createContext, useContext } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import tapsJson from "../../public/shots/taps.json";
import { CAPTION_BOTTOM, CLEAR, CX, FONT, HAND, SAFE, SERIF } from "../theme";
import { BUBBLE, SpeechBubble } from "../ui/bubble";
import { BigLine, EndCard, NameChip, StaffChip, TravelLine } from "../ui/extras";
import { Hand, Pile } from "../ui/hook";
import { KakakMark } from "../ui/kakak";
import { Vignette, clamp01, ease, easeIn, easeOut, keys, lerp, ramp, springAt } from "../ui/kit";
import { type Cue, Glow, NotificationCard, Phone, type PhoneCam, ScreenTrack, Shutter, Tag, TapRing, TypedInput, SpokenInput, look, phonePoint } from "../ui/phone";
import { World } from "../world/World";
import { type Cam, H, camMix, project } from "../world/camera";
import { lightAt } from "../world/tod";
import { COPY, type Locale } from "./copy";
import { CARDS, CARDS15, ENDING, ENDING15, FPS, HOOK, HOOK15, QUIET, S15, S60, SARI15, STAFF, type Span, TELL, TELL15, len } from "./timeline";
import { CaptureCard, ListeningPulse, Thumb } from "../ui/cards";
import { MamaSays } from "../stills/kit";
import voData from "./vo-data.json";

/** v15, the brand lock: the frame (in the scene) where she says "Miamus", from the end line's measured onset. */
function brandFrame(fast: boolean | undefined, locale: Locale, t0: number, fallback: number) {
  const cut = (voData as unknown as Record<string, { cues: { id: string; onset?: number }[] }>)[`${fast ? "15" : "60"}-${locale}`];
  const onset = cut?.cues.find((c) => c.id === (fast ? "S3" : "L11"))?.onset;
  return onset === undefined ? fallback : Math.round(onset * FPS) - t0;
}

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
export const CALL = { x: 92, y: 452, size: 104 };

/** Kakak's voice, for the things that move with it: how loud she is this frame, and when each line is said. */
export const Voice = createContext<{ level: number; pulse?: number; cue: (id: string) => { from: number; to: number } | null }>({ level: 0, pulse: 0, cue: () => null });

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

/** v6: one tug at `t`: her hand reaches Mama's dress, she leans back, Mama sways toward her and springs back. */
function tugAt(frame: number, t: number) {
  const reach = ramp(frame, t, t + 3, easeOut) * (1 - ramp(frame, t + 8, t + 13));
  const pull = ramp(frame, t + 2, t + 4, easeOut) * (1 - ramp(frame, t + 5, t + 10));
  const after = frame - (t + 4);
  const sway = after < 0 ? 0 : 3 * Math.exp(-after / 5) * Math.cos(after * 0.55);
  return { reach, lean: 6 * pull, sway };
}

/** v6: the girl's pose and Mama's sway for a set of tugs, then the point (with a bounce) and the arm coming down. */
function girlMoves(frame: number, tugs: number[], point: number, down: Span) {
  let tug = 0;
  let lean = 0;
  let sway = 0;
  for (const t of tugs) {
    const m = tugAt(frame, t);
    tug = Math.max(tug, m.reach);
    lean += m.lean;
    sway += m.sway;
  }
  const up = ramp(frame, point, point + 5, easeOut) * (1 - ramp(frame, down[0], down[1], ease));
  const since = frame - (point + 5);
  const hop = since < 0 ? 0 : Math.abs(Math.sin(since * 0.42)) * 9 * Math.exp(-since / 26) * up;
  return { child: { tug, point: up, lean, hop }, sway };
}

/** v10: the listening screen's typing box and Stop button, in the app's CSS px (measured from the captures). */
const LISTEN_GEO: Record<Locale, { text: number; button: number; stop: number }> = {
  en: { text: 381.3, button: 388.3, stop: 209 },
  id: { text: 401.3, button: 408.3, stop: 212 },
};

/** Where Mama's phone is in the world when she holds it up by her head (Figures: her eye-shading hand). */
const PHONE_AT = { x: 263, y: 1199 };

/**
 * v6 (Fable's framing): the close two-shot, from behind. The garden at about 3x, so Mama is ~800 px tall; the pair
 * centred at x 490, heads below y 330, feet above y 1150; her phone's glow near (300, 400).
 */
const TWO_SHOT: Cam = { x: -218, y: 469, z: 2.98 };
/** Where the pair is in that shot, for the background blur's sharp centre. */
const PAIR = { x: 490, y: 750, rx: 310, ry: 540 };
/** Her call, on two lines, in the free sky right of Mama and above the girl. */
const CALL_TWO = { x: 540, y: 400, size: 104 };

/** The world with its background softened (4–6 px) and the family sharp: a blurred pass, and a sharp pass masked to the pair. */
function SoftWorld({ soft, ...props }: React.ComponentProps<typeof World> & { soft: number }) {
  if (soft < 0.1) return <World {...props} />;
  const mask = `radial-gradient(ellipse ${PAIR.rx}px ${PAIR.ry}px at ${PAIR.x}px ${PAIR.y}px, #000 60%, transparent 100%)`;
  return (
    <>
      {/* A2: the blurred copy is drawn a little larger, so its soft edge never shows the night behind it (a thin dark line). */}
      <AbsoluteFill style={{ filter: `blur(${soft.toFixed(2)}px)`, transform: "scale(1.03)" }}>
        <World {...props} />
      </AbsoluteFill>
      <AbsoluteFill style={{ WebkitMaskImage: mask, maskImage: mask }}>
        <World {...props} />
      </AbsoluteFill>
    </>
  );
}

/** Her "Mama, look!" on two lines, written on with the bell's three notes: "Ma-ma," over two, "look!" on the third. */
function CallTwo({ lines, x, y, size, at, out }: { lines: [string, string]; x: number; y: number; size: number; at: number; out?: number }) {
  return (
    <>
      <Hand text={lines[0]} x={x} y={y} size={size} at={at} dur={19} out={out} rot={-4} />
      <Hand text={lines[1]} x={x + size * 0.35} y={y + size * 1.08} size={size} at={at + 20} dur={9} out={out} rot={-4} />
    </>
  );
}

/** "In a minute, sweetie…" → two lines, broken after the first comma. */
const splitAtComma = (t: string) => {
  const i = t.indexOf(", ");
  return i < 0 ? [t] : [t.slice(0, i + 1), t.slice(i + 2)];
};

/** v17: where the girl's and Mama's heads are in the garden (the family's layer, depth 0.92), for the bubbles' tails. */
const GIRL_HEAD = { x: 370, y: 1292 };
const MAMA_HEAD = { x: 284, y: 1170 };
const head = (cam: Cam, p: { x: number; y: number }) => project(cam, 0.92, p.x, p.y);
/** The girl's bubble: in the close two-shot, up in the sky right of Mama; in the wide shot, above and right of her. */
const GIRL_BUBBLE = { two: { cx: 726, cy: 470, w: 390, h: 250 }, wide: { cx: 700, cy: 770, w: 372, h: 236 } };
/** Mama's bubble (wide shot only): up and left, above her head, beside the girl's. */
const MAMA_BUBBLE = { cx: 296, cy: 600, w: 440, h: 214 };

/** A line of the girl's handwriting inside a bubble, writing itself on. */
function Written({ text, at, dur, size }: { text: string; at: number; dur: number; size: number }) {
  const frame = useCurrentFrame();
  const w = ramp(frame, at, at + dur, easeOut);
  return (
    <div style={{ fontFamily: HAND, fontWeight: 600, fontSize: size, lineHeight: 1.04, whiteSpace: "nowrap", transform: "rotate(-3deg)", clipPath: `inset(-30% ${((1 - w) * 104).toFixed(2)}% -30% -6%)` }}>
      {text}
    </div>
  );
}

/** v17: her "Mama, look!" in a speech bubble, the words written on with the bell's three notes, the tail to her head. */
function GirlBubble({ lines, at, out, cam, box }: { lines: [string, string]; at: number; out?: number; cam: Cam; box: { cx: number; cy: number; w: number; h: number } }) {
  return (
    <SpeechBubble {...box} to={head(cam, GIRL_HEAD)} at={at - 3} out={out}>
      <Written text={lines[0]} at={at} dur={19} size={90} />
      <div style={{ marginLeft: 70 }}>
        <Written text={lines[1]} at={at + 20} dur={9} size={90} />
      </div>
    </SpeechBubble>
  );
}

export function Hook({ locale, t0, fast }: SceneProps) {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const voice = useContext(Voice);
  const T = fast ? HOOK15 : HOOK;
  const end = fast ? len(S15.hook) : len(S60.hook);
  const push = frame / end;
  // The close two-shot, then one move back and up along her arm and the string until the kite is in frame.
  const wide: Cam = { x: -30 * push, y: 300 + 16 * push, z: 1.02 + 0.05 * push };
  const pulled = ramp(frame, T.pull[0], T.pull[1], ease);
  const cam = camMix({ ...TWO_SHOT, x: TWO_SHOT.x + 3 * push }, wide, pulled);
  const cover = ramp(frame, T.at[2], T.slam);
  const out = ramp(frame, T.fall + 2, end - 2);
  const moves = girlMoves(frame, T.tugs, T.point, T.armDown);
  // The phone's cool light flickers with every question that leaves it.
  let flick = 0;
  for (const a of T.at) if (frame >= a) flick += Math.exp(-(frame - a) / 3);
  const phone = Math.min(1, 0.72 + 0.28 * Math.min(1, flick));
  const origin = project(cam, 0.92, PHONE_AT.x, PHONE_AT.y);
  const mama = voice.cue("M1");
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <AbsoluteFill style={{ opacity: 1 - out }}>
        <SoftWorld soft={5 * (1 - pulled)} light={lightAt(17.62)} frame={frame + t0} cam={cam} child={1} mama={1} mamaPose={{ shade: 1, phone, sway: moves.sway }} childPose={moves.child} dogs={1} kite={1} birds={1} />
        <Vignette />
        <AbsoluteFill style={{ background: `rgba(18,14,30,${(0.44 * cover).toFixed(3)})` }} />
      </AbsoluteFill>
      {/* v17: her call in a speech bubble, written on with the bell beside her raised arm; it follows the camera back. */}
      <GirlBubble lines={copy.call} cam={cam} at={T.bell} out={T.fall - 2} box={{ cx: lerp(GIRL_BUBBLE.two.cx, GIRL_BUBBLE.wide.cx, pulled), cy: lerp(GIRL_BUBBLE.two.cy, GIRL_BUBBLE.wide.cy, pulled), w: lerp(GIRL_BUBBLE.two.w, GIRL_BUBBLE.wide.w, pulled), h: lerp(GIRL_BUBBLE.two.h, GIRL_BUBBLE.wide.h, pulled) }} />
      {/* v17: Mama's "In a minute, sweetie…" in her own bubble, from her first word, rising above her head (60 s only). */}
      {!fast && mama && (
        <SpeechBubble {...MAMA_BUBBLE} to={head(cam, MAMA_HEAD)} at={mama.from} out={T.fall - 2}>
          {splitAtComma(copy.lines.M1).map((l, i) => (
            <div key={i} style={{ fontFamily: FONT, fontWeight: 600, fontSize: 60, lineHeight: 1.12, letterSpacing: -0.4 }}>{l}</div>
          ))}
        </SpeechBubble>
      )}
      {/* The questions pile up and bury both bubbles: mother and daughter, trying to talk under the notifications. */}
      <Pile bubbles={copy.bubbles} slam={copy.slam} at={T.at} slamAt={T.slam} fall={T.fall} from={{ x: origin.x, y: origin.y }} />
      {/* Her last, small "Mama…?", on top of the pile, unanswered (60 s only). */}
      {!fast && (
        <SpeechBubble cx={598} cy={936} w={300} h={128} to={head(cam, GIRL_HEAD)} at={110} out={128} radius={52}>
          <Written text={copy.lines.G3} at={110} dur={8} size={66} />
        </SpeechBubble>
      )}
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
  // v17: the centre is only her mark, her name and what she says; the AI disclosure is a quiet footnote at the
  // bottom, on screen for her whole line. Name, line and footnote arrive as she starts speaking.
  const l3 = voice.cue("L3");
  const from = l3 ? l3.from - t0 : 4;
  const to = l3 ? l3.to - t0 : total - 10;
  const name = springAt(frame, fps, 4, { damping: 16, stiffness: 120 });
  const line = ramp(frame, from - 3, from + 9, easeOut);
  const note = ramp(frame, from, from + 12, easeOut);
  const words = copy.lines.L3.split(" ");
  const letters = words.reduce((n, w) => n + w.length + 1, 0);
  let acc = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      <World light={lightAt(lerp(5.55, 6.3, ease(p)))} frame={frame + t0} cam={{ x: 0, y: lerp(-390, -340, p), z: 1 }} />
      <Vignette strength={0.22} />
      <div style={{ position: "absolute", left: SAFE.left, width: SAFE.right - SAFE.left, top: 420, transform: `translate(${CX - (SAFE.left + SAFE.right) / 2}px, ${-out * 50}px) scale(${1 - out * 0.06})`, opacity: 1 - out, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: FONT, color: "#fff", textAlign: "center" }}>
        <KakakMark size={320} at={2} level={voice.level} pulse={voice.pulse} />
        <div style={{ marginTop: 44, fontSize: 132, fontWeight: 700, letterSpacing: -3.5, lineHeight: 1, opacity: Math.min(1, name * 1.5), transform: `translateY(${(1 - name) * 30}px)`, textShadow: "0 4px 34px rgba(40,16,40,0.45)" }}>
          Kakak<span style={{ fontSize: 64, fontWeight: 600, verticalAlign: "62%", marginLeft: 4, opacity: 0.85 }}>*</span>
        </div>
        <div style={{ marginTop: 34, maxWidth: 800, fontSize: 64, fontWeight: 600, lineHeight: 1.2, letterSpacing: -0.7, opacity: line, transform: `translateY(${(1 - line) * 16}px)`, textShadow: "0 2px 6px rgba(30,12,30,0.55), 0 4px 30px rgba(30,12,30,0.6)", textWrap: "balance" } as React.CSSProperties}>
          {words.map((w, i) => {
            const at = from + ((acc / letters) * (to - from)) * 0.92;
            acc += w.length + 1;
            const lit = 0.66 + 0.34 * ramp(frame, at - 2, at + 4);
            return (
              <span key={i} style={{ opacity: lit }}>
                {w}
                {i < words.length - 1 ? " " : ""}
              </span>
            );
          })}
        </div>
      </div>
      <Footnote text={copy.footnote} opacity={note * (1 - out)} />
    </AbsoluteFill>
  );
}

/** v17: the AI disclosure, small and quiet but clear: a soft dark pill at the bottom of the safe area. */
function Footnote({ text, opacity, bottom = H - CAPTION_BOTTOM + 8 }: { text: string; opacity: number; bottom?: number }) {
  if (opacity <= 0) return null;
  return (
    <div style={{ position: "absolute", left: SAFE.left, width: SAFE.right - SAFE.left, bottom, transform: `translateX(${CX - (SAFE.left + SAFE.right) / 2}px)`, display: "flex", justifyContent: "center", opacity }}>
      <div style={{ fontFamily: FONT, fontSize: 32, fontWeight: 600, letterSpacing: 0.1, color: "rgba(255,255,255,0.94)", padding: "10px 24px 12px", borderRadius: 999, background: "rgba(22,19,26,0.62)" }}>{text}</div>
    </div>
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
  // v8: the finished-sentence screenshot is the base (the input already two lines tall); TypedInput types over it.
  const typed = (at: number, from: number, until: number, start = 0) => {
    cues.push({ src: `${dir}/k0-sheet-empty.png`, at, fade: at === 0 ? 0 : 12 });
    return <TypedInput lines={copy.typed.lines} placeholder={copy.typed.placeholder} from={from} until={until} start={start} darkButton={`${dir}/k0-send-dark.png`} appear={at === 0 ? undefined : at} />;
  };
  const scrolling = (span: Span) => {
    for (let i = 0; i < 14; i++) cues.push({ src: `${dir}/k0-scroll-${pad(i)}.jpg`, at: span[0] + Math.round(((span[1] - span[0]) * i) / 13), fade: 0 });
  };
  if (fast) {
    // 15 s: one interaction, then one result. The terrace sentence typed, the card held, "Looks right", "Saved".
    const T = TELL15;
    // v8: no "thinking" screen (the app's half-height sheet made a double exposure); the full sheet cross-fades
    // straight to the card, and the typed text leaves with that cross-fade.
    const input = typed(0, T.type[0], T.card, copy.typed.start15);
    cues.push({ src: `${dir}/k0-card.png`, at: T.card, fade: 12 });
    scrolling(T.scroll);
    cues.push({ src: `${dir}/k0-saved.png`, at: T.saved, fade: 12 });
    cam = keys(frame, [
      look(0, 2.35, 400, 720),
      look(T.toCard[0], 2.35, 400, 720),
      look(T.toCard[1], 2.35, 262, 700),
      look(T.scroll[1] + 1, 2.35, 262, 700),
      look(T.ok - 3, 2.35, 566, 720),
    ]);
    const name = tap(`${locale}.k0.name`);
    overlay = (
      <>
        {input}
        <Tag text={copy.aiTag} x={name.x + 8} y={name.y} from={T.card + 4} to={T.scroll[0]} />
        <TapRing {...SEND} at={T.send} />
        <TapRing {...CONFIRM} at={T.ok} />
      </>
    );
  } else {
    // 60 s (v10, the owner): Mama says the sentence to Kakak. The real listening screen (capture/listen.capture.ts),
    // her words appearing as she speaks, then Stop, then the card. One change at a time.
    const T = TELL;
    const geo = LISTEN_GEO[locale];
    cues.push({ src: `${dir}/k0-open-clean.png`, at: 0, fade: 0 }, { src: `${dir}/k0-listen-base.png`, at: T.listen, fade: 4 });
    cues.push({ src: `${dir}/k0-card.png`, at: T.card, fade: 12 });
    scrolling(T.scroll);
    cues.push({ src: `${dir}/k0-saved.png`, at: T.saved, fade: 12 });
    cam = keys(frame, [
      look(0, 2.35, 300, 690),
      look(T.toCard[0], 2.35, 300, 690),
      look(T.toCard[1], 2.35, 262, 700),
      look(T.toOk[0], 2.35, 262, 700),
      look(T.toOk[1], 2.35, 566, 720),
      look(T.saved + 10, 2.35, 566, 720),
      look(T.saved + 22, 2.2, 660, 780),
    ]);
    const mic = tap(`${locale}.mic`);
    const words = copy.spoken.words.map(([text, t]) => ({ text, at: T.said + Math.round((t + 0.12) * 30) }));
    overlay = (
      <>
        <SpokenInput words={words} split={copy.spoken.split} top={geo.text} button={{ x: 325.3, y: geo.button, size: 49.3, src: `${dir}/k0-listen-send.png` }} until={T.card} appear={T.listen} />
        <TapRing x={mic.x} y={mic.y} at={T.tap} />
        <TapRing x={195} y={geo.stop} at={T.stop} />
        <TapRing {...CONFIRM} at={T.ok} />
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
/* 5. The staff beat: the line to Sari's phone, and her finishing it    */
/* ------------------------------------------------------------------ */

const STAFF_BEZEL = "#8a8279";

/** v6: the two-phone shot and Sari's phone, merged into one beat (60 s). */
export function Staff({ locale, t0 }: SceneProps) {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const K = STAFF;
  const p = (k: string) => tap(`staff.${k}`);
  // Her phone moves up and left on what she just saved; Sari's comes in lower right, on her list.
  const owner = keys<PhoneCam>(frame, [
    look(0, 2.2, 660, 780),
    look(K.apart[1], 1.35, 700, 600, { X: 240, ry: 10, rz: -3 }),
    look(K.push[0], 1.35, 700, 600, { X: 240, ry: 10, rz: -3 }),
    look(K.push[1], 1.2, 700, 540, { X: -460, ry: 16, rz: -7 }),
  ]);
  const sari = keys<PhoneCam>(frame, [
    look(0, 1.35, 300, 1040, { X: 1560, ry: -10, rz: 3 }),
    look(K.apart[1], 1.35, 300, 860, { X: 760, ry: -10, rz: 3 }),
    look(K.push[0], 1.35, 300, 860, { X: 760, ry: -10, rz: 3 }),
    look(K.push[1], 2.35, 250, 700),
    look(K.toPhotos[0], 2.35, 250, 700),
    look(K.toPhotos[1], 2.2, 480, 700),
    look(K.toFinish[0], 2.2, 480, 700),
    look(K.toFinish[1], 2.2, 624, 700),
    look(K.toDone[0], 2.2, 624, 700),
    look(K.toDone[1], 2.2, 690, 790),
  ]);
  const from = phonePoint(owner, 195, 735);
  const to = phonePoint(sari, 195, 352);
  return (
    <AbsoluteFill>
      <Backdrop tod={lerp(7.9, 9.5, frame / 348)} frame={frame + t0} cam={{ x: 0, y: 40, z: 1.04 }} />
      <Phone cam={owner} fade={1 - ramp(frame, 0, 10)} opacity={1 - ramp(frame, K.push[0] + 4, K.push[1] - 6)}>
        <ScreenTrack cues={[{ src: `${dir}/k0-saved.png`, at: 0, fade: 0 }]} />
      </Phone>
      <Phone
        cam={sari}
        bezel={STAFF_BEZEL}
        overlay={
          <>
            <Glow x={16} y={290} w={358} h={124} at={K.line[1] - 2} until={K.card + 6} radius={18} />
            <TapRing x={p("card").x} y={p("card").y} at={K.card} />
            <TapRing x={p("before").x} y={p("before").y} at={K.before} />
            <TapRing x={p("after").x} y={p("after").y} at={K.after} />
            <TapRing x={p("finish").x} y={p("finish").y} at={K.finish} />
            <Shutter at={K.beforeIn - 2} />
            <Shutter at={K.afterIn - 2} />
          </>
        }
      >
        <ScreenTrack
          cues={[
            { src: "shots/staff/list.png", at: 0, fade: 0 },
            { src: "shots/staff/sheet.png", at: K.sheet, fade: 12 },
            { src: "shots/staff/photo-before.png", at: K.beforeIn, fade: 8 },
            { src: "shots/staff/photo-after.png", at: K.afterIn, fade: 8 },
            { src: "shots/staff/done.png", at: K.done, fade: 12 },
          ]}
        />
      </Phone>
      <NameChip x={owner.X} y={phonePoint(owner, 195, 844).y + 62} text={copy.you} from={K.apart[1] - 4} to={K.push[0] + 6} />
      <NameChip x={sari.X} y={phonePoint(sari, 195, 0).y - 56} text="Sari" from={K.apart[1] + 2} to={K.push[0] + 6} />
      <TravelLine from={from} to={to} start={K.line[0]} end={K.line[1]} />
    </AbsoluteFill>
  );
}

/** 15 s: Sari's list with "Pel teras" highlighted and a slow push; no taps, no photos. */
export function Sari({ t0 }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const T = SARI15;
  const cam = keys<PhoneCam>(frame, [look(0, 2.2, 300, 760), look(T.push[1], 2.42, 330, 740)]);
  cam.Y += (1 - springAt(frame, fps, 0, { damping: 19, stiffness: 100, mass: 0.9 })) * 1500;
  return (
    <AbsoluteFill>
      <Backdrop tod={lerp(9, 9.4, frame / 60)} frame={frame + t0} cam={{ x: 0, y: 40, z: 1.04 }} />
      <Phone cam={cam} bezel={STAFF_BEZEL} overlay={<Glow x={16} y={290} w={358} h={124} at={T.glow} until={60 + 6} radius={18} />}>
        <ScreenTrack cues={[{ src: "shots/staff/list.png", at: 0, fade: 0 }]} />
      </Phone>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* 8. Quiet, and the one notification                                  */
/* ------------------------------------------------------------------ */

/** v7: the time on the sleeping phone's dark screen, 4:30 to 5:30 PM in an hour of the film's seconds; nothing else arrives. */
function DarkClock({ locale, from, to }: { locale: Locale; from: number; to: number }) {
  const frame = useCurrentFrame();
  const o = ramp(frame, from - 8, from + 6);
  if (o <= 0) return null;
  const minutes = 16 * 60 + 30 + Math.round(60 * ramp(frame, from, to, (t) => t));
  const h = Math.floor(minutes / 60);
  const m = pad(minutes % 60);
  const text = locale === "en" ? `${((h + 11) % 12) + 1}:${m}` : `${pad(h)}.${m}`;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 150, textAlign: "center", fontFamily: FONT, fontSize: 76, fontWeight: 300, letterSpacing: -2, color: "rgba(236,238,245,0.78)", fontVariantNumeric: "tabular-nums", opacity: o }}>
      {text}
    </div>
  );
}

export function Quiet({ locale, t0 }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const Q = QUIET;
  const rise = springAt(frame, fps, 0, { damping: 19, stiffness: 90, mass: 0.9 });
  // "All on track" as one still with a slow push-in; then one change at a time: sleep, set down, the hour passing.
  const cam = keys<PhoneCam>(frame, [
    look(0, 2.2, 250, 700),
    look(Q.push[1], 2.36, 262, 700),
    look(Q.set[0], 2.36, 262, 700),
    look(Q.set[1], 1.42, 422, 730, { rz: -3 }),
    // v7: set down, dark, and a slow drift closer while nothing arrives.
    look(Q.away[0], 1.56, 422, 730, { rz: -3 }),
    { ...look(Q.away[1], 1.5, 422, 2900, { rz: 6 }), ease: easeIn },
  ]);
  cam.Y += (1 - rise) * 1500;
  const sleep = ramp(frame, Q.sleep[0], Q.sleep[1]);
  const away = ramp(frame, Q.away[0], Q.away[1]);
  const tod = lerp(16.5, 17.64, ramp(frame, 0, Q.away[0]));
  const worldCam: Cam = { x: lerp(0, GARDEN.x, away), y: lerp(40, GARDEN.y, away), z: lerp(1.04, GARDEN.z, away) };
  return (
    <AbsoluteFill>
      <Backdrop tod={tod} frame={frame + t0} cam={worldCam} blur={lerp(22, 0, ramp(frame, Q.away[0], Q.away[1] - 4))} wash={0.08 * (1 - away)} people={ramp(frame, Q.set[0], Q.set[1] + 20)} />
      <Vignette strength={0.34 * away} />
      <Phone cam={cam} sleep={sleep} fade={1 - ramp(frame, Q.sleep[0], Q.sleep[0] + 12)} above={<DarkClock locale={locale} from={Q.clock[0]} to={Q.clock[1]} />}>
        <ScreenTrack cues={[{ src: `${dir}/status.png`, at: 0, fade: 0 }]} />
      </Phone>
    </AbsoluteFill>
  );
}

/* ------------------------------------------------------------------ */
/* v11. Cards: the phone once, then one key element at a time          */
/* ------------------------------------------------------------------ */

/** Where each card comes from in the real captures (CSS px), and its key line for the terracotta ring. */
const CARD_REGIONS = {
  listen: { en: { x: 14, y: 130, w: 362, h: 312 }, id: { x: 14, y: 130, w: 362, h: 332 } },
  suggest: { en: { x: 10, y: 198, w: 370, h: 238 }, id: { x: 10, y: 178, w: 370, h: 238 } },
  suggestRing: { en: { x: 22, y: 308, w: 346, h: 74 }, id: { x: 22, y: 288, w: 346, h: 74 } },
  saved: { x: 12, y: 702, w: 366, h: 66 },
  // v11: Sari's card with her real list header above it (her day), so it fills the frame with meaning, not decoration.
  sari: { x: 12, y: 66, w: 366, h: 352 },
  done: { x: 16, y: 777, w: 357, h: 49 },
  // "All on track" with the day's progress under it.
  track: { x: 12, y: 167, w: 366, h: 428 },
};
const PHOTO_BEFORE = { x: 28, y: 388, w: 88, h: 84 };
const PHOTO_AFTER = { x: 28, y: 574, w: 88, h: 84 };

export function Cards({ locale, t0, fast }: SceneProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[locale];
  const dir = `shots/${locale}`;
  const total = fast ? len(S15.cards) : len(S60.cards);
  // The day passes behind the cards: morning to late afternoon, softly blurred; at the end the garden comes into focus.
  const C = CARDS;
  // v12: the garden comes into focus in the ending scene (one continuous move), so the cards end on the blurred day.
  const toGarden = 0;
  const tod = fast ? lerp(7.8, 9.4, frame / total) : lerp(7.75, 17.62, ramp(frame, 0, total));
  const worldCam: Cam = { x: lerp(0, -30, toGarden), y: lerp(40, 300, toGarden), z: lerp(1.04, 1.02, toGarden) };
  const S = fast ? CARDS15 : CARDS;
  return (
    <AbsoluteFill>
      <Backdrop tod={tod} frame={frame + t0} cam={worldCam} blur={22} wash={0.08} people={toGarden} />
      {!fast && <PhoneOnce locale={locale} />}
      {!fast && (
        <CaptureCard src={`${dir}/k0-listen-base.png`} region={CARD_REGIONS.listen[locale]} at={C.listen.at} out={C.listen.out} tag={copy.tags.you}>
          <ListeningPulse x={195} y={locale === "en" ? 209 : 212} from={C.listen.at} until={C.listen.out + 12} />
          <SpokenInput
            words={copy.spoken.words.map(([text, t]) => ({ text, at: C.listen.words + Math.round((t + 0.12) * fps) }))}
            split={copy.spoken.split}
            top={LISTEN_GEO[locale].text}
            button={{ x: 325.3, y: LISTEN_GEO[locale].button, size: 49.3, src: `${dir}/k0-listen-send.png` }}
            until={C.listen.out + 12}
          />
        </CaptureCard>
      )}
      {/* Kakak's card; once confirmed, "Saved" arrives under it. */}
      <CaptureCard
        src={`${dir}/k0-card.png`}
        region={CARD_REGIONS.suggest[locale]}
        at={S.suggest.at}
        out={S.saved.out}
        tag={copy.tags.you}
        check={S.suggest.check}
        fadeBottom
        below={{
          src: `${dir}/k0-saved.png`,
          region: CARD_REGIONS.saved,
          at: S.saved.at,
          check: S.saved.check,
          children: <Glow x={16} y={706} w={358} h={58} at={S.saved.ring} until={S.saved.out + 14} radius={14} />,
        }}
      >
        <Glow {...CARD_REGIONS.suggestRing[locale]} at={S.suggest.ring} until={S.saved.at} radius={12} />
      </CaptureCard>
      {/* Sari's task, her photos popping on; then "selesai" arrives under it. */}
      <CaptureCard
        src="shots/staff/list.png"
        region={CARD_REGIONS.sari}
        at={S.sari.at}
        out={fast ? S.sari.out : C.done.out}
        tag={copy.tags.sari}
        below={fast ? undefined : { src: "shots/staff/done.png", region: CARD_REGIONS.done, at: C.done.at, check: C.done.check }}
      >
        {/* v12: only the task line is ringed; then her photos pop on. */}
        <Glow x={22} y={300} w={204} h={46} at={S.sari.ring} until={fast ? S.sari.out + 14 : C.done.at} radius={10} />
        <Thumb src="shots/staff/photo-after.png" crop={PHOTO_BEFORE} x={238} y={298} size={56} at={S.sari.thumbs[0]} />
        <Thumb src="shots/staff/photo-after.png" crop={PHOTO_AFTER} x={302} y={298} size={56} at={S.sari.thumbs[1]} />
      </CaptureCard>
      {fast && <KakakBadge locale={locale} at={CARDS15.badge.at} out={CARDS15.badge.out} />}
      {!fast && (
        <CaptureCard src={`${dir}/status.png`} region={CARD_REGIONS.track} at={C.track.at} out={C.track.out} tag={copy.tags.you}>
          <Glow x={16} y={171} w={358} h={74} at={C.track.ring} until={C.track.out + 14} radius={16} />
        </CaptureCard>
      )}
    </AbsoluteFill>
  );
}

/** v14 (15 s only): her name, on screen from her first word to the end of her line. v17: the name sits just above her
 *  caption (near her line), and the AI disclosure is a small footnote under it, as on the 60 s intro card. */
function KakakBadge({ locale, at, out }: { locale: Locale; at: number; out: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const copy = COPY[locale];
  const voice = useContext(Voice);
  const name = springAt(frame, fps, at, { damping: 16, stiffness: 130 });
  const note = ramp(frame, at + 2, at + 14, easeOut);
  const leave = ramp(frame, out, out + 12, easeIn);
  if (frame < at - 2) return null;
  return (
    <div style={{ position: "absolute", left: SAFE.left, width: SAFE.right - SAFE.left, bottom: H - CAPTION_BOTTOM + 124, transform: `translateX(${CX - (SAFE.left + SAFE.right) / 2}px) translateY(${leave * 16}px)`, opacity: 1 - leave, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, fontFamily: FONT, color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, opacity: Math.min(1, name * 1.5), transform: `translateY(${(1 - name) * 14}px)` }}>
        <KakakMark size={64} at={at} level={voice.level} pulse={voice.pulse} />
        <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: -1.3, lineHeight: 1, textShadow: "0 3px 22px rgba(40,16,40,0.55)" }}>
          Kakak<span style={{ fontSize: 30, fontWeight: 600, verticalAlign: "60%", marginLeft: 2, opacity: 0.85 }}>*</span>
        </div>
      </div>
      <div style={{ fontSize: 29, fontWeight: 600, color: "rgba(255,255,255,0.95)", padding: "8px 20px 10px", borderRadius: 999, background: "rgba(22,19,26,0.66)", opacity: note }}>{copy.footnote}</div>
    </div>
  );
}

/** v12: the mic on the idle sheet (k0-open), measured from the capture: the press lands exactly on it. */
const MIC_IDLE = { x: 195, y: 265 };

/** The one real phone shot: Kakak's sheet, the mic; a press (a dip, a soft ripple, no finger); then it gives way. */
function PhoneOnce({ locale }: { locale: Locale }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const C = CARDS;
  if (frame > C.phoneOut[1]) return null;
  const rise = springAt(frame, fps, 0, { damping: 19, stiffness: 90, mass: 0.9 });
  // Sized and placed to sit wholly inside the area free of platform UI (v11).
  const cam = look(0, 2.12, 300, 740, { X: (CLEAR.left + CLEAR.right) / 2 });
  cam.Y += (1 - rise) * 1500;
  const away = ramp(frame, C.phoneOut[0], C.phoneOut[1], easeIn);
  const dip = 1 - 0.02 * (0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(1, Math.max(0, (frame - C.press) / 12))));
  return (
    <AbsoluteFill style={{ opacity: 1 - away, transform: `scale(${dip * (1 - 0.06 * away)})` }}>
      <Phone cam={cam} overlay={<PressRing x={MIC_IDLE.x} y={MIC_IDLE.y} at={C.press} />}>
        <ScreenTrack cues={[{ src: `shots/${locale}/k0-open-clean.png`, at: 0, fade: 0 }]} />
      </Phone>
    </AbsoluteFill>
  );
}

/** A press on the phone without a finger: a soft terracotta ring opening from the mic. */
function PressRing({ x, y, at }: { x: number; y: number; at: number }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 20) return null;
  const k = 2.12;
  const size = 70 * k * (0.5 + 0.8 * easeOut(t / 20));
  return <div style={{ position: "absolute", left: x * k - size / 2, top: (12 + y) * k - size / 2, width: size, height: size, borderRadius: "50%", border: `${2.2 * k}px solid rgba(182,95,85,0.75)`, opacity: ramp(frame, at, at + 3) * (1 - t / 20) }} />;
}

/* ------------------------------------------------------------------ */
/* 9. The ending: the garden, Mama, the kite, the name                 */
/* ------------------------------------------------------------------ */

/**
 * A2 options (trailer-reset 20, fix 9; the 15's E and F): `a2` clears the girl's bubble when Mama answers, lowers
 * Mama's shading hand as she takes the girl's, lets the camera dip so the hand is seen, keeps the half dog out of the
 * close two-shot, says Mama's answer in her own bubble, and sets Kakak's end line as a plain line under the name.
 */
export function Ending({ locale, t0, fast, a2 = false }: SceneProps & { a2?: boolean }) {
  const frame = useCurrentFrame();
  const copy = COPY[locale];
  const voice = useContext(Voice);
  const E = fast ? ENDING15 : ENDING;
  const brand = brandFrame(fast, locale, t0, E.name);
  // The light deepens from the garden to the end card (v9: the 60 s ending starts 2.8 s sooner, at 44.2 s).
  const tod = fast ? lerp(17.74, 18.42, ramp(frame, 24, 112, (t) => t)) : lerp(17.62, 18.42, ramp(frame, 210, 480, (t) => t));
  // Fable's mirror: the walk stays wide, a push over her last steps to the hook's two-shot, then the crane back up the
  // string to the sky. The 15-second cut opens already in the two-shot.
  const sky: Cam = { x: 0, y: -1150, z: 1 };
  const string: Cam = { x: -16, y: 300, z: 1.05 };
  // v12: the 15 s cut opens close on the pair. The 60 s cut opens where the cards left off (the blurred garden), comes
  // into focus wide with Mama already beside the girl, then pushes in once, eased, to the close two-shot. No cut.
  const blurred: Cam = { x: 0, y: 40, z: 1.04 };
  const cam = fast
    ? keys<Cam>(frame, [
        { at: 0, ...TWO_SHOT },
        { at: E.crane[0], ...TWO_SHOT },
        { at: Math.round(E.crane[0] + (E.crane[1] - E.crane[0]) * 0.45), ...string },
        { at: E.crane[1], ...sky },
      ])
    : keys<Cam>(frame, [
        { at: 0, ...blurred },
        { at: ENDING.settle[1], ...GARDEN },
        { at: ENDING.push[0], ...GARDEN },
        { at: ENDING.push[1], ...TWO_SHOT },
        { at: E.crane[0], ...TWO_SHOT },
        { at: Math.round(E.crane[0] + (E.crane[1] - E.crane[0]) * 0.45), ...string },
        { at: E.crane[1], ...sky },
      ]);
  const close = (fast ? 1 : ramp(frame, ENDING.push[0], ENDING.push[1])) * (1 - ramp(frame, E.crane[0], E.crane[0] + 12));
  const focus = fast ? 1 : ramp(frame, ENDING.settle[0], ENDING.settle[1], ease);
  const walk = ramp(frame, E.mama[0], E.mama[1], (t) => 1 - (1 - t) * (1 - t));
  const lift = 0.3 * ramp(frame, E.lift[0], E.lift[1]);
  // On arrival the same single tug and the point; Mama shades her eyes (the opening's silhouette, no phone) and her
  // other hand takes the girl's, whose arm comes down to meet it.
  const moves = girlMoves(frame, [E.tug], E.point, [E.shade[1] - 4, E.hold[0] + 8]);
  // v9: one set of cues for both languages (Fable).
  const shade = E.shade;
  const hold = E.hold;
  // A2: her shading hand comes down as her other hand takes the girl's (fix 9: the hand is the shot).
  const shadeUp = ramp(frame, shade[0], shade[1], ease) * (a2 ? 1 - ramp(frame, hold[0] - 12, hold[0] + 8, ease) : 1);
  const mamaPose = { shade: shadeUp, hold: ramp(frame, hold[0], hold[1], ease), sway: moves.sway };
  // A2: Mama's answer in her own bubble (the 60: her spoken line; the 15: the words alone, from 11.0 s).
  const m2 = voice.cue("M2");
  // (In the 15 the crane starts at 11.33 s, so her answer is up from 10.6 s, clear before the name lands at 11.53 s, and rides with her.)
  const answer = a2 ? (m2 ? { from: m2.from - t0, to: m2.to - t0 + 20 } : fast ? { from: 22, to: 37 } : null) : null;
  const end = voice.cue(fast ? "S3t" : "L11t");
  const lineAt = a2 && fast && end ? Math.max(E.line, end.to - t0) : E.line;
  const girlOut = a2 && answer ? answer.from - 4 : Math.min(E.crane[0] + 6, brand - 16);
  const head = project(cam, 0.92, 284, 1170);
  // The bubble keeps its place beside her head as the camera moves (set in the two-shot: x 478, y 230).
  const home = project(TWO_SHOT, 0.92, 284, 1170);
  const bx = 478 + head.x - home.x;
  const by = 230 + head.y - home.y;
  const say = answer ? ramp(frame, answer.from - 4, answer.from + 8, easeOut) * (1 - ramp(frame, answer.to, answer.to + 10)) : 0;
  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT }}>
      {/* Out of the cards' blur (22 px, as the backdrop was) into focus; the slight scale matches the backdrop's. */}
      <AbsoluteFill style={{ filter: focus < 1 ? `blur(${(22 * (1 - focus)).toFixed(2)}px)` : undefined, transform: focus < 1 ? `scale(${1 + 0.06 * (1 - focus)})` : undefined }}>
        <SoftWorld soft={5 * close} light={lightAt(tod)} frame={frame + t0} cam={cam} child={1} dogs={1} kite={1} mama={walk} mamaPose={mamaPose} childPose={moves.child} kiteLift={lift} birds={1} runDog={a2 ? 1 - clamp01((close - 0.85) / 0.15) : 1} />
      </AbsoluteFill>
      {focus < 1 && <AbsoluteFill style={{ background: `rgba(255,250,242,${(0.08 * (1 - focus)).toFixed(3)})` }} />}
      <Vignette />
      {/* v15: her handwriting is gone by the time the name arrives (they shared the same place on screen). */}
      <GirlBubble lines={copy.call} cam={cam} at={E.bell} out={girlOut} box={GIRL_BUBBLE.two} />
      {say > 0.01 && (
        <div style={{ position: "absolute", inset: 0, opacity: say, transform: `translateY(${(1 - say) * 18}px)` }}>
          <MamaSays lines={splitAtComma(copy.lines.M2)} x={bx} y={by} w={440} size={72} to={{ x: head.x + 30, y: head.y - 10 }} />
        </div>
      )}
      {/* v15: the mark and the name arrive together on her spoken "Miamus"; the line on the bell and the address as before. */}
      <EndCard line={copy.end.line} em={copy.end.em} call={copy.end.call} url={copy.end.url} mark={brand} name={brand} lineAt={lineAt} callAt={"call" in E ? (E as { call: number }).call : undefined} urlAt={E.url} spoken={a2 && end ? { text: copy.lines[fast ? "S3t" : "L11t"], from: end.from - t0 } : undefined} />
    </AbsoluteFill>
  );
}

export { easeOut };
