/**
 * When things happen. Frames at 30 fps; the music is in 6/8 with one pulse a
 * second and its bars start at 5.0 s, so every cut below sits on a pulse.
 *
 * No imports: audio/cues.mjs reads this file with plain Node to tell the
 * mixer (audio/mix.py) where each sound goes, so picture and sound can't
 * disagree.
 */
export const FPS = 30;
export const f = (sec: number) => Math.round(sec * FPS);

export type Span = readonly [number, number];
export const len = (s: Span) => s[1] - s[0];

/** The 60-second cut: a day, in order. */
export const S60 = {
  hook: [0, f(5)],
  turn: [f(5), f(11)],
  kakak: [f(11), f(15)],
  tell: [f(15), f(25)],
  know: [f(25), f(31)],
  sari: [f(31), f(35)],
  day: [f(35), f(39)],
  quiet: [f(39), f(47)],
  ending: [f(47), f(60)],
} as const satisfies Record<string, Span>;

/** The 15-second cut: the hook, the one sentence, the staff, the garden, the name. */
export const S15 = {
  hook: [0, f(3)],
  tell: [f(3), f(7.2)],
  sari: [f(7.2), f(10)],
  ending: [f(10), f(15)],
} as const satisfies Record<string, Span>;

/** The hook: when each question lands (frames in the scene), faster and faster; then the stop. */
export const HOOK = {
  /** The child's call writes itself on. */
  call: 4,
  at: [16, 30, 42, 52, 61, 69, 76, 82, 88, 93, 98, 102, 106, 109, 112, 114, 116, 117, 118, 119, 120],
  slam: 122,
  /** The held breath, then everything lets go. */
  fall: 134,
};
/** The same, for the 15-second cut. */
export const HOOK15 = {
  call: 2,
  at: [8, 16, 23, 29, 34, 39, 43, 47, 51, 54, 57, 60, 62, 64, 66, 67, 68, 69, 70, 71, 72],
  slam: 74,
  fall: 80,
};

/** Kakak's sheet, sentence by sentence (frames in the "tell" scene). */
export const TELL = {
  /** The Today screen, top to the "Tell Kakak" button. */
  pan: [12, 32] as Span,
  tap: 40,
  sheet: 46,
  // Sentence one: playtime for Coco and Bruno, typed out.
  type1: [58, 100] as Span,
  send1: 105,
  card1: 120,
  down1: [150, 164] as Span,
  save1: 186,
  saved1: 193,
  // Sentence two: the terrace, already typed.
  cut2: 206,
  send2: 214,
  card2: 228,
  scroll2: [252, 266] as Span,
  ok2: 280,
  saved2: 287,
};
export const TELL15 = { send: 8, card: 22, scroll: [50, 64] as Span, ok: 92, saved: 99 };

/** The line from the owner's phone to Sari's, and the push into hers (frames in "know"). */
export const KNOW = { apart: [0, 22] as Span, line: [30, 56] as Span, push: [82, 110] as Span };

/** Sari's phone: the task, the two photos, done (frames in "sari"). */
export const SARI = { card: 8, sheet: 14, before: 30, beforeIn: 38, after: 54, afterIn: 62, finish: 84, done: 92 };
export const SARI15 = { card: 6, sheet: 12, before: 22, beforeIn: 28, after: 38, afterIn: 44, finish: 58, done: 64 };

/** All on track; the phone sleeps; the one notification; the garden comes back (frames in "quiet"). */
export const QUIET = { scroll: [36, 84] as Span, sleep: [92, 122] as Span, ping: 136, call: 196, away: [204, 240] as Span };

/** The ending (frames in "ending"): Mama walks out, they look up, the camera follows the kite, the name. */
export const ENDING = { mama: [14, 110] as Span, lift: [120, 250] as Span, crane: [150, 262] as Span, mark: 258, name: 276, line: 292, url: 310 };
export const ENDING15 = { mama: [-40, 30] as Span, lift: [36, 96] as Span, crane: [44, 100] as Span, mark: 92, name: 102, line: 112, url: 122 };

/** Where the sounds go, in seconds from the start of each cut: read by audio/cues.mjs. */
export function soundCues(cut: "60" | "15") {
  const sec = (frame: number) => +(frame / FPS).toFixed(3);
  if (cut === "60") {
    const S = S60;
    const at = (span: Span, frame: number) => sec(span[0] + frame);
    return {
      length: 60,
      musicFrom: 5,
      pops: HOOK.at.map((a) => sec(a)),
      slam: sec(HOOK.slam),
      fall: sec(HOOK.fall),
      call: [sec(HOOK.call), at(S.quiet, QUIET.call)],
      taps: [
        at(S.tell, TELL.tap),
        at(S.tell, TELL.send1),
        at(S.tell, TELL.save1),
        at(S.tell, TELL.send2),
        at(S.tell, TELL.ok2),
        at(S.sari, SARI.card),
        at(S.sari, SARI.before),
        at(S.sari, SARI.after),
        at(S.sari, SARI.finish),
      ],
      typing: [[at(S.tell, TELL.type1[0]), at(S.tell, TELL.type1[1])]],
      cards: [at(S.tell, TELL.card1), at(S.tell, TELL.card2)],
      saved: [at(S.tell, TELL.saved1), at(S.tell, TELL.saved2), at(S.sari, SARI.done)],
      shutters: [at(S.sari, SARI.beforeIn), at(S.sari, SARI.afterIn)],
      whooshes: [sec(S.tell[0]), at(S.know, KNOW.line[0]), at(S.know, KNOW.push[0]), sec(S.day[0]), sec(S.quiet[0]), at(S.quiet, QUIET.away[0])],
      arrive: at(S.know, KNOW.line[1]),
      sleep: at(S.quiet, QUIET.sleep[0]),
      ping: at(S.quiet, QUIET.ping),
      kakak: sec(S.kakak[0] + 26),
      garden: [0, at(S.quiet, QUIET.away[0])],
      mark: at(S.ending, ENDING.mark),
    };
  }
  const S = S15;
  const at = (span: Span, frame: number) => sec(span[0] + frame);
  return {
    length: 15,
    musicFrom: 3,
    pops: HOOK15.at.map((a) => sec(a)),
    slam: sec(HOOK15.slam),
    fall: sec(HOOK15.fall),
    call: [sec(HOOK15.call), at(S.ending, 4)],
    taps: [at(S.tell, TELL15.send), at(S.tell, TELL15.ok), at(S.sari, SARI15.card), at(S.sari, SARI15.before), at(S.sari, SARI15.after), at(S.sari, SARI15.finish)],
    typing: [],
    cards: [at(S.tell, TELL15.card)],
    saved: [at(S.tell, TELL15.saved), at(S.sari, SARI15.done)],
    shutters: [at(S.sari, SARI15.beforeIn), at(S.sari, SARI15.afterIn)],
    whooshes: [sec(S.tell[0]), sec(S.sari[0]), sec(S.ending[0])],
    arrive: null,
    sleep: null,
    ping: null,
    kakak: null,
    garden: [0, sec(S.ending[0])],
    mark: at(S.ending, ENDING15.mark),
  };
}
