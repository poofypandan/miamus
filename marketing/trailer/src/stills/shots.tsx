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
import { Staff, SmallChild } from "./staff";
import { Caption, CLEAR, FONT, Grade, INK, KAKAK, KakakMark, MAMA, MamaSays, P, SERIF, SkyTitle, Tag, TaskLight, W, H, camFor, CREAM } from "./kit";

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

function Shot05() {
  const light = lightAt(6.1);
  const cam: Cam = { x: -20, y: 260, z: 1.08 };
  const phone = project(cam, 0.92, MAMA.x - 23, MAMA.y - 259);
  return (
    <>
      <World light={light} frame={340} cam={cam} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={{ shade: 1, phone: 1 }} birds={1} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <path d={`M ${phone.x} ${phone.y - 20} C ${phone.x + 40} ${phone.y - 260} ${CLEAR.left + 330} 820 ${CLEAR.left + 427} 700`} stroke="rgba(255,226,206,0.55)" strokeWidth={6} fill="none" strokeDasharray="2 18" strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: 300, display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div style={{ borderRadius: 999, boxShadow: "0 0 90px rgba(255,214,190,0.75)" }}>
          <KakakMark size={300} />
        </div>
        <div style={{ font: `600 150px/1 ${FONT}`, letterSpacing: -3, color: CREAM, textShadow: "0 2px 22px rgba(60,30,40,0.35)" }}>Kakak</div>
      </div>
      <Caption text={<>Hi, I'm Kakak.<br />Just tell me what you need.</>} tab={TAB} />
      <Grade />
    </>
  );
}

function Shot06() {
  return (
    <MamaMedium tod={6.8} frame={460}>
      <AppBubble id="mic" x={300} y={250} scale={3.4} to={mamaPhone(MEDIUM)} pressed />
    </MamaMedium>
  );
}

/** Shot 7 holds two bubbles (her words and the app's listening control), so Mama stands lower in the frame. */
const LOW = camFor(1.75, MAMA, { x: 300, y: 1500 });
function Shot07() {
  const light = lightAt(6.8);
  const ph = P(LOW, MAMA.x - 23, MAMA.y - 259);
  const hd = P(LOW, MAMA.x + 8, MAMA.y - 286);
  return (
    <>
      <World light={light} frame={520} cam={LOW} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={{ shade: 1, phone: 1 }} birds={1} extra={DOG(light, 520)} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        {[46, 82, 122].map((r, i) => (
          <circle key={r} cx={ph.x} cy={ph.y} r={r} fill="none" stroke={KAKAK} strokeWidth={5 - i} opacity={0.7 - i * 0.22} />
        ))}
      </svg>
      <MamaSays lines={SAY} y={200} to={{ x: hd.x + 6, y: hd.y - 10 }} />
      <AppBubble id="listening" x={84} y={600} scale={3.0} pad={12} to={{ x: ph.x + 30, y: ph.y - 24 }} />
      <Grade />
    </>
  );
}

function Shot08a() {
  return (
    <MamaMedium tod={6.85} frame={640}>
      <AppBubble id="cardRows" x={70} y={250} scale={3.2} to={mamaPhone(MEDIUM)} />
      <Caption text="I'll take it from there." />
    </MamaMedium>
  );
}

function Shot08b() {
  return (
    <MamaMedium tod={6.9} frame={690}>
      <AppBubble id="looksRight" x={56} y={380} scale={3.2} pad={14} to={mamaPhone(MEDIUM)} pressed />
      <Caption text="I'll take it from there." />
    </MamaMedium>
  );
}

/** The wide garden toward the terrace: the light from Mama's phone reaching Sari's (60 s shot 9, the 15's C). */
function HandOver({ tod, frame, caption, card }: { tod: number; frame: number; caption: React.ReactNode; card?: boolean }) {
  const light = lightAt(tod);
  const cam: Cam = { x: 150, y: 250, z: 1.3 };
  const from = P(cam, MAMA.x - 23, MAMA.y - 259);
  const to = P(cam, SARI.x - 42 * 0.72, SARI.y - 200 * 0.72);
  const mid = { x: from.x + (to.x - from.x) * 0.72, y: Math.min(from.y, to.y) - 150 };
  return (
    <>
      <World light={light} frame={frame} cam={cam} mama={1} mamaAt={{ ...MAMA, s: 1 }} mamaPose={{ shade: 0.4, phone: 1 }} laundry={1} birds={1} extra={sari(light)} />
      {card ? <AppBubble id="sariTitle" x={150} y={560} scale={3.4} to={{ x: to.x, y: to.y - 18 }} /> : <TaskLight x={mid.x} y={mid.y} from={{ x: from.x, y: from.y - 20 }} />}
      <Caption text={caption} />
      <Grade />
    </>
  );
}

/** Sari, medium, from behind on the terrace (shots 10, 11; the 15's D). */
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

function Shot10() {
  return (
    <SariMedium tod={7.4} frame={820}>
      <AppBubble id="sariBefore" x={54} y={200} scale={3.0} pad={14} to={sariPhone()} pressed />
    </SariMedium>
  );
}

function Shot11() {
  return (
    <SariMedium tod={7.45} frame={930}>
      <AppBubble id="sariDone" x={64} y={196} scale={3.0} pad={14} to={sariPhone()} pressed />
      <Caption text="They run the home." />
    </SariMedium>
  );
}

function Shot12() {
  const light = lightAt(17.2);
  const cam: Cam = { x: -52, y: 322, z: 1.15 };
  const people = [
    { name: "Budi", x: 150, y: 1452, s: 0.9, tx: 0, el: (l: Light) => <Staff light={l} top="#7d8f4e" legs="#5a4a3a" hat="brim" tool="can" /> },
    { name: "Sari", x: 520, y: 1314, s: 0.64, tx: 0, el: (l: Light) => <Staff light={l} top="#3f8f8a" legs="#39445a" bun tool="mop" /> },
    { name: "Yanti", x: 722, y: 1312, s: 0.62, tx: 8, el: (l: Light) => <Staff light={l} top="#e0a84a" legs="#6b4a3a" bun tool="tray" /> },
    { name: "Joko", x: 612, y: 1530, s: 0.98, tx: 40, el: (l: Light) => <Staff light={l} top="#5d7fa3" legs="#33384a" hat="cap" /> },
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
        return <Tag key={p.name} x={Math.max(170, Math.min(800, at.x + p.tx))} y={at.y - 12} name={p.name} />;
      })}
      <Caption text="I just keep track." />
      <Grade />
    </>
  );
}

