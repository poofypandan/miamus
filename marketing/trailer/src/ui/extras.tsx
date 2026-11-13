import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { C, CX, FONT, SAFE, SERIF } from "../theme";
import { clamp01, easeOut, lerp, ramp, springAt } from "./kit";

/** A small time of day, top left: the film is one day, in order. */
export function Stamp({ text, from, to, tone = "dark" }: { text: string; from: number; to: number; tone?: "dark" | "light" }) {
  const frame = useCurrentFrame();
  const o = ramp(frame, from, from + 10) * (1 - ramp(frame, to - 10, to));
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        top: SAFE.top + 4,
        opacity: o,
        transform: `translateY(${(1 - ramp(frame, from, from + 10, easeOut)) * -10}px)`,
        fontFamily: FONT,
        fontSize: 30,
        fontWeight: 600,
        letterSpacing: 0.6,
        fontVariantNumeric: "tabular-nums",
        color: tone === "dark" ? "#fff" : C.ink,
        background: tone === "dark" ? "rgba(22,19,26,0.66)" : "rgba(255,255,255,0.86)",
        borderRadius: 999,
        padding: "9px 20px 10px",
      }}
    >
      {text}
    </div>
  );
}

/** The big line at dawn: words arriving one by one, the last set apart and underlined in one stroke. */
export function BigLine({ rows, word, from, to, out }: { rows: [string, string]; word: string; from: number; to: number; out: number }) {
  const frame = useCurrentFrame();
  const all = [...rows[0].split(" "), ...rows[1].split(" "), word];
  const total = all.reduce((n, w) => n + w.length + 1, 0);
  const span = to - from;
  let seen = 0;
  const when = all.map((w) => {
    const at = from + (span * seen) / total;
    seen += w.length + 1;
    return at;
  });
  const gone = ramp(frame, out, out + 12);
  let i = 0;
  const wordOf = (w: string, special = false) => {
    const at = when[i++];
    const t = ramp(frame, at - 2, at + 9, easeOut);
    return (
      <span
        key={`${w}-${at}`}
        style={{
          display: "inline-block",
          opacity: t,
          transform: `translateY(${(1 - t) * 26}px)`,
          marginRight: special ? 0 : "0.26em",
          ...(special ? { fontFamily: SERIF, fontStyle: "italic", fontWeight: 500, fontSize: 124, color: "#ffd9c9", position: "relative" as const, letterSpacing: -1, lineHeight: 1 } : {}),
        }}
      >
        {w}
        {special && (
          <svg viewBox="0 0 300 30" preserveAspectRatio="none" style={{ position: "absolute", left: "-4%", bottom: -22, width: "108%", height: 26, overflow: "visible" }}>
            <path
              d="M 4 16 C 60 4 130 24 196 12 C 232 6 268 10 296 14"
              stroke="#f0907f"
              strokeWidth={7}
              strokeLinecap="round"
              fill="none"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - ramp(frame, at + 8, at + 24, easeOut)}
              opacity={frame > at + 8 ? 1 : 0}
            />
          </svg>
        )}
      </span>
    );
  };
  return (
    <div
      style={{
        position: "absolute",
        left: SAFE.left,
        width: SAFE.right - SAFE.left,
        top: 500,
        transform: `translate(${CX - (SAFE.left + SAFE.right) / 2}px, ${-gone * 30}px)`,
        opacity: 1 - gone,
        textAlign: "center",
        fontFamily: FONT,
        fontWeight: 600,
        fontSize: 80,
        lineHeight: 1.22,
        letterSpacing: -1.6,
        color: "#fff7ee",
        textShadow: "0 4px 30px rgba(10,8,30,0.45)",
      }}
    >
      <div>{rows[0].split(" ").map((w) => wordOf(w))}</div>
      <div style={{ marginTop: 6 }}>
        {rows[1].split(" ").map((w) => wordOf(w))}
        {wordOf(word, true)}
      </div>
    </div>
  );
}

/** A person's progress, as the app's Today screen shows it: an initial, a name, how much is done. */
export function StaffChip({ x, y, name, label, done, total, at, until }: { x: number; y: number; name: string; label: string; done: number; total: number; at: number; until: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < at) return null;
  const s = springAt(frame, fps, at, { damping: 13, stiffness: 170, mass: 0.7 });
  const n = Math.round(lerp(1, done, clamp01((frame - at - 6) / Math.max(1, until - at - 6))));
  const complete = n >= total;
  const tick = complete ? springAt(frame, fps, until, { damping: 9, stiffness: 220, mass: 0.6 }) : 0;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${0.6 + 0.4 * s})`,
        opacity: Math.min(1, s * 2),
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "11px 24px 11px 11px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.96)",
        boxShadow: "0 12px 34px rgba(20,24,40,0.2)",
        fontFamily: FONT,
        whiteSpace: "nowrap",
      }}
    >
      <div style={{ width: 58, height: 58, borderRadius: "50%", background: "#f4f4f5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 25, fontWeight: 600, color: "#3f3f46" }}>{name[0]}</div>
      <div>
        <div style={{ fontSize: 30, fontWeight: 600, color: C.ink, lineHeight: 1.12 }}>{name}</div>
        <div style={{ fontSize: 23, fontWeight: 500, color: C.inkSoft, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>
          {label} {n}/{total}
        </div>
      </div>
      {complete && (
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", transform: `scale(${Math.max(0, tick)})`, marginLeft: 2 }}>
          <svg width={22} height={22} viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </div>
  );
}

/** A name over a phone. */
export function NameChip({ x, y, text, from, to }: { x: number; y: number; text: string; from: number; to: number }) {
  const frame = useCurrentFrame();
  const o = ramp(frame, from, from + 8) * (1 - ramp(frame, to - 8, to));
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${0.9 + 0.1 * o})`,
        opacity: o,
        fontFamily: FONT,
        fontSize: 32,
        fontWeight: 600,
        color: "#fff",
        background: "rgba(22,19,26,0.86)",
        borderRadius: 999,
        padding: "9px 24px 11px",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </div>
  );
}

