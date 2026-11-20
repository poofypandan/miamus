/**
 * 5.0–15.0 s of the 60, seventh pass of the motion test (owner's note on clip-2f, 20 Nov;
 * motion-test/36-centre-and-end-line.md). turn-f.tsx with one change:
 *
 *  · THE CENTRE LINE IS THE FRAME'S (x 540), not the middle of the platform-safe area (x 491). The two sky
 *    lines, Kakak's mark and name, the place the rising light arrives, her plate and the footnote all move 49 px
 *    to the right. Nothing wider than 756 px sits on that line where the platforms' buttons are, so every
 *    word still ends left of x 918 there.
 *
 * The plate is moved here by a wrapper because `Caption` centres itself on the safe area; at the rebuild the
 * centre constants themselves change (stills/kit.tsx and theme.ts). turn.tsx to turn-f.tsx are kept as they were.
 */
import React, { useContext } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Voice } from "../film/scenes";
import { World } from "../world/World";
import { project, type Cam } from "../world/camera";
import { lightAt, type Light } from "../world/tod";
import { Caption, CLEAR, CREAM, CX, FONT, Grade, H, INK, KAKAK, KAKAK_LINE, KAKAK_TINT, MAMA, P, PLATE_TOP, SERIF, Shafts, W, camFor, heartPath } from "../stills/kit";
import { after, arrive, breathe, cameraPath, css, draw, drift, each, footnote, fr, handOver, leave, mix, path, plate, spoken, springy, travel, word, type WordSize } from "./kit";
import { ONSETS } from "./onsets";

/* ------------------------------------------------------------------ */
/* The one clock                                                       */
/* ------------------------------------------------------------------ */

/**
 * The sky frame (v17's): a wide shot, the garden in the lower third, drifting down the way the camera will go
 * when it comes down, so the descent grows out of the drift and nothing ever turns round. Mama is there, low on
 * the left.
 */
const sky = (t: number) => {
  const k = (t - 5) / 5;
  return { t, ...camFor(mix(0.93, 0.938, k), MAMA, { x: mix(304, 296, k), y: mix(1586, 1564, k) }) };
};
/** The garden frame: Mama's feet just clear of the caption line, and no lower, so the palm stays under Kakak's name. */
const GARDEN = camFor(0.945, MAMA, { x: 250, y: 1310 });
/** Where Act 3 opens at 15.0 (src/a3/act3.tsx, MamaTells): Mama close, on the left. */
const ACT3 = camFor(1.75, MAMA, { x: 300, y: 1270 });
/** When the question has been read, the camera comes down. */
const DOWN = { from: 9.95, to: 11.45 };
const CAM = cameraPath([sky(2), sky(5), sky(8), sky(DOWN.from), { t: DOWN.to, ...GARDEN }, { t: 13.7, ...camFor(0.955, MAMA, { x: 252, y: 1308 }) }, { t: 15, ...ACT3 }]);

/**
 * The hour of the day, one way only (v17's progression): night as the shot opens, colour at the horizon under
 * the question, dawn through Kakak's line, and Act 3's 06.8 at 15.0. `v` counts evenly from one of the day's set
 * hours to the next (tod.ts eases between them, which would make the light rest at 05.4 and 06.1; `even` undoes
 * that, so the pace is this path's alone).
 */
const HOURS = [4.6, 5.4, 6.1, 6.8];
const HOUR = path([
  { t: 4, v: 0.0 },
  { t: 5, v: 0.04 },
  { t: 8.3, v: 1 },
  { t: 13.0, v: 2 },
  { t: 14.2, v: 2.36 },
  { t: 15.0, v: 3 },
]);
function even(v: number) {
  const i = Math.max(0, Math.min(HOURS.length - 2, Math.floor(v)));
  const k = Math.max(0, Math.min(1, v - i));
  const u = 0.5 - Math.sin(Math.asin(1 - 2 * k) / 3); // the inverse of the ease in lightAt
  return mix(HOURS[i], HOURS[i + 1], u);
}
function lightOn(F: number): Light {
  const light = lightAt(even(HOUR(F / 30).v));
  // The lamps indoors are on through the night and go down once Mama has left the house.
  return { ...light, windows: mix(1, light.windows, drift(F, fr(8.4), fr(11.2))) };
}

