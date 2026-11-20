/**
 * When each word starts inside its voice take, in seconds from the start of the take: one number per word of the
 * line as the film sets it. Measured from the take itself (audio/out/vo/eleven-lyly-v14/en/L1–L3.wav) with the
 * project's own local Whisper (mlx-whisper large-v3-turbo, word timestamps; free, on this machine), 20 Nov 2026.
 * A line with no entry here falls back to its letters' share of the cue (kit.ts, `spoken`).
 */
export const ONSETS: Record<string, number[] | undefined> = {
  // Running a home takes a lot of asking.
  L1: [0, 0.3, 0.5, 0.72, 1.06, 1.3, 1.66, 1.82],
  // What if you only had to say it once?
  L2: [0, 0.18, 0.32, 0.44, 0.74, 0.94, 1.06, 1.28, 1.4],
  // Hi, I'm Kakak. Just tell me what you need.
  L3: [0, 0.6, 0.74, 1.34, 1.68, 1.84, 1.98, 2.14, 2.24],
};
