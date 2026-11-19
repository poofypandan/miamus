/**
 * C1.5: one still per shot of the 60 s and 15 s storyboards (trailer-reset 12 and 13), English.
 * Shots the storyboard keeps "as v17" are v17's own frame (src/Film.tsx, frozen at the time in shots.json).
 * The rest are new: the world in focus, the staff drawn, the app as real captured components in bubbles.
 * Fallbacks on today's app are used wherever the storyboard says "needs product change #1/#2" (owner, C1).
 */
import React from "react";
import { project, type Cam } from "../world/camera";
import { World } from "../world/World";
import { Dog } from "../world/Figures";
import { lightAt, shade, type Light } from "../world/tod";
import { AppBubble } from "./app";
import { GroundShadow, Staff, SmallChild } from "./staff";
import { AppStack } from "./app";
import { Caption, CLEAR, CX, FONT, Firefly, Grade, INK, KAKAK, KakakMark, MAMA, MamaSays, P, Person, SERIF, Shafts, SkyTitle, Tag, W, H, camFor, CREAM } from "./kit";

const TAB = "Kakak · Miamus's AI helper";
const SAY = ["Kak, have Sari", "mop the terrace", "every Monday at 9."];
const DOG = (light: Light, frame: number) => (
  <g transform="translate(158 1492)">
    <Dog kind="sit" light={light} frame={frame} coat="#e9c99c" />
  </g>
);

/* The people's places in the garden layer (depth 0.92). */
const SARI = { x: 668, y: 1314 };
const sari = (light: Light, s = 0.72, tool: "mop" | "none" = "mop", phone = true) => (
  <g transform={`translate(${SARI.x} ${SARI.y}) scale(${s})`}>
    <Staff light={light} top="#3f8f8a" legs="#39445a" bun tool={tool} phone={phone} />
  </g>
);
const head = (cam: Cam) => P(cam, MAMA.x + 8, MAMA.y - 286);
const mamaPhone = (cam: Cam) => P(cam, MAMA.x - 23, MAMA.y - 259);

/** Mama, medium, from behind on the lawn, phone raised: shots 6, 7, 8, 13 and the 15's B. */
const MEDIUM = camFor(1.75, MAMA, { x: 300, y: 1360 });
/** C1.6: Mama medium, feet above Kakak's caption line, so no plate covers her. */
const MEDIUM6 = camFor(1.75, MAMA, { x: 300, y: 1270 });
function MamaMedium({ tod, frame, children }: { tod: number; frame: number; children?: React.ReactNode }) {
  const light = lightAt(tod);
  return (
    <>
      <World light={light} frame={frame} cam={MEDIUM} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={{ shade: 1, phone: 1 }} birds={1} extra={DOG(light, frame)} />
      {children}
      <Grade />
    </>
  );
}

/** Scraps of the hook's questions, fallen on the lawn (shot 3), or lifting as fireflies (shot 4). */
const SCRAPS: [string, number, number, number][] = [
  ["Done yet?", 96, 1352, -8],
  ["Laundry in?", 560, 1420, 6],
  ["Gate locked?", 150, 1536, 4],
  ["Eggs?", 760, 1580, -10],
  ["Plants watered?", 420, 1660, 3],
];

function Shot03() {
  const light = lightAt(18.75);
  const cam: Cam = { x: -20, y: 240, z: 1.06 };
  return (
    <>
      <World light={light} frame={170} cam={cam} birds={0} />
      {SCRAPS.map(([t, x, y, r]) => (
        <div key={t} style={{ position: "absolute", left: x, top: y, transform: `rotate(${r}deg) scaleY(0.78)`, opacity: 0.42, padding: "12px 26px", borderRadius: 999, background: "#f3ece6", font: `600 44px/1 ${FONT}`, color: INK, whiteSpace: "nowrap" }}>
          {t}
        </div>
      ))}
      <SkyTitle y={360}>
        Running a home
        <br />
        takes a lot of asking.
      </SkyTitle>
      <Grade />
    </>
  );
}

