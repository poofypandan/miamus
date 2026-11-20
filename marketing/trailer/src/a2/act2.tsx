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
import { ease, easeOut, lerp, ramp, springAt } from "../ui/kit";
import { project, type Cam } from "../world/camera";
import { World } from "../world/World";
import { lightAt } from "../world/tod";
import { Caption, CLEAR, CREAM, CX, FONT, Grade, INK, KAKAK, KAKAK_LINE, KAKAK_TINT, P, SERIF, SkyTitle, W, H, heartPath } from "../stills/kit";

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

/** How far along a spoken line is, 0–1, and its start, in frames relative to `base`. */
function useLine(id: string, base: number) {
  const v = useContext(Voice);
  const c = v.cue(id);
  return c ? { from: c.from - base, to: c.to - base } : null;
}

function Dusk({ f, base }: { f: number; base: number }) {
  const light = lightAt(lerp(18.6, 18.85, ramp(f, 0, 90, (t) => t)));
  const cam: Cam = { x: -20, y: lerp(252, 232, ramp(f, -12, 90, (t) => t)), z: lerp(1.05, 1.08, ramp(f, -12, 90, (t) => t)) };
  const l1 = useLine("L1", base);
  const a = l1 ? ramp(f, l1.from - 4, l1.from + 10) : 1;
  const b = l1 ? ramp(f, l1.from + (l1.to - l1.from) * 0.42 - 4, l1.from + (l1.to - l1.from) * 0.42 + 10) : 1;
  return (
    <>
      <World light={light} frame={170 + f} cam={cam} birds={0} />
      {SCRAPS.map(([t, x, y, r], i) => {
        const k = ramp(f, -10 + i * 5, 12 + i * 5, easeOut);
        return (
          <div key={t} style={{ position: "absolute", left: x, top: y - 420 * (1 - k), transform: `rotate(${r + (1 - k) * 24 * (i % 2 ? 1 : -1)}deg) scaleY(${lerp(1, 0.78, k)})`, opacity: lerp(0.9, 0.42, k), padding: "12px 26px", borderRadius: 999, background: "#f3ece6", font: `600 44px/1 ${FONT}`, color: INK, whiteSpace: "nowrap" }}>
            {t}
          </div>
        );
      })}
      <SkyTitle y={360}>
        <span style={{ opacity: a }}>Running a home</span>
        <br />
        <span style={{ opacity: b }}>takes a lot of asking.</span>
      </SkyTitle>
      <Grade />
    </>
  );
}

function Dawn({ f, base }: { f: number; base: number }) {
  // f is relative to 8.0 s here.
  const light = lightAt(lerp(5.32, 5.75, ramp(f, -15, 90, (t) => t)));
  const cam: Cam = { x: -20, y: lerp(214, 196, ramp(f, -15, 90, (t) => t)), z: 1.06 };
  const win = project(cam, 0.8, 959, 1144);
  const l2 = useLine("L2", base);
  const title = l2 ? ramp(f, l2.from - 6, l2.from + 10) : 1;
  const onceAt = l2 ? l2.to - 16 : 45;
  // A4 (24, should): the words are gone before Kakak's disc rises in the crossfade (10.5 s), so her mark never sits on ghost text.
  const clear = 1 - ramp(f, 64, 74);
  const once = ramp(f, onceAt - 4, onceAt + 10, easeOut) * clear;
  const merged = ramp(f, 70, 86);
  return (
    <>
      <World light={light} frame={260 + f} cam={cam} />
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
      <div style={{ position: "absolute", left: CLEAR.left, width: CLEAR.right - CLEAR.left, top: 330, textAlign: "center", color: CREAM, textShadow: "0 2px 18px rgba(20,10,30,0.35)" }}>
        <div style={{ font: `600 84px/1.12 ${FONT}`, letterSpacing: -1, opacity: title * clear }}>
          What if you only had
          <br />
          to say it
        </div>
        <div style={{ display: "inline-block", marginTop: 6, font: `italic 500 150px/1.05 ${SERIF}`, letterSpacing: -2, borderBottom: `8px solid ${KAKAK}`, paddingBottom: 6, opacity: once, transform: `translateY(${(1 - once) * 24}px) scale(${0.92 + 0.08 * once})` }}>once?</div>
      </div>
      <Grade />
    </>
  );
}