/* ------------------------------------------------------------------ */
/* What is on the lawn                                                 */
/* ------------------------------------------------------------------ */

/** The questions come to rest on the lawn, and the fireflies rise there. Mama's spot (about x 300, y 1320 to 1590) is left clear. */
const SCRAPS: [string, number, number, number][] = [
  ["Done yet?", 452, 1462, -8],
  ["Laundry in?", 596, 1566, 6],
  ["Gate locked?", 70, 1650, 4],
  ["Eggs?", 770, 1690, -10],
  ["Plants watered?", 396, 1762, 3],
];
const FLIES = [
  [540, 1500], [720, 1600], [190, 1690], [840, 1730], [520, 1800], [640, 1520], [450, 1640], [800, 1610], [700, 1500], [860, 1560], [110, 1720],
];
/** The centre line: the middle of the frame. */
const MID = W / 2;
/** How far that is from the safe area's middle, which `Caption` centres on. */
const SHIFT = MID - CX;
/** Where the two sky lines start: the same place, one after the other. */
const SKY_TOP = 330;
/** The doorway (the middle of the glass doors, her feet on the deck) on Mama's layer, and her size there: she fits the door. */
const DOOR = { x: 739, y: 1283, s: 0.58 };
/**
 * A glide: up to speed over `a` frames, then one steady speed, then down over `b`. The share of the way, 0 to 1.
 * For a light that must not hurry anywhere: its fastest is only a fifth above its average.
 */