function Shot04() {
  const light = lightAt(5.45);
  const cam: Cam = { x: -20, y: 200, z: 1.06 };
  const win = project(cam, 0.8, 959, 1144);
  const flies = [
    [180, 1480], [330, 1390], [520, 1440], [700, 1530], [260, 1610], [610, 1340], [430, 1290], [800, 1380], [720, 1250], [860, 1220], [540, 1210],
  ];
  return (
    <>
      <World light={light} frame={260} cam={cam} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="fly">
            <stop offset="0%" stopColor="#fff4d0" stopOpacity={1} />
            <stop offset="35%" stopColor="#ffd890" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#ffb860" stopOpacity={0} />
          </radialGradient>
        </defs>
        {flies.map(([x, y], i) => {
          const k = i / flies.length;
          const fx = x + (win.x - x) * k * 0.6;
          const fy = y + (win.y - y) * k * 0.6;
          return <circle key={i} cx={fx} cy={fy} r={22 - k * 6} fill="url(#fly)" />;
        })}
      </svg>
      <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: 330, textAlign: "center", color: CREAM, textShadow: "0 2px 18px rgba(20,10,30,0.35)" }}>
        <div style={{ font: `600 84px/1.12 ${FONT}`, letterSpacing: -1 }}>
          What if you only had
          <br />
          to say it
        </div>
        <div style={{ display: "inline-block", marginTop: 6, font: `italic 500 150px/1.05 ${SERIF}`, letterSpacing: -2, borderBottom: `8px solid ${KAKAK}`, paddingBottom: 6 }}>once?</div>
      </div>
      <Grade />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* C1.6: Act 3 (trailer-reset 20, ranked fixes 1 to 12)                */
/* ------------------------------------------------------------------ */

/** A person's head-and-body box on the frame, for the frame check (no bubble may overlap a person). */
const mamaBox = (cam: Cam, at = MAMA, s = 1) => {
  const a = P(cam, at.x - 50 * s, at.y - 292 * s);
  const b = P(cam, at.x + 50 * s, at.y);
  return { l: a.x, t: a.y, r: b.x, b: b.y };
};
const staffBox = (cam: Cam, at: { x: number; y: number }, s: number) => {
  const a = P(cam, at.x - 40 * s, at.y - 272 * s);
  const b = P(cam, at.x + 40 * s, at.y);
  return { l: a.x, t: a.y, r: b.x, b: b.y };
};
/** Sari's figure with her ground shadow. pose: mopping (both hands on the mop), or the phone up. */
const sariFig = (light: Light, s = 0.72, phone = false, at = SARI) => (
  <g transform={`translate(${at.x} ${at.y}) scale(${s})`}>
    <GroundShadow light={light} />
    <Staff light={light} top="#3f8f8a" legs="#39445a" bun tool="mop" phone={phone} />
  </g>
);
/** Where Sari's phone hand is (the Staff drawing's raised left hand), in garden px. */
const sariHand = (s = 0.72, at = SARI) => ({ x: at.x - 40 * s, y: at.y - 196 * s });

