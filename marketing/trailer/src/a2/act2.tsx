/**
 * A2 · Act 2 (5–15 s of the 60), animated from the C1.5 stills (trailer-reset 12, shots 3 to 5; 20, fix 11; 21):
 *  3 · dusk: the hook's questions fall onto the lawn and lie there; "Running a home takes a lot of asking." in the sky;
 *  4 · first light: fireflies rise from where the questions fell and drift to the lit window until they are one light;
 *      "What if you only had to say it" and, as she says it, "once?";
 *  5 · dawn: Kakak rises out of Mama's phone on a short warm trail, the roof draws, the heart lands, her name sets
 *      beneath (treatment 1 "Tidy"); her first line on the plate with its AI tab; at 14 s she sinks back into the phone.
 * Frames are relative to 5.0 s (`lead` frames earlier, the crossfade from the hook).
 */
import React, { useContext } from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Voice } from "../film/scenes";
import { ease, easeIn, easeOut, lerp, ramp, springAt } from "../ui/kit";
import { project, type Cam } from "../world/camera";
import { World } from "../world/World";
import { lightAt } from "../world/tod";
import { Caption, CLEAR, CREAM, CX, FONT, Grade, INK, KAKAK, KAKAK_LINE, KAKAK_TINT, P, RiseWord, SERIF, SkyTitle, W, H, heartPath, wordTimes } from "../stills/kit";

/** Fix 11: in this shot her name is already in the sky, so the tab reads just this, at 44 px. */
const TAB5 = "Miamus's AI helper";
const SCRAPS: [string, number, number, number][] = [
  ["Done yet?", 96, 1352, -8],
  ["Laundry in?", 560, 1420, 6],
  ["Gate locked?", 150, 1536, 4],
  ["Eggs?", 760, 1580, -10],
  ["Plants watered?", 420, 1660, 3],
];
const FLIES = [
  [180, 1480], [330, 1390], [520, 1440], [700, 1530], [260, 1610], [610, 1340], [430, 1290], [800, 1380], [720, 1250], [860, 1220], [540, 1210],
];

/**
 * 25, 1.2: one camera for the whole act (4.6 to 15.0 s), one slow linear rise at one speed, as v17. The three scenes
 * change only their light under the dissolves, on a picture that does not move. `fa`: frames from 5.0 s.
 */
const camAt = (fa: number): Cam => {
  const k = (fa + 12) / 312;
  return { x: lerp(-20, -30, k), y: lerp(254, 204, k), z: lerp(1.05, 1.06, k) };
};
/** The world's clock: one for the whole act, so wind and drift never jump in a dissolve. */
const worldFrame = (fa: number) => 170 + fa;

/** How far along a spoken line is, 0–1, and its start, in frames relative to `base`. */
function useLine(id: string, base: number) {
  const v = useContext(Voice);
  const c = v.cue(id);
  return c ? { from: c.from - base, to: c.to - base } : null;
}

function Dusk({ f, base }: { f: number; base: number }) {
  const light = lightAt(lerp(18.6, 18.85, ramp(f, 0, 90, (t) => t)));
  const cam = camAt(f);
  const l1 = useLine("L1", base);
  // 25, 1.2: the words arrive one by one with her voice (share of letters across the cue, as v17's BigLine).
  const rows1 = [["Running", "a", "home"], ["takes", "a", "lot", "of", "asking."]];
  const at1 = l1 ? wordTimes(rows1, l1.from / 30, (l1.to - 6) / 30) : rows1.map((r) => r.map(() => -1));
  return (
    <>
      <World light={light} frame={worldFrame(f)} cam={cam} birds={0} />
      {SCRAPS.map(([t, x, y, r], i) => {
        const k = ramp(f, -10 + i * 5, 12 + i * 5, easeOut);
        return (
          <div key={t} style={{ position: "absolute", left: x, top: y - 420 * (1 - k), transform: `rotate(${r + (1 - k) * 24 * (i % 2 ? 1 : -1)}deg) scaleY(${lerp(1, 0.78, k)})`, opacity: lerp(0.9, 0.42, k), padding: "12px 26px", borderRadius: 999, background: "#f3ece6", font: `600 44px/1 ${FONT}`, color: INK, whiteSpace: "nowrap" }}>
            {t}
          </div>
        );
      })}
      <SkyTitle y={360}>
        {rows1.map((r, i) => (
          <div key={i}>{r.map((w, j) => <RiseWord key={j} w={w} t={f / 30} at={at1[i][j]} gap={j < r.length - 1} />)}</div>
        ))}
      </SkyTitle>
      <Grade />
    </>
  );
}