function KakakRise({ f, base }: { f: number; base: number }) {
  // f is relative to 11.0 s here.
  const { fps } = useVideoConfig();
  const v = useContext(Voice);
  const light = lightAt(lerp(6.02, 6.25, ramp(f, -15, 120, (t) => t)));
  const cam: Cam = { x: -30, y: 236, z: lerp(1.035, 1.05, ramp(f, -15, 120, (t) => t)) };
  const at = { x: 250, y: 1470 };
  const phone = P(cam, at.x - 23, at.y - 259);
  const end = { x: CX, y: 520 };
  const l3 = useLine("L3", base);
  // A3 (trailer-reset 23, fix 11): the lock-up rises out of the phone in the quiet after "once?" and has settled as
  // her first word (11.2 s) brings the plate in; she goes back into the phone at 14.0 s.
  const s0 = l3 ? l3.from : 6;
  const trail = ramp(f, s0 - 20, s0 - 6, easeOut);
  const disc = springAt(f, fps, s0 - 15, { damping: 14, stiffness: 120, mass: 0.9 });
  const roof = ramp(f, s0 - 12, s0 - 3, easeOut);
  const heart = springAt(f, fps, s0 - 6, { damping: 9, stiffness: 180, mass: 0.7 });
  const name = ramp(f, s0 - 5, s0 + 6, easeOut);
  const sink = ramp(f, 90, 110, ease);
  const beat = f > s0 + 4 ? 0.06 * (v.pulse ?? 0) : 0;
  const lx = lerp(CX, phone.x, sink);
  const ly = lerp(232, phone.y - 125 * 0.3, sink);
  const sc = lerp(1, 0.18, sink);
  const path = `M ${phone.x} ${phone.y} C ${phone.x - 70} ${phone.y - 260}, ${end.x - 120} ${end.y + 300}, ${end.x} ${end.y + 30}`;
  const cap = l3 ? ramp(f, l3.from - 3, l3.from + 6) * (1 - ramp(f, l3.to + 2, l3.to + 10)) : 1;
  return (
    <>
      <World light={light} frame={340 + f} cam={cam} mama={1} mamaAt={{ ...at, s: 1 }} mamaPose={{ shade: 1, phone: 1 }} birds={1} />
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
      {f >= s0 - 15 && (
        <div data-moving={sink > 0 || name < 1 ? "" : undefined} style={{ position: "absolute", left: lx, top: ly, transform: `translateX(-50%) scale(${sc})`, transformOrigin: "50% 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 22, opacity: 1 - ramp(f, 104, 112), filter: "drop-shadow(0 6px 26px rgba(60,20,10,0.35))" }}>
          <div style={{ width: 250, height: 250, borderRadius: "50%", background: KAKAK_TINT, border: `6px solid ${KAKAK_LINE}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${0.6 + 0.4 * disc})`, opacity: Math.min(1, disc * 1.6) }}>
            <svg width={160} height={160} viewBox="92 78 328 328" style={{ display: "block" }}>
              <polyline points="112,214 256,104 400,214" stroke={KAKAK} strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" fill="none" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - roof} opacity={roof > 0 ? 1 : 0} />
              <path d={heartPath(160, 204, 192, 176)} fill={KAKAK} transform={`translate(256 292) scale(${Math.max(0, heart) * (1 + beat)}) translate(-256 -292)`} />
            </svg>
          </div>
          <div style={{ font: `700 136px/1 ${FONT}`, color: CREAM, letterSpacing: -3, opacity: name * (1 - sink), transform: `translateY(${(1 - name) * 20}px)` }}>Kakak</div>
        </div>
      )}
      {cap > 0.01 && (
        <div style={{ position: "absolute", inset: 0, opacity: cap }}>
          <Caption text={<>Hi, I'm Kakak.<br />Just tell me what you need.</>} tab={TAB5} tabSize={44} pulse={v.pulse ?? 0} />
        </div>
      )}
      <Grade />
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
          <KakakRise f={frame - 180} base={base + 180} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
