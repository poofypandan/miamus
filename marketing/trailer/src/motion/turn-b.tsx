/**
 * 5.0–15.0 s of the 60, second pass of the motion test (owner's pick, 20 Nov; motion-test/31-owner-pick-response.md):
 * turn.tsx's motion (one garden, one clock, one chain of hand-overs) inside v17's composition.
 *
 *  · THE FRAME. The garden sits in the lower third and the sky owns the frame while there is type in it, as in
 *    v17. The big question stands in open sky, clear of the palms. When it has been read the one camera comes
 *    down into the garden with the light, to Mama, and from there pushes on to Act 3's opening frame.
 *  · LINE 1 is in Kakak's plate on the caption line, so the eye learns in the first seconds where her words live.
 *    The sky is kept for the one big question.
 *  · THE EYE-LEAD from the sky to her plate: the light lands in Mama's phone, which the camera has brought to rest
 *    just above the plate's own mark; Kakak's thread rises from there to her big mark, and stays; her big mark is
 *    at rest before her first word; and as she starts to speak one pulse of light runs back down the thread to
 *    the phone, and the plate's mark beats once.
 *
 * turn.tsx is kept as it was (clip-2) so the two can be compared; one of the two goes at the rebuild.
 */
import React, { useContext } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Voice } from "../film/scenes";
import { World } from "../world/World";
import { project, type Cam } from "../world/camera";
import { lightAt, type Light } from "../world/tod";
import { Caption, CLEAR, CREAM, CX, FONT, Grade, H, INK, KAKAK, KAKAK_LINE, KAKAK_TINT, MAMA, P, SERIF, Shafts, W, camFor, heartPath } from "../stills/kit";
import { after, arrive, breathe, cameraPath, css, draw, drift, each, footnote, fr, handOver, leave, mix, path, plate, spoken, springy, travel, word, type WordSize } from "./kit";
import { ONSETS } from "./onsets";

/* ------------------------------------------------------------------ */
/* The one clock                                                       */
/* ------------------------------------------------------------------ */

/**
 * The sky frame (v17's): the garden in the lower third, drifting down the way the camera will go when it comes
 * down, so the descent grows out of the drift and nothing ever turns round.
 */
const sky = (t: number) => {
  const k = (t - 5) / 5;
  return { t, x: mix(-22, -10, k), y: mix(-134, -112, k), z: mix(1.0, 1.012, k) };
};
/** The garden frame: Mama's feet clear of the caption line, her phone above the plate's mark. */
const GARDEN = camFor(1.035, MAMA, { x: 236, y: 1292 });
/** Where Act 3 opens at 15.0 (src/a3/act3.tsx, MamaTells): Mama close, on the left. */
const ACT3 = camFor(1.75, MAMA, { x: 300, y: 1270 });
/** When the question has been read, the camera comes down. */
const DOWN = { from: 9.95, to: 11.45 };
const CAM = cameraPath([sky(2), sky(5), sky(8), sky(DOWN.from), { t: DOWN.to, ...GARDEN }, { t: 13.7, ...camFor(1.05, MAMA, { x: 238, y: 1290 }) }, { t: 15, ...ACT3 }]);

/**
 * The hour of the day. Past 19.6 (deep night) the clock runs on into the morning: 20.32 is 05.32, 21.8 is 06.8.
 * abb8062's hours at the same moments: 18.6 at 5.0, 05.32 at first light, 06.02 as Kakak speaks, and Act 3's 06.8.
 */
const NIGHT = 19.6;
const HOUR = path([
  { t: 4, u: 18.52 },
  { t: 5, u: 18.6 },
  { t: 7.0, u: 18.95 },
  { t: 7.8, u: NIGHT },
  { t: 8.6, u: 20.32 },
  { t: 11.2, u: 21.02 },
  { t: 14.0, u: 21.25 },
  { t: 15.0, u: 21.8 },
]);
function lightOn(F: number): Light {
  const u = HOUR(F / 30).u;
  const light = u <= NIGHT ? lightAt(u) : lightAt(u - 15);
  // Deep night is the same at both ends of the day but for the lamps indoors: they go down through it.
  const lamps = mix(lightAt(Math.min(u, NIGHT)).windows, lightAt(Math.max(u, NIGHT) - 15).windows, drift(F, fr(7.3), fr(8.7)));
  return { ...light, windows: lamps };
}

/* ------------------------------------------------------------------ */
/* What is on the lawn                                                 */
/* ------------------------------------------------------------------ */

/** The questions lie on the lawn under the caption line (the plate is above them), and the fireflies rise there. */
const SCRAPS: [string, number, number, number][] = [
  ["Done yet?", 96, 1556, -8],
  ["Laundry in?", 560, 1592, 6],
  ["Gate locked?", 150, 1676, 4],
  ["Eggs?", 770, 1700, -10],
  ["Plants watered?", 420, 1766, 3],
];
const FLIES = [
  [180, 1640], [330, 1580], [520, 1610], [700, 1690], [260, 1740], [610, 1560], [430, 1530], [800, 1600], [720, 1520], [860, 1500], [540, 1500],
];
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

