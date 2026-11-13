/**
 * The light of the day. Every scene outside the phone is one small world (a
 * garden, a house, hills, a sky) lit by the hour: `lightAt(17.6)` is golden
 * hour, `lightAt(5.4)` is just before dawn. Shapes keep their own colours and
 * the hour tints them, pulls them toward silhouette, and hazes the far ones.
 */
export type Rgb = [number, number, number];

export const hex = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const css = (c: Rgb, a = 1) =>
  a >= 1 ? `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})` : `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a.toFixed(3)})`;
export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mul = (a: Rgb, b: Rgb): Rgb => [(a[0] * b[0]) / 255, (a[1] * b[1]) / 255, (a[2] * b[2]) / 255];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Key {
  t: number;
  /** Sky, top to horizon; `midAt` is where the middle colour sits (0 top, 1 horizon). */
  skyTop: string;
  skyMid: string;
  skyLow: string;
  midAt: number;
  /** The sun: colour, where it is on the frame (px), how wide its glow reaches (0–1). */
  sun: string;
  sunX: number;
  sunY: number;
  glow: number;
  /** What the hour does to things: a tint, a pull toward one silhouette colour, haze with distance. */
  tint: string;
  sil: string;
  silK: number;
  haze: string;
  hazeK: number;
  /** Lamps on indoors, stars out, clouds' underlight. */
  windows: number;
  stars: number;
  cloud: string;
}

const KEYS: Key[] = [
  { t: 4.6, skyTop: "#0c1230", skyMid: "#1b2550", skyLow: "#3a3f73", midAt: 0.55, sun: "#ffd9a0", sunX: 560, sunY: 1420, glow: 0.0, tint: "#8c93c4", sil: "#0e0f24", silK: 0.92, haze: "#2a2f5c", hazeK: 0.55, windows: 0.25, stars: 1, cloud: "#4a4f86" },
  { t: 5.4, skyTop: "#1b2450", skyMid: "#5a4f86", skyLow: "#f0a07e", midAt: 0.6, sun: "#ffc890", sunX: 560, sunY: 1290, glow: 0.45, tint: "#b9a6c8", sil: "#1b1a36", silK: 0.84, haze: "#8d6f96", hazeK: 0.6, windows: 0.35, stars: 0.45, cloud: "#f2a98c" },
  { t: 6.1, skyTop: "#4f74b4", skyMid: "#f2b8a2", skyLow: "#ffdca6", midAt: 0.62, sun: "#fff0c2", sunX: 560, sunY: 1130, glow: 0.9, tint: "#ffd9bf", sil: "#3a3350", silK: 0.52, haze: "#f4c6ae", hazeK: 0.62, windows: 0.1, stars: 0, cloud: "#ffd2b4" },
  { t: 7.75, skyTop: "#79b2e8", skyMid: "#bcdcf4", skyLow: "#fff3dc", midAt: 0.6, sun: "#fffbe6", sunX: 760, sunY: 520, glow: 0.55, tint: "#fff6e8", sil: "#3a3a4a", silK: 0.0, haze: "#e6f0f6", hazeK: 0.5, windows: 0, stars: 0, cloud: "#ffffff" },
  { t: 12, skyTop: "#57a2e6", skyMid: "#9acbf2", skyLow: "#e8f5fc", midAt: 0.62, sun: "#ffffff", sunX: 540, sunY: -260, glow: 0.3, tint: "#ffffff", sil: "#30364a", silK: 0.0, haze: "#deecf5", hazeK: 0.45, windows: 0, stars: 0, cloud: "#ffffff" },
  { t: 16.5, skyTop: "#62a0dc", skyMid: "#c6dbe8", skyLow: "#fde8c4", midAt: 0.6, sun: "#fff1c9", sunX: 250, sunY: 640, glow: 0.6, tint: "#fff0d8", sil: "#4a3a3a", silK: 0.06, haze: "#f1e3cf", hazeK: 0.5, windows: 0, stars: 0, cloud: "#fff4e0" },
  { t: 17.5, skyTop: "#5486c6", skyMid: "#f6c58c", skyLow: "#ffab5e", midAt: 0.58, sun: "#ffe08c", sunX: 196, sunY: 1000, glow: 1.0, tint: "#ffc58f", sil: "#4a2a26", silK: 0.46, haze: "#f8b87e", hazeK: 0.66, windows: 0.25, stars: 0, cloud: "#ffd09a" },
  { t: 17.95, skyTop: "#3c5a9c", skyMid: "#ea927a", skyLow: "#ff8a4c", midAt: 0.6, sun: "#ffb863", sunX: 178, sunY: 1128, glow: 1.0, tint: "#f6a47c", sil: "#33203a", silK: 0.7, haze: "#ea9a7a", hazeK: 0.68, windows: 0.65, stars: 0.05, cloud: "#ff9d7a" },
  { t: 18.45, skyTop: "#1c2858", skyMid: "#7a4c8e", skyLow: "#f08868", midAt: 0.62, sun: "#ff9a62", sunX: 170, sunY: 1290, glow: 0.55, tint: "#b98fb4", sil: "#1c1730", silK: 0.86, haze: "#8a5a8a", hazeK: 0.62, windows: 1, stars: 0.6, cloud: "#c8789a" },
  { t: 19.6, skyTop: "#0c1230", skyMid: "#1b2550", skyLow: "#3a3f73", midAt: 0.55, sun: "#ffd9a0", sunX: 170, sunY: 1500, glow: 0.0, tint: "#8c93c4", sil: "#0e0f24", silK: 0.92, haze: "#2a2f5c", hazeK: 0.55, windows: 1, stars: 1, cloud: "#4a4f86" },
];