/** 5 · Kakak: treatment 1 "Tidy", mark stacked above the name, wholly in the sky; a warm trail from Mama's phone. */
function Shot05() {
  const light = lightAt(6.15);
  const cam: Cam = { x: -30, y: 236, z: 1.04 };
  const at = { x: 250, y: 1470 };
  const phone = P(cam, at.x - 23, at.y - 259);
  const end = { x: CX, y: 520 };
  return (
    <>
      <World light={light} frame={340} cam={cam} mama={1} mamaAt={{ ...at, s: 1 }} mamaPose={{ shade: 1, phone: 1 }} birds={1} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="ph5"><stop offset="0" stopColor="#ffe9d2" stopOpacity="0.95" /><stop offset="1" stopColor="#ffb98f" stopOpacity="0" /></radialGradient>
          <linearGradient id="tr5" gradientUnits="userSpaceOnUse" x1={phone.x} y1={phone.y} x2={end.x} y2={end.y}><stop offset="0" stopColor="#ffd9b8" stopOpacity="0.95" /><stop offset="1" stopColor="#ffe9d8" stopOpacity="0.15" /></linearGradient>
        </defs>
        <circle cx={phone.x} cy={phone.y} r={54} fill="url(#ph5)" />
        <path d={`M ${phone.x} ${phone.y} C ${phone.x - 70} ${phone.y - 260}, ${end.x - 120} ${end.y + 300}, ${end.x} ${end.y + 30}`} stroke="url(#tr5)" strokeWidth={7} fill="none" strokeLinecap="round" />
        {[0.2, 0.42, 0.63, 0.82].map((t, i) => {
          const x = phone.x + (end.x - phone.x) * t + Math.sin(t * 9) * 26 - 30 * (1 - t);
          const y = phone.y + (end.y + 30 - phone.y) * t;
          return <circle key={i} cx={x} cy={y} r={5 - i * 0.6} fill="#fff3df" opacity={0.85 - i * 0.12} />;
        })}
      </svg>
      <div style={{ position: "absolute", left: CX, top: 232, transform: "translateX(-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 22, filter: "drop-shadow(0 6px 26px rgba(60,20,10,0.35))" }}>
        <KakakMark size={250} />
        <div style={{ font: `700 136px/1 ${FONT}`, color: CREAM, letterSpacing: -3 }}>Kakak</div>
      </div>
      <Caption text={<>Hi, I'm Kakak.<br />Just tell me what you need.</>} tab={TAB} pulse={0.6} />
      <Person label="Mama" box={mamaBox(cam, at)} />
      <Grade />
    </>
  );
}

/** Mama, medium, from behind on the lawn, in the warm morning: shots 6 to 8 and 13. */
function MamaMorning({ tod, frame, pose, children }: { tod: number; frame: number; pose: "speak" | "read"; children?: React.ReactNode }) {
  const light = lightAt(tod);
  const mp = pose === "read" ? { shade: 0, phone: 1, read: 1 } : { shade: 1, phone: 1 };
  return (
    <>
      <World light={light} frame={frame} cam={MEDIUM6} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={mp} birds={1} extra={DOG(light, frame)} />
      {tod < 12 && <Shafts />}
      {children}
      <Person label="Mama" box={mamaBox(MEDIUM6)} />
      <Grade />
    </>
  );
}
const readPhone = (cam: Cam) => P(cam, MAMA.x - 40, MAMA.y - 210);

function Shot06() {
  return (
    <MamaMorning tod={6.8} frame={460} pose="speak">
      <AppBubble id="micIn" x={330} y={300} scale={3.4} pad={10} fill="#fafbfd" inner={0} to={mamaPhone(MEDIUM6)} pressed />
    </MamaMorning>
  );
}

/** 7 · Her sentence alone in her bubble, tail to her; the app's part is the stop button, small, beside her phone. */
function Shot07() {
  const ph = mamaPhone(MEDIUM6);
  const hd = head(MEDIUM6);
  const d = 96 * 1.7;
  const c = { x: 116, y: 812 };
  return (
    <MamaMorning tod={6.82} frame={520} pose="speak">
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {[34, 60].map((r, i) => (
          <circle key={r} cx={ph.x} cy={ph.y} r={r} fill="none" stroke={KAKAK} strokeWidth={4 - i} opacity={0.6 - i * 0.22} />
        ))}
      </svg>
      <MamaSays lines={SAY} y={250} to={{ x: hd.x + 10, y: hd.y - 14 }} />
      <AppBubble id="stop" x={c.x - d / 2 - 8} y={c.y - d / 2 - 8} scale={1.7} pad={8} r={999} inner={999} fill="#fafbfd" />
    </MamaMorning>
  );
}

/** 8 · Kakak's card and its button in one bubble (fallback for #1: CHORE, What, Who; no date), the press, then "Saved". */
const CARD8 = { x: 90, y: 250, w: 900 };
function Shot08a() {
  return (
    <MamaMorning tod={6.86} frame={640} pose="read">
      <AppStack x={CARD8.x} y={CARD8.y} w={CARD8.w} to={readPhone(MEDIUM6)} parts={[{ id: "cardTop", scale: 3.2 }, { id: "looksRightWhole", scale: 2.4 }]} />
      <Caption text="I'll take it from there." />
    </MamaMorning>
  );
}
function Shot08b() {
  return (
    <MamaMorning tod={6.9} frame={680} pose="read">
      <AppStack x={CARD8.x} y={CARD8.y} w={CARD8.w} to={readPhone(MEDIUM6)} parts={[{ id: "cardTop", scale: 3.2 }, { id: "looksRightWhole", scale: 2.4, pressed: true }]} />
      <Caption text="I'll take it from there." />
    </MamaMorning>
  );
}
function Shot08c() {
  return (
    <MamaMorning tod={6.93} frame={710} pose="read">
      <AppBubble id="savedLine" x={170} y={560} scale={2.95} pad={14} fill="#ffffff" inner={0} to={readPhone(MEDIUM6)} />
      <Caption text="I'll take it from there." pulse={0.7} />
    </MamaMorning>
  );
}

/** 9 · The hand-over in three key frames: the firefly leaves Mama's phone, crosses over the laundry, lands in Sari's. */
const L5 = <>And everyone at home<br />knows what to do.</>;
function Shot09({ k }: { k: "a" | "b" | "c" }) {
  const tod = { a: 7.2, b: 7.28, c: 7.35 }[k];
  const light = lightAt(tod);
  const cam = k === "a" ? camFor(1.2, MAMA, { x: 320, y: 1270 }) : k === "b" ? camFor(1.3, { x: 430, y: 1300 }, { x: 540, y: 1060 }) : camFor(2.0, SARI, { x: 600, y: 1280 });
  const from = P(cam, MAMA.x - 23, MAMA.y - 259);
  const hand = P(cam, sariHand().x, sariHand().y);
  const fly =
    k === "a" ? { x: from.x + 90, y: from.y - 150, from: { x: from.x, y: from.y - 10 } } :
    k === "b" ? { ...P(cam, 340, 1130), from: { x: from.x + 20, y: from.y - 40 } } :
    { x: hand.x, y: hand.y - 6, from: { x: hand.x - 420, y: hand.y - 380 } };
  return (
    <>
      <World light={light} frame={760 + { a: 0, b: 30, c: 60 }[k]} cam={cam} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={{ shade: 0.3, phone: 1 }} laundry={1} birds={1} extra={sariFig(light, 0.72, k === "c")} />
      <Shafts k={0.9} />
      <Firefly x={fly.x} y={fly.y} from={fly.from} r={k === "c" ? 26 : 22} id={`ff9${k}`} />
      <Caption text={L5} />
      <Person label="Mama" box={mamaBox(cam)} />
      <Person label="Sari" box={staffBox(cam, SARI, 0.72)} />
      <Grade />
    </>
  );
}

/** Sari on the terrace, nearer: shots 10 and 11. Wet strokes on the deck once she has started. */
const SARI10 = camFor(1.75, SARI, { x: 560, y: 1270 });
function SariTerrace({ tod, frame, phone, wet = 0, children }: { tod: number; frame: number; phone: boolean; wet?: number; children?: React.ReactNode }) {
  const light = lightAt(tod);
  const strokes = [
    [SARI.x + 30, SARI.y + 14, 120],
    [SARI.x + 10, SARI.y + 30, 170],
    [SARI.x + 40, SARI.y + 46, 140],
  ];
  return (
    <>
      <World
        light={light}
        frame={frame}
        cam={SARI10}
        birds={1}
        extra={
          <>
            {wet > 0 && (
              <g opacity={wet} stroke="rgba(255,244,226,0.55)" strokeWidth={5} strokeLinecap="round" fill="none">
                {strokes.map(([x, y, w], i) => (
                  <path key={i} d={`M ${x - w / 2} ${y} Q ${x} ${y - 6} ${x + w / 2} ${y}`} />
                ))}
              </g>
            )}
            {sariFig(light, 0.72, phone)}
          </>
        }
      />
      <Shafts />
      {children}
      <Person label="Sari" box={staffBox(SARI10, SARI, 0.72)} />
      <Grade />
    </>
  );
}

/** 10 · 27.0–29.6: the photo button alone and whole from her phone, pressed (fallback for #2; no "wajib"). */
function Shot10() {
  const h = P(SARI10, sariHand().x, sariHand().y);
  return (
    <SariTerrace tod={7.4} frame={820} phone>
      <AppBubble id="photoBefore" x={83} y={640} scale={2.72} pad={0} r={34} inner={30} fill="#ffffff" to={{ x: h.x, y: h.y - 8 }} pressed />
    </SariTerrace>
  );
}

/** 11a · 29.6–31.4: she mops; "They run the home." over a person working, nothing covering her. */
function Shot11a() {
  return (
    <SariTerrace tod={7.44} frame={900} phone={false} wet={1}>
      <Caption text="They run the home." />
    </SariTerrace>
  );
}

/** 11b · 31.4–32.0: she lifts the phone, a shutter blink, and the app's own small toast: "Pel teras" selesai. */
function Shot11b() {
  const h = P(SARI10, sariHand().x, sariHand().y);
  return (
    <SariTerrace tod={7.46} frame={950} phone wet={1}>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="blink"><stop offset="0" stopColor="#ffffff" stopOpacity={0.95} /><stop offset="1" stopColor="#fff6e8" stopOpacity={0} /></radialGradient>
        </defs>
        <circle cx={h.x} cy={h.y - 6} r={44} fill="url(#blink)" />
      </svg>
      <AppBubble id="sariSelesai" x={150} y={700} scale={2.95} pad={14} fill="#ffffff" inner={0} to={{ x: h.x, y: h.y - 16 }} />
    </SariTerrace>
  );
}

/** 12 · 32.0–35.0: they run the home. Paper name labels, ticks landing with "I just keep track." */
function Shot12() {
  const light = lightAt(17.2);
  const cam: Cam = { x: -52, y: 322, z: 1.15 };
  const people = [
    { name: "Budi", x: 150, y: 1452, s: 0.9, tx: 0, tilt: -2, el: (l: Light) => <Staff light={l} top="#7d8f4e" legs="#5a4a3a" hat="brim" tool="can" /> },
    { name: "Sari", x: 520, y: 1314, s: 0.64, tx: -46, tilt: -3, el: (l: Light) => <Staff light={l} top="#3f8f8a" legs="#39445a" bun tool="mop" /> },
    { name: "Yanti", x: 722, y: 1312, s: 0.62, tx: 40, tilt: 2, el: (l: Light) => <Staff light={l} top="#e0a84a" legs="#6b4a3a" bun tool="tray" /> },
    { name: "Joko", x: 612, y: 1530, s: 0.98, tx: 40, tilt: -1.5, el: (l: Light) => <Staff light={l} top="#5d7fa3" legs="#33384a" hat="cap" /> },
  ];
  return (
    <>
      <World
        light={light}
        frame={1000}
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
            <g transform="translate(688 1538) scale(0.9)">
              <SmallChild light={light} />
            </g>
          </>
        }
      />
      {people.map((p) => {
        const at = P(cam, p.x, p.y - 292 * p.s);
        return <Tag key={p.name} x={Math.max(170, Math.min(820, at.x + p.tx))} y={at.y - 14} name={p.name} tilt={p.tilt} />;
      })}
      {people.map((p) => (
        <Person key={`b-${p.name}`} label={p.name} box={staffBox(cam, p, p.s)} />
      ))}
      <Caption text="I just keep track." />
      <Grade />
    </>
  );
}

function Shot13() {
  return (
    <MamaMorning tod={17.3} frame={1100} pose="read">
      <AppBubble id="statusIn" x={70} y={330} scale={3.4} pad={14} fill="#f1fcf8" inner={0} to={readPhone(MEDIUM6)} />
      <Caption text={<>And you? You'll only<br />hear from me…</>} />
    </MamaMorning>
  );
}

/** 14 · The phone asleep in Mama's lowered hand: near-black glass, a soft sky sheen, one highlight, the kite faint in it. */
function Shot14() {
  const light = lightAt(17.45);
  const cam = camFor(2.3, { x: 420, y: 1420 }, { x: 760, y: 1100 });
  const skin = shade("#d9a27c", light, 0.03, 0.25);
  const skinDark = shade("#b9825e", light, 0.03, 0.25);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, filter: "blur(6px)", transform: "scale(1.04)" }}>
        <World light={light} frame={1180} cam={cam} child={1} />
      </div>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="glass14" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="#14161d" />
            <stop offset="0.6" stopColor="#0d0e13" />
            <stop offset="1" stopColor="#1a1512" />
          </linearGradient>
          <linearGradient id="sheen14" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f6b98a" stopOpacity={0.16} />
            <stop offset="0.5" stopColor="#f6b98a" stopOpacity={0.03} />
            <stop offset="1" stopColor="#f6b98a" stopOpacity={0} />
          </linearGradient>
          <clipPath id="screen14">
            <rect x={-190} y={-404} width={380} height={808} rx={44} />
          </clipPath>
          <filter id="soft14"><feGaussianBlur stdDeviation="3" /></filter>
          <filter id="drop14" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="16" /></filter>
        </defs>
        <path d="M 236 -80 C 262 260 330 480 420 640" stroke={skin} strokeWidth={84} strokeLinecap="round" fill="none" />
        <g transform="translate(560 860) rotate(-8)">
          <rect x={-206} y={-420} width={412} height={840} rx={62} fill="rgba(40,20,10,0.35)" filter="url(#drop14)" transform="translate(18 26)" />
          {/* The palm behind the phone. */}
          <path d="M -150 -300 C -230 -280 -250 -120 -236 40 C -226 150 -170 210 -120 220 L -120 -300 Z" fill={skin} />
          <rect x={-214} y={-420} width={428} height={840} rx={64} fill="#191a20" />
          <rect x={-190} y={-404} width={380} height={808} rx={44} fill="url(#glass14)" />
          <g clipPath="url(#screen14)">
            <rect x={-190} y={-404} width={380} height={808} fill="url(#sheen14)" />
            {/* The kite, faint in the glass: a reflection, not a picture. */}
            <g filter="url(#soft14)" opacity={0.22}>
              <path d="M -150 404 Q -30 130 66 -150" stroke="rgba(255,240,220,0.8)" strokeWidth={2.4} fill="none" />
              <g transform="translate(74 -200) rotate(16) scale(1.3)">
                <path d="M 0 -64 L 42 -8 L 0 58 L -42 -8 Z" fill="#e0564f" />
              </g>
            </g>
            {/* One moving highlight across the glass. */}
            <path d="M -190 -170 L -120 -170 L 190 -470 L 120 -470 Z" fill="rgba(255,236,214,0.09)" />
          </g>
          {/* Fingers round the right edge; the thumb along the left. */}
          {[-150, -64, 22].map((y, i) => (
            <rect key={i} x={190} y={y} width={46} height={78} rx={23} fill={skin} />
          ))}
          <path d="M -236 -20 C -232 -120 -214 -200 -196 -250 C -186 -270 -166 -266 -168 -244 C -176 -170 -184 -90 -186 0 Z" fill={skin} stroke={skinDark} strokeWidth={2} />
        </g>
      </svg>
      <Caption text="…when something isn't done." />
      <Grade k={1.3} />
    </>
  );
}

