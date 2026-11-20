/**
 * The motion kit (trailer-reset 28, decision 1): the film's moves, by name.
 *
 * A shot does not type a fade or a duration. It asks for a move ("arrive", "leave", "say this word", "the plate") and
 * hangs it from one anchor (a voice cue, usually), so nothing drifts apart when a time changes.
 *
 * Four rules are built in, so a shot cannot break them by accident:
 *  1. A move is a phrase: it starts soft, travels, lands soft, and rests. The curves below are the only ones there
 *     are, and none of them is a straight line. There is no easing argument to pass.
 *  2. Parts overlap: use `after(anchor, n)` so the next part starts before the last one has landed.
 *  3. Nothing readable arrives or leaves in under 8 frames (`arrive`, `leave` and `word` will not go shorter).
 *  4. One camera on one clock: `path()` runs smoothly through its keys and never changes speed at a key.
 *
 * Everything is in frames at 30 a second. Start values are trailer-reset 25, Part 1.
 */
import { Easing, spring } from "remotion";

export const FPS = 30;
/** Seconds to frames (not rounded: a voice cue may fall between frames). */
export const fr = (seconds: number) => seconds * FPS;

/* ------------------------------------------------------------------ */
/* The curves (private)                                                */
/* ------------------------------------------------------------------ */

/** Travel: leaves gently, lands gently, the landing a little longer. */
const TRAVEL = Easing.bezier(0.4, 0, 0.2, 1);
/** Arrival: a short soft start, then a long tail. Half way there after a third of the time. */
const SETTLE = Easing.bezier(0.25, 0.1, 0.25, 1);
/** Fades and long slow drifts: even, soft at both ends, never more than about 1.5 times its average speed. */
const EVEN = Easing.bezier(0.37, 0, 0.63, 1);
/** Departure: gathers speed gently. Only for the movement of something that is fading at the same time. */
const GATHER = Easing.bezier(0.45, 0, 0.9, 0.55);

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const run = (f: number, from: number, to: number, curve: (t: number) => number) => (to <= from ? (f >= to ? 1 : 0) : curve(clamp01((f - from) / (to - from))));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/* Anchors                                                             */
/* ------------------------------------------------------------------ */

/** A time hung from another: `after(cue, -5)` is five frames before the cue. */
export const after = (anchor: number, frames: number) => anchor + frames;
/** The i-th of a row of things that start one after another, each before the last has landed. */
export const each = (anchor: number, i: number, gap = 3) => anchor + i * gap;

/* ------------------------------------------------------------------ */
/* Moves                                                               */
/* ------------------------------------------------------------------ */

/** 0 to 1 between two frames, soft at both ends, the landing a little longer. For anything that travels. */
export const travel = (f: number, from: number, to: number) => run(f, from, to, TRAVEL);
/** 0 to 1 between two frames, even and unhurried. For a fade, a change of light, or a long slow journey (a firefly). */
export const drift = (f: number, from: number, to: number) => run(f, from, to, EVEN);

export type Shown = { /** opacity, 0–1 */ o: number; /** px to add to its resting place (down is positive) */ y: number; /** scale */ s: number; /** true while it is moving (for the frame check) */ moving: boolean };

/** A move's values as a style. */
export const css = (s: Shown) => ({ opacity: s.o, transform: `translateY(${s.y.toFixed(2)}px) scale(${s.s.toFixed(4)})` });

/**
 * Something arrives: it fades in over the first two thirds while it rises into place over the whole move.
 * `frames` is never under 8.
 */
export function arrive(f: number, at: number, { frames = 12, rise = 16, grow = 0 }: { frames?: number; rise?: number; grow?: number } = {}): Shown {
  const n = Math.max(8, frames);
  const o = run(f, at, at + n * 0.7, SETTLE);
  const k = run(f, at, at + n, SETTLE);
  return { o, y: (1 - k) * rise, s: 1 - grow * (1 - k), moving: f >= at && f < at + n };
}