export interface Light {
  t: number;
  skyTop: Rgb;
  skyMid: Rgb;
  skyLow: Rgb;
  midAt: number;
  sun: Rgb;
  sunX: number;
  sunY: number;
  glow: number;
  tint: Rgb;
  sil: Rgb;
  silK: number;
  haze: Rgb;
  hazeK: number;
  windows: number;
  stars: number;
  cloud: Rgb;
}

/** The light at an hour of the day (4.6 to 19.6), blended between the hours set above. */
export function lightAt(t: number): Light {
  const tt = Math.max(KEYS[0].t, Math.min(KEYS[KEYS.length - 1].t, t));
  let i = KEYS.findIndex((k) => k.t >= tt);
  if (i <= 0) i = 1;
  const a = KEYS[i - 1];
  const b = KEYS[i];
  const u = (tt - a.t) / (b.t - a.t);
  // Ease between hours so the light never changes pace at a key.
  const s = u * u * (3 - 2 * u);
  const col = (k: keyof Key) => mix(hex(a[k] as string), hex(b[k] as string), s);
  const num = (k: keyof Key) => lerp(a[k] as number, b[k] as number, s);
  return {
    t: tt,
    skyTop: col("skyTop"),
    skyMid: col("skyMid"),
    skyLow: col("skyLow"),
    midAt: num("midAt"),
    sun: col("sun"),
    sunX: num("sunX"),
    sunY: num("sunY"),
    glow: num("glow"),
    tint: col("tint"),
    sil: col("sil"),
    silK: num("silK"),
    haze: col("haze"),
    hazeK: num("hazeK"),
    windows: num("windows"),
    stars: num("stars"),
    cloud: col("cloud"),
  };
}

/**
 * A thing's colour under this light. `depth` 0 is at our feet, 1 is the far
 * hills; `own` (0–1) is how much of its own colour it keeps against the
 * silhouette (the kite keeps most of its red at dusk; a palm keeps none).
 */
export function shade(base: string | Rgb, light: Light, depth = 0, own = 0): string {
  const b = typeof base === "string" ? hex(base) : base;
  const lit = mul(b, light.tint);
  const sil = mix(lit, light.sil, light.silK * (1 - own));
  return css(mix(sil, light.haze, light.hazeK * depth));
}

export function shadeRgb(base: string | Rgb, light: Light, depth = 0, own = 0): Rgb {
  const b = typeof base === "string" ? hex(base) : base;
  const lit = mul(b, light.tint);
  const sil = mix(lit, light.sil, light.silK * (1 - own));
  return mix(sil, light.haze, light.hazeK * depth);
}