/** Up the string to the kite: the phone dark at Mama's side, the girl, the evening (no words). */
function Shot15() {
  const light = lightAt(17.55);
  const cam: Cam = { x: -60, y: 150, z: 1.12 };
  return (
    <>
      <World light={light} frame={1260} cam={cam} child={1} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={{ shade: 0, phone: 0.001 }} dogs={1} kite={1} kiteLift={0.3} birds={1} />
      <Grade />
    </>
  );
}

/** The 15's C: the wide garden toward the terrace, Sari's title block from her phone (unchanged from C1.5). */
function HandOver({ tod, frame, caption }: { tod: number; frame: number; caption: React.ReactNode; card?: boolean }) {
  const light = lightAt(tod);
  const cam: Cam = { x: 150, y: 250, z: 1.3 };
  const to = P(cam, SARI.x - 42 * 0.72, SARI.y - 200 * 0.72);
  return (
    <>
      <World light={light} frame={frame} cam={cam} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={{ shade: 0.4, phone: 1 }} laundry={1} birds={1} extra={sari(light)} />
      <AppBubble id="sariTitle" x={150} y={560} scale={3.4} to={{ x: to.x, y: to.y - 18 }} />
      <Caption text={caption} />
      <Grade />
    </>
  );
}

/** Sari, medium, from behind on the terrace (the 15's D, unchanged from C1.5). */
const SARI_CAM = camFor(2.6, SARI, { x: 330, y: 1400 });
function SariMedium({ tod, frame, children, phone = true }: { tod: number; frame: number; children?: React.ReactNode; phone?: boolean }) {
  const light = lightAt(tod);
  return (
    <>
      <World light={light} frame={frame} cam={SARI_CAM} birds={1} extra={sari(light, 0.72, "mop", phone)} />
      {children}
      <Grade />
    </>
  );
}
const sariPhone = () => P(SARI_CAM, SARI.x - 42 * 0.72, SARI.y - 200 * 0.72);