/** What was said once, on its way: a small light that crosses from one phone to the other. */
export function TravelLine({ from, to, start, end }: { from: { x: number; y: number }; to: { x: number; y: number }; start: number; end: number }) {
  const frame = useCurrentFrame();
  if (frame < start || frame > end + 14) return null;
  const t = ramp(frame, start, end);
  const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 330 };
  const at = (u: number) => ({
    x: (1 - u) * (1 - u) * from.x + 2 * (1 - u) * u * ctrl.x + u * u * to.x,
    y: (1 - u) * (1 - u) * from.y + 2 * (1 - u) * u * ctrl.y + u * u * to.y,
  });
  const tail: string[] = [];
  const t0 = Math.max(0, t - 0.42);
  for (let i = 0; i <= 26; i++) {
    const p = at(lerp(t0, t, i / 26));
    tail.push(`${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
  }
  const head = at(t);
  const fade = 1 - ramp(frame, end, end + 14);
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
      <defs>
        <filter id="lineGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
      </defs>
      <path d={tail.join(" ")} stroke="#f0907f" strokeWidth={14} strokeLinecap="round" fill="none" opacity={0.5 * fade} filter="url(#lineGlow)" />
      <path d={tail.join(" ")} stroke="#fff3ee" strokeWidth={5} strokeLinecap="round" fill="none" opacity={0.95 * fade} />
      <circle cx={head.x} cy={head.y} r={22} fill="#f0907f" opacity={0.55 * fade} filter="url(#lineGlow)" />
      <circle cx={head.x} cy={head.y} r={9} fill="#fff" opacity={fade} />
    </svg>
  );
}

/**
 * The end: the mark draws itself in the evening sky in one line (the roof,
 * then the M), then the name, the line, the address. No price, no date.
 */
export function EndCard({ line, url, mark, name, lineAt, urlAt }: { line: string; url: string; mark: number; name: number; lineAt: number; urlAt: number }) {
  const frame = useCurrentFrame();
  const roof = ramp(frame, mark, mark + 14, easeOut);
  const m = ramp(frame, mark + 10, mark + 32, easeOut);
  const a = ramp(frame, name, name + 16, easeOut);
  const b = ramp(frame, lineAt, lineAt + 16, easeOut);
  const c = ramp(frame, urlAt, urlAt + 16, easeOut);
  if (frame < mark) return null;
  const shadow = "0 4px 34px rgba(16,10,40,0.5)";
  return (
    <div style={{ position: "absolute", left: SAFE.left, width: SAFE.right - SAFE.left, top: 380, transform: `translateX(${CX - (SAFE.left + SAFE.right) / 2}px)`, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: FONT, color: "#fff", textAlign: "center" }}>
      <svg width={210} height={210} viewBox="0 0 512 512" fill="none" style={{ filter: "drop-shadow(0 6px 26px rgba(16,10,40,0.4))" }}>
        <polyline points="112,214 256,104 400,214" stroke="#fff" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - roof} opacity={roof > 0 ? 1 : 0} />
        <polyline points="152,400 152,262 256,354 360,262 360,400" stroke="#fff" strokeWidth={40} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - m} opacity={m > 0 ? 1 : 0} />
      </svg>
      <div style={{ marginTop: 6, fontSize: 132, fontWeight: 700, letterSpacing: -3.5, lineHeight: 1.05, opacity: a, transform: `translateY(${(1 - a) * 22}px)`, textShadow: shadow }}>Miamus</div>
      <div style={{ marginTop: 26, fontSize: 53, fontWeight: 500, lineHeight: 1.22, letterSpacing: -0.6, maxWidth: 800, opacity: b, transform: `translateY(${(1 - b) * 18}px)`, textShadow: shadow, textWrap: "balance" } as React.CSSProperties}>{line}</div>
      <div style={{ marginTop: 46, fontSize: 40, fontWeight: 600, letterSpacing: 0.6, opacity: c, transform: `translateY(${(1 - c) * 14}px)`, padding: "12px 34px 14px", borderRadius: 999, border: "2.5px solid rgba(255,255,255,0.85)", textShadow: shadow }}>{url}</div>
    </div>
  );
}
