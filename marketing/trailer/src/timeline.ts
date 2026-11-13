/**
 * Every timing in the trailer, in frames at 30 fps, on an 86 BPM grid so a
 * track drops in later with the cuts on the beat (design lead, 13 Nov: 80–92
 * BPM, align cuts to 86). At 86 BPM the 60-second cut is exactly 86 beats.
 *
 * No imports: scripts/cues.ts reads this file with plain Node to write the
 * music cue sheet, so the film and the sheet can't disagree.
 */
export const FPS = 30;
export const BPM = 86;
/** One beat, in frames (20.93). */
export const BEAT = (FPS * 60) / BPM;
/** The frame of beat `n` (halves allowed). */
export const beat = (n: number) => Math.round(n * BEAT);
/** The nearest beat to a frame, the next one, or the one before. */
export const snap = (f: number) => beat(Math.round(f / BEAT));
export const snapUp = (f: number) => beat(Math.ceil(f / BEAT - 1e-6));
/** The nearest half beat: for quick runs of taps. */
export const snapHalf = (f: number) => Math.round(Math.round((f / BEAT) * 2) * (BEAT / 2));

export type Span = readonly [number, number];
export const len = (s: Span) => s[1] - s[0];

/**
 * The 60-second cut. Each cut lands on a beat near the storyboard's time:
 *   hook 0:00 · 1 0:02 · 2 0:06 · 3 0:13 · 4 0:20 · 5 0:26 · 6 0:33 ·
 *   7 0:38 · 8 0:45 · 9 0:52 · end 0:56 · 1:00
 */
export const SHOTS_60 = {
  hook: [0, beat(3)],
  s1: [beat(3), beat(9)],
  s2: [beat(9), beat(19)],
  s3: [beat(19), beat(29)],
  s4: [beat(29), beat(37)],
  s5: [beat(37), beat(47)],
  s6: [beat(47), beat(54)],
  s7: [beat(54), beat(64)],
  s8: [beat(64), beat(75)],
  s9: [beat(75), beat(80)],
  end: [beat(80), beat(86)],
} as const satisfies Record<string, Span>;

/** The 15-second cut: 0:00 hook · 0:02 Kakak · 0:06 staff · 0:09 all on track · 0:12 end. */
export const SHOTS_15 = {
  hook: [0, beat(3)],
  s2: [beat(3), beat(9)],
  s5: [beat(9), beat(13)],
  s7: [beat(13), beat(17)],
  end: [beat(17), 15 * FPS],
} as const satisfies Record<string, Span>;

/** The hook's three questions arrive on half beats; they leave just before the cut. */
export const HOOK = { first: 0, stagger: BEAT / 2, leaveAt: 50 };

/** Shot 1: the tap on Kakak's button, on a beat; the sheet opens after it. */
export const S1 = (() => {
  const [start] = SHOTS_60.s1;
  const tap = snap(start + 82) - start;
  return { tap, sheet: tap + 8 };
})();

export interface KakakTimes {
  /** Typing: from, length (frames within the shot). */
  typingFrom: number;
  typingLength: number;
  /** Tap on Send (on a beat), the card, the tap on the confirm button (on a beat), the saved screen. */
  send: number;
  card: number;
  /** The AI tag beside Kakak's name: two seconds while the card is on screen. */
  tag: [number, number];
  /** Sentence 1's card is long: the sheet scrolls down to its button (0 length = no scroll). */
  scrollFrom: number;
  scrollLength: number;
  confirm: number;
  saved: number;
}

/** Shots 2–4 (and the 15-second cut's shot 2): taps on beats, everything else follows them. */
export function kakakTimes(
  span: Span,
  typingFrom: number,
  typingLength: number,
  opts: { startTyped?: boolean; scroll?: boolean; scrollGap?: number; think?: number } = {}
): KakakTimes {
  const [start] = span;
  const length = len(span);
  const typed = opts.startTyped ? typingFrom : typingFrom + typingLength;
  const send = snapUp(start + typed + 6) - start;
  const card = send + (opts.think ?? 18);
  const scrollFrom = opts.scroll ? card + (opts.scrollGap ?? 34) : 0;
  const scrollLength = opts.scroll ? 16 : 0;
  const earliest = opts.scroll ? scrollFrom + scrollLength + 10 : card + 40;
  const confirm = Math.max(earliest, snap(start + length - 40) - start);
  return {
    typingFrom,
    typingLength: opts.startTyped ? 0 : typingLength,
    send,
    card,
    tag: [card + 4, card + 4 + 2 * FPS],
    scrollFrom,
    scrollLength,
    confirm,
    saved: confirm + 8,
  };
}