/* ------------------------------------------------------------------ */
/* The 15                                                              */
/* ------------------------------------------------------------------ */

const WIDE15: Cam = { x: -30, y: 300, z: 1.07 };
function Wide15({ children, frame }: { children: React.ReactNode; frame: number }) {
  const light = lightAt(17.62);
  return (
    <>
      <World light={light} frame={frame} cam={WIDE15} child={1} mama={1} mamaPose={{ shade: 1, phone: 1 }} dogs={1} kite={1} birds={1} />
      {children}
      <Grade />
    </>
  );
}
const GHOSTS: [string, number, number, number, number][] = [
  ["Done yet?", 84, 1004, -9, 0.34],
  ["Laundry in?", 586, 1086, 7, 0.26],
  ["Gate locked?", 120, 1196, 5, 0.2],
  ["Eggs?", 716, 1232, -12, 0.16],
];
const Ghosts = () => (
  <>
    {GHOSTS.map(([t, x, y, r, o]) => (
      <div key={t} style={{ position: "absolute", left: x, top: y, transform: `rotate(${r}deg)`, opacity: o, padding: "12px 26px", borderRadius: 999, background: "#fff", font: `600 44px/1 ${FONT}`, color: INK, whiteSpace: "nowrap" }}>
        {t}
      </div>
    ))}
  </>
);