/**
 * Something leaves: it fades out soft at both ends while it drifts off, gathering speed. `rise` is how far it lifts
 * (negative to sink). `frames` is never under 8.
 */
export function leave(f: number, at: number, { frames = 10, rise = 0, shrink = 0 }: { frames?: number; rise?: number; shrink?: number } = {}): Shown {
  const n = Math.max(8, frames);
  const k = run(f, at, at + n, EVEN);
  const d = run(f, at, at + n, GATHER);
  return { o: 1 - k, y: -rise * d, s: 1 - shrink * d, moving: f >= at && f < at + n };
}

/** A whole life: arrives at `inAt`, leaves at `outAt`. */
export function life(f: number, inAt: number, outAt: number, opt: { in?: Parameters<typeof arrive>[2]; out?: Parameters<typeof leave>[2] } = {}): Shown {
  const a = arrive(f, inAt, opt.in);
  const b = leave(f, outAt, opt.out);
  return { o: a.o * b.o, y: a.y + b.y, s: a.s * b.s, moving: a.moving || b.moving };
}

/** One thing gives way to another in the same place: `a` goes as `b` comes, never a gap, never both at full. */
export function handOver(f: number, at: number, frames = 10) {
  const k = drift(f, at, at + Math.max(8, frames));
  return { a: 1 - k, b: k };
}

/** A line that writes itself (the underline of "once?", her roof): 0 to 1, quick off the pen, slowing to the end. */
export const draw = (f: number, at: number, frames = 16) => run(f, at, at + Math.max(8, frames), SETTLE);

/**
 * The film's three springs. `swell`: a disc or a glow coming up to size, with the smallest overshoot. `lift`: a name
 * rising into place, none. `land`: the one bounce in the film, Kakak's heart.
 */
const SPRINGS = {
  swell: { damping: 14, stiffness: 120, mass: 0.9 },
  lift: { damping: 16, stiffness: 120, mass: 0.8 },
  land: { damping: 9, stiffness: 180, mass: 0.7 },
} as const;
export const springy = (f: number, at: number, kind: keyof typeof SPRINGS) => spring({ frame: f - at, fps: FPS, config: SPRINGS[kind] });

/** A slow breath for things that are alive while they rest (a light, a held phone). Never a straight line. */
export const breathe = (f: number, period = 90, phase = 0) => 0.5 - 0.5 * Math.cos(((f + phase) / period) * Math.PI * 2);

/* ------------------------------------------------------------------ */
/* Words with the voice (25, 1.5)                                      */
/* ------------------------------------------------------------------ */

export type WordSize = "plate" | "sky";
const WORD = {
  // Type of 46–72 px on a plate or in a bubble; the big lines in the sky.
  plate: { fade: 8, rise: 10, em: 0.14 },
  sky: { fade: 9, rise: 14, em: 0.2 },
} as const;

/**
 * One word arriving as it is said: from nothing, rising `em` of its own size. It starts 2 frames before the voice,
 * so it can be read as it is heard. `at`: the frame the word is spoken. `px`: the type size.
 */
export function word(f: number, at: number, px: number, size: WordSize = "plate"): Shown {
  const w = WORD[size];
  const from = at - 2;
  const k = run(f, from, from + w.rise, SETTLE);
  return { o: run(f, from, from + w.fade, SETTLE), y: (1 - k) * w.em * px, s: 1, moving: f >= from && f < from + w.rise };
}

/**
 * When each word of a line is said, in frames. `rows` are the line's fixed rows of words. With `onsets` (seconds from
 * the start of the take, one per word, measured from the voice file) the words follow the real voice; without, they
 * are spread over the cue by each word's share of the letters, the last starting no later than 85 % of the way.
 * Words are never less than 2 frames apart.
 */