function Dawn({ f, base }: { f: number; base: number }) {
  // f is relative to 8.0 s here.
  const light = lightAt(lerp(5.32, 5.75, ramp(f, -15, 90, (t) => t)));
  const cam = camAt(f + 90);
  const win = project(cam, 0.8, 959, 1144);
  const l2 = useLine("L2", base);
  // 25, 1.2: every word arrives alone with her voice (share of letters across the cue), "once?" last on the same
  // curve; its underline is a drawn stroke that writes itself over 16 frames from 8 frames after the word. The block
  // rises 30 px and fades over 10 frames from 10.07 (the end of "once?"), gone by 10.4, before Kakak's disc.
  const rows2 = [["What", "if", "you", "only", "had"], ["to", "say", "it"], ["once?"]];
  const at2 = wordTimes(rows2, (l2 ? l2.from : -2) / 30, ((l2 ? l2.to : 62) - 6) / 30);
  const onceAt = at2[2][0] * 30;
  const clear = 1 - ramp(f, 62, 72, easeIn);
  const stroke = ramp(f, onceAt + 8, onceAt + 24, easeOut);
  const merged = ramp(f, 70, 86);
  return (
    <>
      <World light={light} frame={worldFrame(f + 90)} cam={cam} />
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="a2fly">
            <stop offset="0%" stopColor="#fff4d0" stopOpacity={1} />
            <stop offset="35%" stopColor="#ffd890" stopOpacity={0.7} />
            <stop offset="100%" stopColor="#ffb860" stopOpacity={0} />
          </radialGradient>
        </defs>
        {FLIES.map(([x, y], i) => {
          const k = ramp(f, -8 + i * 3, 74 + i, ease);
          const wob = Math.sin((f + i * 13) * 0.12) * 18 * (1 - k);
          const fx = lerp(x, win.x, k) + wob;
          const fy = lerp(y, win.y, k) - Math.sin(k * Math.PI) * 120;
          return <circle key={i} cx={fx} cy={fy} r={(22 - (i / FLIES.length) * 6) * (1 - 0.5 * merged)} fill="url(#a2fly)" opacity={1 - 0.8 * merged} />;
        })}
        {merged > 0 && <circle cx={win.x} cy={win.y} r={30 + 22 * merged} fill="url(#a2fly)" opacity={merged} />}
      </svg>
      <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: 330, textAlign: "center", color: CREAM, textShadow: "0 2px 18px rgba(20,10,30,0.35)", opacity: clear, transform: `translateY(${(-(1 - clear) * 30).toFixed(2)}px)` }}>
        <div style={{ font: `600 84px/1.12 ${FONT}`, letterSpacing: -1 }}>
          {rows2.slice(0, 2).map((r, i) => (
            <div key={i}>{r.map((w, j) => <RiseWord key={j} w={w} t={f / 30} at={at2[i][j]} gap={j < r.length - 1} />)}</div>
          ))}
        </div>
        <div style={{ marginTop: 6, font: `italic 500 150px/1.05 ${SERIF}`, letterSpacing: -2 }}>
          <RiseWord
            w={
              <span style={{ position: "relative", display: "inline-block", paddingBottom: 14 }}>
                once?
                <svg viewBox="0 0 300 30" preserveAspectRatio="none" style={{ position: "absolute", left: "-4%", bottom: -6, width: "108%", height: 26, overflow: "visible" }}>
                  <path d="M 4 16 C 60 4 130 24 196 12 C 232 6 268 10 296 14" stroke={KAKAK} strokeWidth={7} strokeLinecap="round" fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - stroke} opacity={stroke > 0 ? 1 : 0} vectorEffect="non-scaling-stroke" />
                </svg>
              </span>
            }
            t={f / 30}
            at={at2[2][0]}
            gap={false}
          />
        </div>
      </div>
      <Grade />
    </>
  );
}

