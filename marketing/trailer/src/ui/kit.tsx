import React from "react";
import { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { H, W } from "../theme";

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

export const ease = Easing.bezier(0.33, 0, 0.2, 1);
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
export const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** 0 → 1 between two frames, eased. */
export function ramp(frame: number, from: number, to: number, easing: (t: number) => number = ease) {
  if (to <= from) return frame >= to ? 1 : 0;
  return interpolate(frame, [from, to], [0, 1], { ...CLAMP, easing });
}

/** In, hold, out: 0 → 1 → 0. */
export function pulse(frame: number, inAt: number, inLen: number, outAt: number, outLen: number) {
  return ramp(frame, inAt, inAt + inLen) * (1 - ramp(frame, outAt, outAt + outLen));
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** A spring from 0 to 1 starting at `at`. */
export function useSpring(at: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping: 16, stiffness: 140, mass: 0.8, ...config } });
}

export function springAt(frame: number, fps: number, at: number, config: { damping?: number; stiffness?: number; mass?: number } = {}) {
  return spring({ frame: frame - at, fps, config: { damping: 16, stiffness: 140, mass: 0.8, ...config } });
}

/** Numbers that move between keys: each key says the frame and the values there. */
export type Keyed<T> = T & { at: number; ease?: (t: number) => number };
export function keys<T extends object>(frame: number, list: Keyed<T>[]): T {
  let i = list.findIndex((k) => k.at > frame);
  if (i === -1) i = list.length;
  const a = list[Math.max(0, i - 1)] as unknown as Record<string, number>;
  const b = list[Math.min(list.length - 1, i)] as unknown as Record<string, number>;
  const bEase = (list[Math.min(list.length - 1, i)] as Keyed<T>).ease;
  const t = a === b ? 1 : ramp(frame, a.at, b.at, bEase ?? ease);
  const out: Record<string, number> = {};
  for (const k of Object.keys(a)) {
    if (k === "at" || k === "ease") continue;
    out[k] = lerp(a[k], b[k] ?? a[k], t);
  }
  return out as unknown as T;
}

export const rnd = (seed: string) => random(`miamus-${seed}`);

/* ------------------------------------------------------------------ */
/* Finish: grain, vignette, the scrim under the captions               */
/* ------------------------------------------------------------------ */

/** Film grain: fine noise that changes every frame, barely there. */
export function Grain({ opacity = 0.055 }: { opacity?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ mixBlendMode: "overlay", opacity, pointerEvents: "none" }}>
      <svg width={W} height={H}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={frame % 97} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={W} height={H} filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
}

export function Vignette({ strength = 0.34 }: { strength?: number }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 50% 46%, rgba(0,0,0,0) 55%, rgba(10,8,20,${strength}) 100%)`,
        pointerEvents: "none",
      }}
    />
  );
}

/** A soft dark foot under the captions, where the platforms lay their own text. */
export function Scrim({ strength = 0.5, from = 1040 }: { strength?: number; from?: number }) {
  if (strength <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(to bottom, rgba(12,10,20,0) ${from}px, rgba(12,10,20,${strength * 0.55}) ${from + 240}px, rgba(12,10,20,${strength}) ${H}px)`,
        pointerEvents: "none",
      }}
    />
  );
}

/** Text that never breaks inside a word pair joined by a non-breaking space. */
export const nb = (s: string) => s.replace(/~/g, " ");
