/**
 * 5.0–15.0 s of the 60, third pass of the motion test (owner's notes on clip-2b, 20 Nov;
 * motion-test/32-clip-2c.md). turn-b.tsx with four changes:
 *
 *  · THE LIGHT runs one way, as v17's did: it is night when the shot opens and it only ever gets lighter, to
 *    Act 3's morning. One garden on one clock, no cross-fade.
 *  · LINE 1 is back in the sky, its own beat before the question, in the same place. The caption line is
 *    Kakak's alone.
 *  · KAKAK'S LOCK-UP is on the centre line, at the top of the safe area. The room is made by the frame: a
 *    slightly wider shot, and the camera comes down only as far as Mama's feet need to clear the plate.
 *  · NO THREAD. The light lands in Mama's phone and Kakak's mark opens in the sky; on "Hi," one firefly leaves
 *    her mark, passes behind her name and lands in the plate's own mark, which beats once.
 *
 * turn.tsx (clip-2) and turn-b.tsx (clip-2b) are kept as they were for comparison; one of the three stays at the rebuild.
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
const GARDEN = camFor(0.945, MAMA, { x: 238, y: 1310 });
/** Where Act 3 opens at 15.0 (src/a3/act3.tsx, MamaTells): Mama close, on the left. */
const ACT3 = camFor(1.75, MAMA, { x: 300, y: 1270 });
/** When the question has been read, the camera comes down. */
const DOWN = { from: 9.95, to: 11.45 };
const CAM = cameraPath([sky(2), sky(5), sky(8), sky(DOWN.from), { t: DOWN.to, ...GARDEN }, { t: 13.7, ...camFor(0.955, MAMA, { x: 240, y: 1308 }) }, { t: 15, ...ACT3 }]);

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
  // The lamps indoors are on through the night and go down as the one light leaves the window.
  return { ...light, windows: mix(1, light.windows, drift(F, fr(9.3), fr(11.6))) };
}

/* ------------------------------------------------------------------ */
/* What is on the lawn                                                 */
/* ------------------------------------------------------------------ */

/** The questions come to rest on the lawn around Mama (she stands at about x 300, y 1320 to 1590), and the fireflies rise there. */
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
/** Where the two sky lines start: the same place, one after the other. */
const SKY_TOP = 330;
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