export function spoken(rows: string[][], cue: { from: number; to: number }, onsets?: number[]): number[][] {
  const flat = rows.flat();
  let at: number[];
  if (onsets && onsets.length === flat.length) at = onsets.map((s) => cue.from + fr(s));
  else {
    const total = flat.reduce((n, w) => n + w.length + 1, 0) || 1;
    let seen = 0;
    at = flat.map((w) => {
      const a = cue.from + (cue.to - cue.from) * 0.85 * (seen / Math.max(1, total - (flat[flat.length - 1].length + 1)));
      seen += w.length + 1;
      return a;
    });
  }
  for (let i = 1; i < at.length; i++) at[i] = Math.max(at[i], at[i - 1] + 2);
  let i = 0;
  return rows.map((r) => r.map(() => at[i++]));
}

/* ------------------------------------------------------------------ */
/* Kakak's plate and the quiet lines (25, 1.2 and 1.6)                 */
/* ------------------------------------------------------------------ */

/** Her plate on a voice cue: in from 5 frames before her first word, rising 16 px; out from 2 frames after her last. */
export const plate = (f: number, cue: { from: number; to: number }) => life(f, after(cue.from, -5), after(cue.to, 2), { in: { frames: 12, rise: 16 }, out: { frames: 9, rise: -6 } });
/** A quiet line that is up with a spoken one (the AI footnote): the same clock as the plate, and it does not move. */
export const footnote = (f: number, cue: { from: number; to: number }) => life(f, after(cue.from, -5), after(cue.to, 2), { in: { frames: 12, rise: 0 }, out: { frames: 10, rise: 0 } });

/* ------------------------------------------------------------------ */
/* One clock: a smooth path through keys                               */
/* ------------------------------------------------------------------ */

export type Key<T> = T & { /** seconds on the film's clock */ t: number };

/**
 * A path through keyed numbers that never changes speed at a key and never overshoots one (a monotone cubic).
 * Give it the camera, the hour of the day, anything that must run on one clock through a whole stretch. Two keys
 * with the same values make a rest; a key between two different slopes is passed through at a blend of both.
 */
export function path<T extends Record<string, number>>(keys: Key<T>[]): (seconds: number) => T {
  const names = Object.keys(keys[0]).filter((k) => k !== "t");
  const n = keys.length;
  const h: number[] = [];
  for (let i = 0; i < n - 1; i++) h.push(keys[i + 1].t - keys[i].t);
  const tangents: Record<string, number[]> = {};
  for (const name of names) {
    const v = keys.map((k) => (k as Record<string, number>)[name]);
    const d = h.map((hi, i) => (v[i + 1] - v[i]) / hi);
    const m = new Array<number>(n).fill(0);
    // The path comes to rest at its two ends; inside, a weighted harmonic mean of the slopes on either side.
    for (let i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) m[i] = 0;
      else {
        const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    tangents[name] = m;
  }
  return (seconds: number) => {
    const t = Math.max(keys[0].t, Math.min(keys[n - 1].t, seconds));
    let i = 0;
    while (i < n - 2 && t > keys[i + 1].t) i++;
    const u = (t - keys[i].t) / h[i];
    const u2 = u * u, u3 = u2 * u;
    const out: Record<string, number> = {};
    for (const name of names) {
      const a = (keys[i] as Record<string, number>)[name], b = (keys[i + 1] as Record<string, number>)[name];
      const m = tangents[name];
      out[name] = (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * b + (u3 - u2) * h[i] * m[i + 1];
    }
    return out as T;
  };
}

/** The camera: one path for a whole stretch. Zoom travels in ratios (a push from 1 to 2 is even all the way). */
export function cameraPath(keys: Key<{ x: number; y: number; z: number }>[]) {
  const p = path(keys.map((k) => ({ t: k.t, x: k.x, y: k.y, lz: Math.log(k.z) })));
  return (seconds: number) => {
    const c = p(seconds);
    return { x: c.x, y: c.y, z: Math.exp(c.lz) };
  };
}