export function TurnB({ base, lead }: { base: number; lead: number }) {
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
  const fliesUp = after(l1.to, -8); // the line has been said: the questions give way to fireflies, as night falls
  const riseAt = after(s0, -24); // Kakak's trail leaves the phone
  const landed = after(riseAt, 1); // ...as the one light lands in it
  const cross = after(landed, -27); // the light leaves the window for Mama's phone
  const gathered = after(cross, -2); // the last firefly has reached the window
  const line2Out = after(once, 23); // "once?" has been up half a second (25, 1.5), its underline written
  const home = after(l3.to, -6); // her last word has been said: she goes back into the phone

  // Mama: she comes with the night, at its darkest, so first light finds her already there with her phone (a person
  // who fades in by daylight is a ghost). She reads it, looks up as Kakak rises, and looks back down at it when
  // Kakak has gone in: the pose Act 3 opens with.
  const mamaShow = drift(F, fr(7.8), fr(8.5)); // after the plate has left the place where she stands
  const up = travel(F, after(s0, -16), after(s0, 4)) * (1 - travel(F, after(home, 12), after(home, 34)));
  const read = 1 - up;
  const lit = springy(F, after(landed, -4), "swell");
  const ph = phoneAt(up, read);
  const phone = P(cam, MAMA.x + ph.x, MAMA.y + ph.y);
  const win = project(cam, 0.8, 959, 1144);

  // Kakak's lock-up: the disc, the roof, the heart, her name. One phrase, each part starting before the last lands.
  // Her lock-up stands in the open sky over the house, clear of the palms; Mama is below it on the left, so the
  // thread between them is a diagonal that ends above the plate's mark.
  const rest = { x: 676, y: 340 };
  const top = { x: rest.x - 121, y: rest.y + 34 }; // where the thread meets her disc: from the left, clear of her name
  const trail = draw(F, riseAt, 15);
  const trailGone = drift(F, after(s0, 54), after(s0, 70));
  const disc = springy(F, after(riseAt, 5), "swell");
  const roof = draw(F, after(riseAt, 9), 11);
  const heart = springy(F, after(s0, -9), "land"); // at rest by her first word: after it, only the plate moves
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
  const trailPath = `M ${phone.x} ${phone.y} C ${phone.x - 60} ${phone.y - 250}, ${top.x - 235} ${top.y + 215}, ${top.x} ${top.y}`;

  const p3 = plate(F, l3);
  const foot = footnote(F, l3);
  const p1 = plate(F, l1);
  // The eye-lead: as she starts to speak, one pulse runs down her thread from the big mark to the phone, and the
  // plate's mark beats once as it lands.
  const tell = drift(F, after(s0, -3), after(s0, 13));
  const beatAt = after(s0, 9);
  const landBeat = F > beatAt && F < beatAt + 16 ? Math.sin(((F - beatAt) / 16) * Math.PI) ** 2 : 0;
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
            const go = each(after(fliesUp, 14), i, 2); // they hover until the plate has gone, then go
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

      {/* "What if you only had to say it once?" */}
      {F > l2.from - 6 && line2.o > 0.001 && (
        <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: 344, textAlign: "center", color: CREAM, textShadow: "0 2px 18px rgba(20,10,30,0.35)", font: `600 82px/1.22 ${FONT}`, letterSpacing: -1, ...css(line2) }}>
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

      {/* Kakak rises out of the phone, and goes home to it. */}
      {F > landed - 6 && (
        <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <radialGradient id="mph"><stop offset="0" stopColor="#ffe9d2" stopOpacity="0.95" /><stop offset="1" stopColor="#ffb98f" stopOpacity="0" /></radialGradient>
            <linearGradient id="mtr" gradientUnits="userSpaceOnUse" x1={phone.x} y1={phone.y} x2={top.x} y2={top.y}><stop offset="0" stopColor="#ffd9b8" stopOpacity="0.95" /><stop offset="1" stopColor="#ffe9d8" stopOpacity="0.3" /></linearGradient>
          </defs>
          <circle cx={phone.x} cy={phone.y} r={54 * (0.9 + 0.1 * glow)} fill="url(#mph)" opacity={Math.max(0, Math.min(1, Math.max(glow, 0.7 * landBeat)))} />
          <path d={trailPath} stroke="url(#mtr)" strokeWidth={7} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - trail} opacity={Math.min(1, trail * 8) * (1 - trailGone)} />
          {tell > 0 && tell < 1 && [30, 11].map((w) => (
            <path key={w} d={trailPath} stroke="#fff3df" strokeWidth={w} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray="0.2 2" strokeDashoffset={-((1 - tell) * 1.2 - 0.2)} opacity={(w > 20 ? 0.34 : 1) * Math.sin(tell * Math.PI) ** 0.6} />
          ))}
          {[0.2, 0.42, 0.63, 0.82].map((t, i) => {
            const on = Math.max(0, Math.min(1, (trail - t) / 0.18));
            const x = phone.x + (top.x - phone.x) * t ** 1.6 + Math.sin(t * 9 + F * 0.05) * 22 - 30 * (1 - t);
            const y = phone.y + (top.y - phone.y) * t;
            return <circle key={i} cx={x} cy={y} r={5 - i * 0.6} fill="#fff3df" opacity={(0.85 - i * 0.12) * on * on * (3 - 2 * on) * (1 - trailGone)} />;
          })}
        </svg>
      )}
      {F >= riseAt + 5 && gone < 1 && (
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

      {/* "Running a home takes a lot of asking.": in her plate, where her words will live. */}
      {p1.o > 0.001 && (
        <div data-moving={p1.moving ? "" : undefined} style={{ position: "absolute", inset: 0, ...css(p1) }}>
          <Caption
            pulse={F < l1.to ? voice.pulse ?? 0 : 0}
            text={ROWS1.map((r, i) => (
              <div key={i} style={{ whiteSpace: "nowrap" }}>{r.map((w, j) => <Say key={j} F={F} at={at1[i][j]} px={46} gap={j < r.length - 1}>{w}</Say>)}</div>
            ))}
          />
        </div>
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
    </AbsoluteFill>
  );
}