export const K60: [KakakTimes, KakakTimes, KakakTimes] = [
  // The AI tag holds its full two seconds before the sheet scrolls away from it.
  kakakTimes(SHOTS_60.s2, 10, 46, { scroll: true, scrollGap: 60 }),
  kakakTimes(SHOTS_60.s3, 8, 62),
  kakakTimes(SHOTS_60.s4, 6, 46),
];
export const K15 = kakakTimes(SHOTS_15.s2, 14, 0, { startTyped: true, scroll: true, scrollGap: 60, think: 12 });

export interface StaffTimes {
  card: number;
  sheet: number;
  before: number;
  beforeIn: number;
  after: number;
  afterIn: number;
  finish: number;
  done: number;
}

/**
 * Shot 5: Sari's taps on half beats (60 s), kept short on the empty sheet so
 * the time goes to the finished photos and the tick. The 15-second cut runs
 * the same beats faster, unsnapped.
 */
export const STAFF60: StaffTimes = (() => {
  const [start] = SHOTS_60.s5;
  const at = (f: number) => snapHalf(start + f) - start;
  const card = at(56);
  const before = at(76);
  const after = at(96);
  const finish = at(146);
  return { card, sheet: card + 8, before, beforeIn: before + 8, after, afterIn: after + 8, finish, done: finish + 8 };
})();
/** Shot 5 opens on the two phones side by side (owner, staff) until this frame, then the staff screen fills the frame. */
export const TWO_PHONES = { until: 34 };
export const STAFF15: StaffTimes = { card: 8, sheet: 14, before: 22, beforeIn: 28, after: 36, afterIn: 42, finish: 60, done: 66 };

/**
 * Shot 6: the 21.30 reminder arrives on Sari's phone; she taps it, takes the
 * photo of the dogs with the lights off, ticks them, saves: the tick.
 */
export const S6 = (() => {
  const [start] = SHOTS_60.s6;
  const at = (f: number) => snapHalf(start + f) - start;
  const push = at(22);
  const open = at(50);
  const camera = at(64);
  const save = at(104);
  return { push, open, camera, picked: camera + 8, save, done: save + 8 };
})();
/** Shot 8: the owner's only alert: the evening walk, not done (on a beat). */
export const S8 = { push: snap(SHOTS_60.s8[0] + 44) - SHOTS_60.s8[0] };
/** Shot 7: held on the status line, then the slow scroll past each person. */
export const S7 = { scrollFrom: 84, scrollLength: 110 };
/** Shot 9: Kitchen for two beats, Pets for one and a half, Repairs to the end. */
export const S9 = { pets: beat(2), repairs: beat(3.5) };

/**
 * The music's arc (design lead): what the track should do, against the cut.
 * Frames; used by the cue sheet (scripts/cues.ts).
 */
export const MUSIC_ARC: { from: number; to: number; what: string }[] = [
  { from: 0, to: SHOTS_60.s1[0], what: "near silence; the hook's three soft taps" },
  { from: SHOTS_60.s1[0], to: SHOTS_60.s2[0], what: "one motif" },
  { from: SHOTS_60.s2[0], to: SHOTS_60.s5[0], what: "a soft pulse, building a step with each Kakak sentence (shots 2, 3, 4)" },
  { from: SHOTS_60.s5[0], to: SHOTS_60.s7[0], what: "a small lift as the staff phone appears; steady through the evening reminder and its tick" },
  { from: SHOTS_60.s7[0], to: SHOTS_60.s8[0], what: "the high point, on \"All on track\"" },
  { from: SHOTS_60.s8[0], to: SHOTS_60.s9[0], what: "near silence under the owner's one \"not done\" notification (the evening walk)" },
  { from: SHOTS_60.s9[0], to: SHOTS_60.end[0], what: "the pulse returns" },
  { from: SHOTS_60.end[0], to: SHOTS_60.end[1], what: "resolve: a real ending on the last beat, not a fade" },
];