function Shot13() {
  return (
    <MamaMedium tod={17.3} frame={1100}>
      <AppBubble id="status" x={70} y={330} scale={3.4} to={mamaPhone(MEDIUM)} />
      <Caption text={<>And you? You'll only<br />hear from me…</>} />
    </MamaMedium>
  );
}

/** The sleeping phone in Mama's lowered hand, the kite crossing its glass (the film's one close-up). */
function Shot14() {
  const light = lightAt(17.45);
  const cam = camFor(2.3, { x: 420, y: 1420 }, { x: 760, y: 1100 });
  const skin = shade("#d9a27c", light, 0.03, 0.25);
  const dress = shade("#f3e7d3", light, 0.03, 0.4);
  return (
    <>
      <div style={{ position: "absolute", inset: 0, filter: "blur(6px)", transform: "scale(1.04)" }}>
        <World light={light} frame={1180} cam={cam} child={1} />
      </div>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <linearGradient id="glass" x1="0" y1="0" x2="0.3" y2="1">
            <stop offset="0" stopColor="#33457a" />
            <stop offset="0.45" stopColor="#8a6388" />
            <stop offset="0.8" stopColor="#e09462" />
            <stop offset="1" stopColor="#f0b070" />
          </linearGradient>
          <clipPath id="screen">
            <rect x={-190} y={-404} width={380} height={808} rx={44} />
          </clipPath>
          <filter id="soft5">
            <feGaussianBlur stdDeviation="1.4" />
          </filter>
          <filter id="drop" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="16" />
          </filter>
        </defs>
        <path d="M -60 -40 L 196 -40 C 236 520 300 1180 372 1960 L -60 1960 Z" fill={dress} />
        <path d="M 150 -40 L 196 -40 C 236 520 300 1180 372 1960 L 326 1960 C 262 1240 196 560 150 -40 Z" fill="rgba(110,60,40,0.12)" />
        <path d="M 236 -80 C 262 260 330 480 420 640" stroke={skin} strokeWidth={84} strokeLinecap="round" fill="none" />
        <g transform="translate(560 860) rotate(-8)">
          <rect x={-206} y={-420} width={412} height={840} rx={62} fill="rgba(40,20,10,0.35)" filter="url(#drop)" transform="translate(18 26)" />
          <rect x={-262} y={-250} width={150} height={470} rx={70} fill={skin} />
          <rect x={-214} y={-420} width={428} height={840} rx={64} fill="#191a20" />
          <rect x={-190} y={-404} width={380} height={808} rx={44} fill="#0c0d11" />
          <g clipPath="url(#screen)">
            <rect x={-190} y={-404} width={380} height={808} fill="url(#glass)" opacity={0.42} />
            <g filter="url(#soft5)" opacity={0.78}>
              <path d="M -150 404 Q -30 130 66 -150" stroke="rgba(255,240,220,0.85)" strokeWidth={2.6} fill="none" />
              <g transform="translate(74 -200) rotate(16) scale(1.3)">
                <path d="M 0 -64 L 42 -8 L 0 58 L -42 -8 Z" fill="#e0564f" />
                <path d="M 0 -64 L 42 -8 L 0 58 Z" fill="#f08a7c" />
              </g>
              <path d="M 54 -128 C 32 -84 72 -62 46 -14 C 30 16 62 36 42 76" stroke="#e0564f" strokeWidth={5} fill="none" strokeLinecap="round" />
            </g>
            <path d="M -190 -404 L 30 -404 L -190 150 Z" fill="rgba(255,255,255,0.06)" />
          </g>
          {[-214, -106, 2, 110].map((y, i) => (
            <rect key={i} x={-236} y={y} width={64} height={92} rx={32} fill={skin} />
          ))}
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
    "09": () => <HandOver tod={7.3} frame={760} caption={<>And everyone at home<br />knows what to do.</>} />,
    "10": Shot10,
    "11": Shot11,
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