function glide(f: number, from: number, to: number, a = 7, b = 6) {
  const T = to - from, t = Math.max(0, Math.min(T, f - from));
  const all = T - a / 2 - b / 2;
  if (t < a) return (t * t) / (2 * a) / all;
  if (t <= T - b) return (a / 2 + (t - a)) / all;
  const left = T - t;
  return (all - (left * left) / (2 * b)) / all;
}
/** A point a share `k` of the way along a curve by distance, so a light keeps the speed its move gives it. */
function along(curve: (u: number) => { x: number; y: number }, k: number) {
  const N = 40;
  const pts = Array.from({ length: N + 1 }, (_, i) => curve(i / N));
  const len = [0];
  for (let i = 1; i <= N; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const want = Math.max(0, Math.min(1, k)) * len[N];
  let i = 1;
  while (i < N && len[i] < want) i++;
  const span = len[i] - len[i - 1] || 1;
  const u = (want - len[i - 1]) / span;
  return { x: mix(pts[i - 1].x, pts[i].x, u), y: mix(pts[i - 1].y, pts[i].y, u) };
}
const ROWS1 = [["Running", "a", "home"], ["takes", "a", "lot", "of", "asking."]];
const ROWS2 = [["What", "if", "you", "only", "had"], ["to", "say", "it"], ["once?"]];
const ROWS3 = [["Hi,", "I'm", "Kakak."], ["Just", "tell", "me", "what", "you", "need."]];

/** Where Mama's phone is (garden px from her feet): hanging, raised to shade her eyes (`up`), or held to read (`read`). */
const phoneAt = (up: number, read: number) => ({ x: mix(mix(-30, -21, up), -40, read) - 2, y: mix(mix(-134, -253, up), -204, read) - 6 });
const quad = (a: { x: number; y: number }, c: { x: number; y: number }, b: { x: number; y: number }, k: number) => ({
  x: (1 - k) * (1 - k) * a.x + 2 * (1 - k) * k * c.x + k * k * b.x,
  y: (1 - k) * (1 - k) * a.y + 2 * (1 - k) * k * c.y + k * k * b.y,
});

/** One word, arriving as it is said. */
function Say({ F, at, px, size = "plate", gap = true, children }: { F: number; at: number; px: number; size?: WordSize; gap?: boolean; children: React.ReactNode }) {
  const s = word(F, at, px, size);
  return (
    <>
      <span data-moving={s.moving ? "" : undefined} style={{ display: "inline-block", ...css(s) }}>{children}</span>
      {gap ? " " : ""}
    </>
  );
}

export function TurnG({ base, lead }: { base: number; lead: number }) {
  const F = base + useCurrentFrame() - lead;
  const voice = useContext(Voice);
  const cue = (id: string, from: number, to: number) => voice.cue(id) ?? { from: fr(from), to: fr(to) };
  const l1 = cue("L1", 5.15, 7.71);
  const l2 = cue("L2", 7.95, 10.07);
  const l3 = cue("L3", 11.2, 14.0);
  const s0 = l3.from; // Kakak's first word: her entrance hangs from here
  const at1 = spoken(ROWS1, l1, ONSETS.L1);
  const at2 = spoken(ROWS2, l2, ONSETS.L2);
  const at3 = spoken(ROWS3, l3, ONSETS.L3);
  const once = at2[2][0];

  const cam: Cam = CAM(F / 30);
  const light = lightOn(F);

  /* The chain, in order. Each beat is hung from the one before. */
  const asking = at1[1][4];
  const line1Out = after(asking, 16); // "asking." has been up half a second: the line leaves, and the sky is empty for the question
  const fliesUp = after(asking, 6); // under "asking." the questions give way to fireflies
  const rise = { from: after(s0, -53), to: after(s0, -13) }; // just after "once?", 1.3 s: // the one light leaves Mama's phone for the top of the frame
  const opens = after(rise.to, -2); // ...and Kakak's mark opens where it arrives
  const lastIn = after(rise.from, -2); // the last firefly has reached her phone
  const walk = { from: fr(7.2), to: fr(9.2) }; // as the fireflies rise she walks out to her spot
  const line2Out = after(once, 23); // "once?" has been up half a second (25, 1.5), its underline written
  const home = after(l3.to, -6); // her last word has been said: she goes back into the phone

  // Mama: when the fireflies are up she comes to the lit doorway; at first light she walks out to her spot,
  // reading her phone. She looks up as Kakak's mark opens, and back down at the phone when Kakak has gone in:
  // the pose Act 3 opens with.
  const mamaShow = drift(F, fr(6.2), fr(6.65)); // under "takes a lot of asking"
  const mamaOn = (f: number) => {
    const k = travel(f, walk.from, walk.to);
    return { x: mix(DOOR.x, MAMA.x, k), y: mix(DOOR.y, MAMA.y, k), s: mix(DOOR.s, 1, k) };
  };
  /** Where her phone is on the frame at another moment of her walk (held to read). */
  const phoneOn = (f: number) => {
    const m = mamaOn(f), p = phoneAt(0, 1);
    return P(CAM(f / 30), m.x + p.x * m.s, m.y + p.y * m.s);
  };
  const stride = drift(F, walk.from, walk.from + 6) * (1 - drift(F, walk.to - 9, walk.to - 1));
  const mamaAt = mamaOn(F);
  const up = travel(F, after(s0, -16), after(s0, 4)) * (1 - travel(F, after(home, 12), after(home, 34)));
  const read = 1 - up;
  // Her phone warms as the fireflies arrive in it, and swells once when the last one is in.
  const lit = 0.5 * drift(F, fr(8.0), lastIn) + 0.5 * springy(F, after(lastIn, -3), "swell");
  const ph = phoneAt(up, read);
  const phone = P(cam, mamaAt.x + ph.x * mamaAt.s, mamaAt.y + ph.y * mamaAt.s);

  // Kakak's lock-up: the disc, the roof, the heart, her name. One phrase, each part starting before the last lands.
  // It stands on the centre line of the type, at the top of the safe area.
  const rest = { x: MID, y: CLEAR.top + 125 };
  const disc = springy(F, opens, "swell");
  const roof = draw(F, after(opens, 3), 10);
  const heart = springy(F, after(s0, -7), "land"); // landed by her first word
  const name = springy(F, after(s0, -9), "lift");
  const nameOut = leave(F, after(home, -3), { frames: 10, rise: -18 });
  const back = drift(F, home, after(home, 30));
  const gone = drift(F, after(home, 20), after(home, 30));
  const beat = F > s0 + 4 ? 0.06 * (voice.pulse ?? 0) * (1 - drift(F, after(l3.to, -8), l3.to)) : 0;
  const mark = quad(rest, { x: rest.x - 110, y: mix(rest.y, phone.y, 0.5) }, phone, back);
  // She stays large while she travels and shrinks as she lands, so she is never a small thing moving fast.
  const markScale = Math.exp(Math.log(0.14) * back * back) * (0.6 + 0.4 * disc);
  // The phone glows as the light lands in it and as she comes home to it, and rests between.
  const glow = Math.max(lit * (1 - 0.6 * travel(F, rise.from, after(rise.from, 24))) * (1 - drift(F, after(home, 22), after(home, 32))), drift(F, after(home, 18), after(home, 28)) * (1 - 0.85 * drift(F, after(home, 28), after(home, 36))));

  const p3 = plate(F, l3);
  const foot = footnote(F, l3);
  // Her plate needs no light to bring it: it arrives as she starts to speak, and its small mark beats once with
  // her first word, as her heart has just done above.
  const beatAt = after(s0, -2);
  const landBeat = F > beatAt && F < beatAt + 16 ? Math.sin(((F - beatAt) / 16) * Math.PI) ** 2 : 0;
  // The one light rising out of her phone.
  // It comes up under the middle of the question, and is still 300 px below where the words were when the last
  // of them has gone (the question is fully out 10 frames before the light arrives).
  const riseAt = (f: number) => along((u) => quad(phone, { x: rest.x, y: rest.y + 600 }, { x: rest.x, y: rest.y + 20 }, u), glide(f, rise.from, rise.to));
  const line1 = leave(F, line1Out, { frames: 10, rise: 30 });
  const line2 = leave(F, line2Out, { frames: 10, rise: 30 });
  const stroke = draw(F, after(once, 6), 14);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0e0f24" }}>
      <World
        light={light}
        frame={F + 10}
        cam={cam}
        mama={1}
        mamaShow={mamaShow}
        mamaAt={mamaAt}
        mamaPose={{ shade: up, read, phone: Math.max(0.02, Math.min(1, lit)), stride }}
        birds={drift(F, after(s0, -30), after(s0, 20))}
      />
      <Shafts k={drift(F, after(home, 6), fr(15))} />

      {/* The questions come to rest on the lawn; when the line has been said they give way to fireflies. */}
      {SCRAPS.map(([text, x, y, r], i) => {
        const start = each(124, i, 5);
        const k = travel(F, start, start + 38);
        const swap = handOver(F, each(fliesUp, i, 3), 14);
        if (swap.a <= 0.001) return null;
        return (
          <div key={text} data-moving={k < 1 || swap.b > 0 ? "" : undefined} style={{ position: "absolute", left: x, top: y - 420 * (1 - k), transform: `rotate(${r + (1 - k) * 24 * (i % 2 ? 1 : -1)}deg) scaleY(${mix(1, 0.78, k)})`, opacity: mix(0.9, 0.42, k) * swap.a, padding: "12px 26px", borderRadius: 999, background: "#f3ece6", font: `600 44px/1 ${FONT}`, color: INK, whiteSpace: "nowrap" }}>
            {text}
          </div>
        );
      })}

      {/* Fireflies rise where the questions lay; as Mama walks out they go to her, into her phone. */}
      {F > fliesUp - 2 && F < lastIn + 6 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id="mfly">
              <stop offset="0%" stopColor="#fff4d0" stopOpacity={1} />
              <stop offset="35%" stopColor="#ffd890" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#ffb860" stopOpacity={0} />
            </radialGradient>
          </defs>
          {FLIES.map(([x, y], i) => {
            const bornAt = each(fliesUp, i, 2);
            const born = arrive(F, bornAt, { frames: 14, rise: 0 }).o;
            // It joins her as she walks past: the frame her phone is nearest, and how far that is.
            let near = walk.from, far = Infinity;
            for (let f = Math.ceil(walk.from); f <= walk.to; f += 2) {
              const p = phoneOn(f), d = Math.hypot(p.x - x, p.y - y);
              if (d < far) { far = d; near = f; }
            }
            const takes = Math.max(30, Math.min(48, far / 9)); // never faster than about 270 px a second
            const go = Math.max(near - takes + 12, bornAt + 10);
            const land = Math.min(go + takes, lastIn - (i % 4) * 2);
            const k = drift(F, Math.min(go, land - 26), land);
            const into = drift(F, land - 4, land + 1);
            const wob = Math.sin((F + i * 13) * 0.12) * 18 * (1 - k);
            const fx = mix(x, phone.x, k) + wob;
            const fy = mix(y, phone.y, k) - Math.sin(k * Math.PI) * (36 + 10 * (i % 3));
            return <circle key={i} cx={fx} cy={fy} r={(22 - (i / FLIES.length) * 6) * (1 - 0.45 * k)} fill="url(#mfly)" opacity={born * (1 - into)} />;
          })}
        </svg>
      )}

      {/* "Running a home takes a lot of asking.": in the sky, its own beat, gone before the question starts. */}
      {line1.o > 0.001 && (
        <div style={{ position: "absolute", left: MID - 427, width: 854, top: SKY_TOP, textAlign: "center", color: CREAM, textShadow: "0 2px 18px rgba(20,10,30,0.35)", font: `600 76px/1.22 ${FONT}`, letterSpacing: -1, ...css(line1) }}>
          {ROWS1.map((r, i) => (
            <div key={i}>{r.map((w, j) => <Say key={j} F={F} at={at1[i][j]} px={76} size="sky" gap={j < r.length - 1}>{w}</Say>)}</div>
          ))}
        </div>
      )}

      {/* "What if you only had to say it once?" */}
      {F > l2.from - 6 && line2.o > 0.001 && (
        <div style={{ position: "absolute", left: MID - 427, width: 854, top: SKY_TOP, textAlign: "center", color: CREAM, textShadow: "0 2px 18px rgba(20,10,30,0.35)", font: `600 82px/1.22 ${FONT}`, letterSpacing: -1, ...css(line2) }}>
          <div>{ROWS2[0].map((w, j) => <Say key={j} F={F} at={at2[0][j]} px={82} size="sky" gap={j < ROWS2[0].length - 1}>{w}</Say>)}</div>
          <div>
            {ROWS2[1].map((w, j) => <Say key={j} F={F} at={at2[1][j]} px={82} size="sky">{w}</Say>)}
            <span style={{ font: `italic 500 122px/1 ${SERIF}`, letterSpacing: -2 }}>
              <Say F={F} at={once} px={122} size="sky" gap={false}>
                <span style={{ position: "relative", display: "inline-block", paddingBottom: 10 }}>
                  once?
                  <svg viewBox="0 0 300 30" preserveAspectRatio="none" style={{ position: "absolute", left: "-4%", bottom: -10, width: "108%", height: 24, overflow: "visible" }}>
                    <path d="M 4 16 C 60 4 130 24 196 12 C 232 6 268 10 296 14" stroke={KAKAK} strokeWidth={6} strokeLinecap="round" fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - stroke} opacity={Math.min(1, stroke * 6)} vectorEffect="non-scaling-stroke" />
                  </svg>
                </span>
              </Say>
            </span>
          </div>
        </div>
      )}
      <Grade />

      {/* The warm light at Mama's phone: when the one light lands in it, and when Kakak comes home to it. */}
      {F > fr(7.9) && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id="mph"><stop offset="0" stopColor="#ffe9d2" stopOpacity="0.95" /><stop offset="1" stopColor="#ffb98f" stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx={phone.x} cy={phone.y} r={54 * (0.9 + 0.1 * glow)} fill="url(#mph)" opacity={Math.max(0, Math.min(1, glow))} />
        </svg>
      )}

      {/* Her plate: the words come as she says them. Under it, the quiet line that says what she is. */}
      {p3.o > 0.001 && (
        <div data-moving={p3.moving ? "" : undefined} style={{ position: "absolute", inset: 0, left: SHIFT, right: -SHIFT, ...css(p3) }}>
          <Caption
            pulse={Math.max(F < l3.to ? voice.pulse ?? 0 : 0, landBeat)}
            text={ROWS3.map((r, i) => (
              <div key={i} style={{ whiteSpace: "nowrap" }}>{r.map((w, j) => <Say key={j} F={F} at={at3[i][j]} px={46} gap={j < r.length - 1}>{w}</Say>)}</div>
            ))}
          />
        </div>
      )}
      {foot.o > 0.001 && (
        <div data-moving={foot.moving ? "" : undefined} style={{ position: "absolute", left: MID - 427, width: 854, top: 1492, textAlign: "center", font: `500 40px/1 ${FONT}`, color: "rgba(255,246,232,0.88)", whiteSpace: "nowrap", textShadow: "0 2px 6px rgba(30,12,30,0.55), 0 4px 30px rgba(30,12,30,0.6)", opacity: foot.o }}>
          Kakak is your AI helper
        </div>
      )}

      {/* The one light: up from her phone to where Kakak opens. Under her mark. */}
      {F >= rise.from && F < rise.to + 4 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id="mlead">
              <stop offset="0%" stopColor="#fffaf0" stopOpacity={1} />
              <stop offset="22%" stopColor="#fff0c4" stopOpacity={0.95} />
              <stop offset="48%" stopColor="#ffd27a" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#ffb860" stopOpacity={0} />
            </radialGradient>
          </defs>
          {[4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5, 0].map((lag) => {
            const at = riseAt(F - lag);
            const born = drift(F, rise.from, rise.from + 4);
            const into = drift(F, rise.to - 3, rise.to + 3);
            const small = 1 - 0.22 * drift(F, rise.to - 14, rise.to - 2); // it gathers itself before it opens
            return <circle key={`r${lag}`} cx={at.x} cy={at.y} r={46 * small * (1 - 0.15 * lag)} fill="url(#mlead)" opacity={born * (1 - into) * (lag ? 0.22 : 1)} />;
          })}
        </svg>
      )}

      {/* Kakak opens in the sky, and goes home to the phone. */}
      {F >= opens && gone < 1 && (
        <>
          <div data-moving={back > 0 || Math.abs(1 - disc) > 0.004 ? "" : undefined} style={{ position: "absolute", left: mark.x - 125, top: mark.y - 125, width: 250, height: 250, transform: `scale(${markScale.toFixed(4)})`, opacity: Math.min(1, disc * 1.6) * (1 - gone), filter: "drop-shadow(0 6px 26px rgba(60,20,10,0.35))" }}>
            <div style={{ width: 250, height: 250, borderRadius: "50%", background: KAKAK_TINT, border: `6px solid ${KAKAK_LINE}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={160} height={160} viewBox="92 78 328 328" style={{ display: "block" }}>
                <polyline points="112,214 256,104 400,214" stroke={KAKAK} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - roof} opacity={roof > 0 ? 1 : 0} />
                <path d={heartPath(160, 204, 192, 176)} fill={KAKAK} transform={`translate(256 292) scale(${Math.max(0, heart) * (1 + beat)}) translate(-256 -292)`} />
              </svg>
            </div>
          </div>
          <div data-moving={nameOut.moving || Math.abs(1 - name) > 0.004 ? "" : undefined} style={{ position: "absolute", left: rest.x - 300, width: 600, top: rest.y + 147, textAlign: "center", font: `700 136px/1 ${FONT}`, color: CREAM, letterSpacing: -3, opacity: Math.min(1, Math.max(0, name) * 1.5) * nameOut.o, transform: `translateY(${((1 - name) * 30 + nameOut.y).toFixed(2)}px)`, filter: "drop-shadow(0 6px 26px rgba(60,20,10,0.35))" }}>Kakak</div>
        </>
      )}
    </AbsoluteFill>
  );
}