function B1() {
  const h = P(WIDE15, MAMA.x + 8, MAMA.y - 286);
  return (
    <Wide15 frame={100}>
      <Ghosts />
      <MamaSays lines={SAY} y={232} to={{ x: h.x + 4, y: h.y + 4 }} />
      <Caption text="Hi, I'm Kakak. Tell me once," tab={TAB} />
    </Wide15>
  );
}

function B2() {
  const ph = P(WIDE15, MAMA.x - 23, MAMA.y - 259);
  return (
    <Wide15 frame={150}>
      <AppBubble id="looksRight" x={56} y={560} scale={3.2} pad={14} to={ph} pressed />
      <Caption text="Hi, I'm Kakak. Tell me once," tab={TAB} />
    </Wide15>
  );
}

function D15() {
  return (
    <SariMedium tod={17.4} frame={250}>
      <AppBubble id="sariToast" x={64} y={430} scale={3.4} pad={16} to={sariPhone()} />
    </SariMedium>
  );
}

/** Drawn over a v17 frame (none at present; kept for shots that only add a layer to v17's picture). */
export const OVERLAYS: Record<string, Record<string, () => React.ReactElement>> = { "60": {}, "15": {} };

/** 18 · "I'm here, sweetie." as Mama's own bubble, tail to her (v17 had a plate), in v17's close two-shot. */
const TWO_SHOT: Cam = { x: -218, y: 469, z: 2.98 };
function Shot18() {
  const light = lightAt(17.85);
  const h = P(TWO_SHOT, 284, 1170);
  return (
    <>
      <World light={light} frame={1480} cam={TWO_SHOT} child={1} mama={1} mamaPose={{ shade: 1 }} dogs={1} kite={1} birds={1} />
      <MamaSays lines={["I'm here,", "sweetie."]} x={478} y={230} w={440} size={72} to={{ x: h.x + 30, y: h.y - 10 }} />
      <Grade />
    </>
  );
}

export const NEW_SHOTS: Record<string, Record<string, () => React.ReactElement>> = {
  "60": {
    "03": Shot03,
    "04": Shot04,
    "05": Shot05,
    "06": Shot06,
    "07": Shot07,
    "08a": Shot08a,
    "08b": Shot08b,
    "08c": Shot08c,
    "09a": () => <Shot09 k="a" />,
    "09b": () => <Shot09 k="b" />,
    "09c": () => <Shot09 k="c" />,
    "10": Shot10,
    "11a": Shot11a,
    "11b": Shot11b,
    "12": Shot12,
    "13": Shot13,
    "14": Shot14,
    "15": Shot15,
    "18": Shot18,
  },
  "15": {
    B1,
    B2,
    C: () => <HandOver tod={17.5} frame={190} card caption={<>and everyone at home<br />knows what to do.</>} />,
    D: D15,
  },
};