export function TurnC({ base, lead }: { base: number; lead: number }) {
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
  const landed = after(s0, -23); // the one light lands in Mama's phone
  const opens = after(landed, 4); // ...and Kakak's mark opens in the sky
  const cross = after(landed, -27); // the light leaves the window for Mama's phone
  const gathered = after(cross, -2); // the last firefly has reached the window
  const line2Out = after(once, 23); // "once?" has been up half a second (25, 1.5), its underline written
  const home = after(l3.to, -6); // her last word has been said: she goes back into the phone

  // Mama is on the lawn from the first frame, in the dark with her phone. She reads it, looks up as Kakak's mark
  // opens, and looks back down at it when Kakak has gone in: the pose Act 3 opens with.
  const up = travel(F, after(s0, -16), after(s0, 4)) * (1 - travel(F, after(home, 12), after(home, 34)));
  const read = 1 - up;
  const lit = springy(F, after(landed, -4), "swell");
  const ph = phoneAt(up, read);
  const phone = P(cam, MAMA.x + ph.x, MAMA.y + ph.y);
  const win = project(cam, 0.8, 959, 1144);

  // Kakak's lock-up: the disc, the roof, the heart, her name. One phrase, each part starting before the last lands.
  // It stands on the centre line of the type, at the top of the safe area.
  const rest = { x: CX, y: CLEAR.top + 125 };
  const disc = springy(F, opens, "swell");
  const roof = draw(F, after(opens, 4), 11);
  const heart = springy(F, after(s0, -9), "land"); // at rest by her first word
  const name = springy(F, after(s0, -11), "lift");
  const nameOut = leave(F, after(home, -3), { frames: 10, rise: -18 });
  const back = drift(F, home, after(home, 30));
  const gone = drift(F, after(home, 20), after(home, 30));
  const beat = F > s0 + 4 ? 0.06 * (voice.pulse ?? 0) * (1 - drift(F, after(l3.to, -8), l3.to)) : 0;
  const mark = quad(rest, { x: rest.x - 110, y: mix(rest.y, phone.y, 0.5) }, phone, back);
  // She stays large while she travels and shrinks as she lands, so she is never a small thing moving fast.
  const markScale = Math.exp(Math.log(0.14) * back * back) * (0.6 + 0.4 * disc);
  // The phone glows as the light lands in it and as she comes home to it, and rests between.
  const glow = Math.max(lit * (1 - 0.6 * travel(F, s0, after(s0, 24))) * (1 - drift(F, after(home, 22), after(home, 32))), drift(F, after(home, 18), after(home, 28)) * (1 - 0.85 * drift(F, after(home, 28), after(home, 36))));

  const p3 = plate(F, l3);
  const foot = footnote(F, l3);
  // The eye-lead: as her heart lands, one firefly leaves her mark, passes behind her name, and comes straight down
  // the centre line to the top of her plate, where "Hi," is waiting; the plate's mark beats once as it lands. It
  // is the only thing that moves between the sky and the caption line, and it keeps well clear of Mama.
  const LEAD = { from: after(s0, -9), to: after(s0, 12) };
  const leadAt = (f: number) => quad({ x: rest.x, y: rest.y + 20 }, { x: rest.x + 64, y: 880 }, { x: rest.x - 16, y: PLATE_TOP + 8 }, drift(f, LEAD.from, LEAD.to));
  const beatAt = after(LEAD.to, -4);
  const landBeat = F > beatAt && F < beatAt + 16 ? Math.sin(((F - beatAt) / 16) * Math.PI) ** 2 : 0;
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
        mamaAt={{ ...MAMA, s: 1 }}
        mamaPose={{ shade: up, read, phone: Math.max(0.02, Math.min(1, lit)) }}
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

      {/* Fireflies rise where the questions lay and drift to the window; the one light then crosses to Mama's phone. */}
      {F > fliesUp - 2 && F < landed + 12 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id="mfly">
              <stop offset="0%" stopColor="#fff4d0" stopOpacity={1} />
              <stop offset="35%" stopColor="#ffd890" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#ffb860" stopOpacity={0} />
            </radialGradient>
          </defs>
          {FLIES.map(([x, y], i) => {
            const born = arrive(F, each(fliesUp, i, 2), { frames: 14, rise: 0 }).o;
            const go = each(after(fliesUp, 8), i, 2);
            const k = drift(F, go, gathered - (FLIES.length - 1 - i) * 0.8);
            const joined = drift(F, gathered - 10, gathered + 2);
            const wob = Math.sin((F + i * 13) * 0.12) * 18 * (1 - k);
            const fx = mix(x, win.x, k) + wob;
            const fy = mix(y, win.y, k) - Math.sin(k * Math.PI) * 120;
            return <circle key={i} cx={fx} cy={fy} r={(22 - (i / FLIES.length) * 6) * (1 - 0.5 * joined)} fill="url(#mfly)" opacity={born * (1 - joined * k)} />;
          })}
          {(() => {
            const joined = drift(F, gathered - 12, gathered + 2);
            const into = drift(F, landed - 5, landed + 6);
            if (joined <= 0) return null;
            // The light and a short tail behind it (where it was up to two frames ago), so it reads as one streak.
            return [2, 1.5, 1, 0.5, 0].map((lag) => {
              const k = drift(F - lag, cross, landed);
              const at = quad(win, { x: mix(win.x, phone.x, 0.5), y: Math.min(win.y, phone.y) - 150 }, phone, k);
              return <circle key={lag} cx={at.x} cy={at.y} r={mix(52, 30, k) * (0.94 + 0.06 * breathe(F, 40)) * (1 - 0.18 * lag)} fill="url(#mfly)" opacity={joined * (1 - into) * (lag ? 0.28 : 1)} />;
            });
          })()}
        </svg>
      )}

      {/* "Running a home takes a lot of asking.": in the sky, its own beat, gone before the question starts. */}
      {line1.o > 0.001 && (
        <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: SKY_TOP, textAlign: "center", color: CREAM, textShadow: "0 2px 18px rgba(20,10,30,0.35)", font: `600 76px/1.22 ${FONT}`, letterSpacing: -1, ...css(line1) }}>
          {ROWS1.map((r, i) => (
            <div key={i}>{r.map((w, j) => <Say key={j} F={F} at={at1[i][j]} px={76} size="sky" gap={j < r.length - 1}>{w}</Say>)}</div>
          ))}
        </div>
      )}

      {/* "What if you only had to say it once?" */}
      {F > l2.from - 6 && line2.o > 0.001 && (
        <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: SKY_TOP, textAlign: "center", color: CREAM, textShadow: "0 2px 18px rgba(20,10,30,0.35)", font: `600 82px/1.22 ${FONT}`, letterSpacing: -1, ...css(line2) }}>
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
      {F > landed - 6 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id="mph"><stop offset="0" stopColor="#ffe9d2" stopOpacity="0.95" /><stop offset="1" stopColor="#ffb98f" stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx={phone.x} cy={phone.y} r={54 * (0.9 + 0.1 * glow)} fill="url(#mph)" opacity={Math.max(0, Math.min(1, glow))} />
        </svg>
      )}

      {/* Her plate: the words come as she says them. Under it, the quiet line that says what she is. */}
      {p3.o > 0.001 && (
        <div data-moving={p3.moving ? "" : undefined} style={{ position: "absolute", inset: 0, ...css(p3) }}>
          <Caption
            pulse={Math.max(F < l3.to ? voice.pulse ?? 0 : 0, landBeat)}
            text={ROWS3.map((r, i) => (
              <div key={i} style={{ whiteSpace: "nowrap" }}>{r.map((w, j) => <Say key={j} F={F} at={at3[i][j]} px={46} gap={j < r.length - 1}>{w}</Say>)}</div>
            ))}
          />
        </div>
      )}
      {foot.o > 0.001 && (
        <div data-moving={foot.moving ? "" : undefined} style={{ position: "absolute", left: CX - 427, width: 854, top: 1492, textAlign: "center", font: `500 40px/1 ${FONT}`, color: "rgba(255,246,232,0.88)", whiteSpace: "nowrap", textShadow: "0 2px 6px rgba(30,12,30,0.55), 0 4px 30px rgba(30,12,30,0.6)", opacity: foot.o }}>
          Kakak is <span style={{ fontWeight: 700, color: CREAM }}>Miamus</span>'s AI helper
        </div>
      )}

      {/* The firefly from her mark to her plate: over the plate, under her mark and her name. */}
      {F >= LEAD.from && F < LEAD.to + 4 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id="mlead">
              <stop offset="0%" stopColor="#fffaf0" stopOpacity={1} />
              <stop offset="22%" stopColor="#fff0c4" stopOpacity={0.95} />
              <stop offset="48%" stopColor="#ffd27a" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#ffb860" stopOpacity={0} />
            </radialGradient>
          </defs>
          {/* The light and a short tail behind it (where it was up to four frames ago), so it reads as one streak. */}
          {[4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5, 0].map((lag) => {
            const at = leadAt(F - lag);
            const born = drift(F, LEAD.from, LEAD.from + 4);
            const into = drift(F, LEAD.to - 3, LEAD.to + 4);
            return <circle key={lag} cx={at.x} cy={at.y} r={48 * (1 - 0.15 * lag) * (1 - 0.35 * into)} fill="url(#mlead)" opacity={born * (1 - into) * (lag ? 0.22 : 1)} />;
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