/** The Kakak shot's garden (inside the dissolve from the dawn: only the light and Mama change there). */
function KakakWorld({ f }: { f: number }) {
  // f is relative to 11.0 s here.
  const light = lightAt(lerp(6.02, 6.25, ramp(f, -15, 120, (t) => t)));
  return (
    <>
      <World light={light} frame={worldFrame(f + 180)} cam={camAt(f + 180)} mama={1} mamaAt={{ ...KAKAK_AT, s: 1 }} mamaPose={{ shade: 1, phone: 1 }} birds={1} />
      <Grade />
    </>
  );
}
const KAKAK_AT = { x: 250, y: 1470 };

/**
 * Kakak's entrance (25, 1.2), drawn over the picture, never inside a dissolve: 0.8 s on v17's own curves, frames from
 * her first word s0 (11.2 s). The trail s0−28 to s0−14; the disc springs from s0−24; the roof draws s0−18 to s0−4;
 * the heart lands with the film's one bounce from s0−4; her name springs up 30 px from s0−6; back into the phone at 14.0.
 */
function KakakRise({ f, base }: { f: number; base: number }) {
  // f is relative to 11.0 s here.
  const { fps } = useVideoConfig();
  const v = useContext(Voice);
  const cam = camAt(f + 180);
  const phone = P(cam, KAKAK_AT.x - 23, KAKAK_AT.y - 259);
  const end = { x: CX, y: 520 };
  const l3 = useLine("L3", base);
  const s0 = l3 ? l3.from : 6;
  const trail = ramp(f, s0 - 28, s0 - 14, easeOut);
  const disc = springAt(f, fps, s0 - 24, { damping: 14, stiffness: 120, mass: 0.9 });
  const roof = ramp(f, s0 - 18, s0 - 4, easeOut);
  const heart = springAt(f, fps, s0 - 4, { damping: 9, stiffness: 180, mass: 0.7 });
  const name = springAt(f, fps, s0 - 6, { damping: 16, stiffness: 120 });
  const sink = ramp(f, 90, 110, ease);
  const beat = f > s0 + 4 ? 0.06 * (v.pulse ?? 0) : 0;
  const lx = lerp(CX, phone.x, sink);
  const ly = lerp(232, phone.y - 125 * 0.3, sink);
  const sc = lerp(1, 0.18, sink);
  const path = `M ${phone.x} ${phone.y} C ${phone.x - 70} ${phone.y - 260}, ${end.x - 120} ${end.y + 300}, ${end.x} ${end.y + 30}`;
  // The plate (25, 1.2): in 5 frames before her word to 7 after, rising 16 px; out 2 to 10 frames after, eased.
  const capIn = l3 ? ramp(f, l3.from - 5, l3.from + 7) : 1;
  const cap = capIn * (l3 ? 1 - ramp(f, l3.to + 2, l3.to + 10) : 1);
  if (f < s0 - 30) return null;
  return (
    <>
      <svg width={W} height={H} style={{ position: "absolute", inset: 0 }}>
        <defs>
          <radialGradient id="a2ph"><stop offset="0" stopColor="#ffe9d2" stopOpacity="0.95" /><stop offset="1" stopColor="#ffb98f" stopOpacity="0" /></radialGradient>
          <linearGradient id="a2tr" gradientUnits="userSpaceOnUse" x1={phone.x} y1={phone.y} x2={end.x} y2={end.y}><stop offset="0" stopColor="#ffd9b8" stopOpacity="0.95" /><stop offset="1" stopColor="#ffe9d8" stopOpacity="0.15" /></linearGradient>
        </defs>
        <circle cx={phone.x} cy={phone.y} r={54} fill="url(#a2ph)" opacity={Math.max(trail * (1 - 0.6 * ramp(f, s0, s0 + 20)), sink)} />
        <path d={path} stroke="url(#a2tr)" strokeWidth={7} fill="none" strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - trail} opacity={(1 - sink) * (1 - ramp(f, 60, 75))} />
        {[0.2, 0.42, 0.63, 0.82].map((t, i) => {
          if (trail < t) return null;
          const x = phone.x + (end.x - phone.x) * t + Math.sin(t * 9 + f * 0.05) * 26 - 30 * (1 - t);
          const y = phone.y + (end.y + 30 - phone.y) * t;
          return <circle key={i} cx={x} cy={y} r={5 - i * 0.6} fill="#fff3df" opacity={(0.85 - i * 0.12) * (1 - sink) * (1 - ramp(f, 60, 75))} />;
        })}
      </svg>
      {f >= s0 - 24 && (
        <div data-moving={sink > 0 || Math.abs(1 - name) > 0.004 ? "" : undefined} style={{ position: "absolute", left: lx, top: ly, transform: `translateX(-50%) scale(${sc})`, transformOrigin: "50% 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 22, opacity: 1 - ramp(f, 104, 112), filter: "drop-shadow(0 6px 26px rgba(60,20,10,0.35))" }}>
          <div style={{ width: 250, height: 250, borderRadius: "50%", background: KAKAK_TINT, border: `6px solid ${KAKAK_LINE}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${0.6 + 0.4 * disc})`, opacity: Math.min(1, disc * 1.6) }}>
            <svg width={160} height={160} viewBox="92 78 328 328" style={{ display: "block" }}>
              <polyline points="112,214 256,104 400,214" stroke={KAKAK} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - roof} opacity={roof > 0 ? 1 : 0} />
              <path d={heartPath(160, 204, 192, 176)} fill={KAKAK} transform={`translate(256 292) scale(${Math.max(0, heart) * (1 + beat)}) translate(-256 -292)`} />
            </svg>
          </div>
          <div style={{ font: `700 136px/1 ${FONT}`, color: CREAM, letterSpacing: -3, opacity: Math.min(1, Math.max(0, name) * 1.5) * (1 - sink), transform: `translateY(${((1 - name) * 30).toFixed(2)}px)` }}>Kakak</div>
        </div>
      )}
      {cap > 0.01 && (
        <div style={{ position: "absolute", inset: 0, opacity: cap, transform: `translateY(${((1 - capIn) * 16).toFixed(2)}px)` }}>
          <Caption text={"Hi, I'm Kakak.\nJust tell me what you need."} tab={TAB5} tabSize={40} pulse={v.pulse ?? 0} lit={l3 ? { t: f / 30, from: l3.from / 30, to: l3.to / 30 } : undefined} />
        </div>
      )}
    </>
  );
}

/** Act 2 of the 60: 5.0 to 15.0 s. `base` is the absolute frame of 5.0 s; the sequence starts `lead` frames before it. */
export function Act2({ base, lead }: { base: number; lead: number }) {
  const frame = useCurrentFrame() - lead; // 0 = 5.0 s
  const fadeDawn = ramp(frame, 90 - 15, 90);
  const fadeKakak = ramp(frame, 180 - 15, 180);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0e0f24" }}>
      {frame < 92 && (
        <AbsoluteFill>
          <Dusk f={frame} base={base} />
        </AbsoluteFill>
      )}
      {frame >= 75 && frame < 182 && (
        <AbsoluteFill style={{ opacity: fadeDawn }}>
          <Dawn f={frame - 90} base={base + 90} />
        </AbsoluteFill>
      )}
      {frame >= 165 && (
        <AbsoluteFill style={{ opacity: fadeKakak }}>
          <KakakWorld f={frame - 180} />
        </AbsoluteFill>
      )}
      {frame >= 150 && (
        <AbsoluteFill>
          <KakakRise f={frame - 180} base={base + 180} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
