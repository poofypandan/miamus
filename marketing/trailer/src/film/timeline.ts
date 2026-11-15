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
  // v6 (Fable's pacing): one task end to end, on the score's bars. The house-through-the-day scene is cut,
  // and the two-phone shot and Sari's phone are one staff beat.
  tell: [f(15), f(26.4)],
  staff: [f(26.4), f(38)],
  // v9 (Fable): the quiet beat gives 2.8 s to the climax; the garden opens on the pair at 44.2 s.
  quiet: [f(38), f(44.2)],
  ending: [f(44.2), f(60)],
} as const satisfies Record<string, Span>;

/** The 15-second cut: the hook, the one sentence, the staff, the garden, the name. */
export const S15 = {
  hook: [0, f(3)],
  tell: [f(3), f(8)],
  sari: [f(8), f(10)],
  ending: [f(10), f(15)],
} as const satisfies Record<string, Span>;

/** The hook: when each question lands (frames in the scene), faster and faster; then the stop. */
export const HOOK = {
  /** The child's call writes itself on (v6: with the bell, see `bell`). */
  call: 6,
  /** v6: the questions leave Mama's phone as the camera arrives at the kite (2.1 s), faster and faster. */
  at: [63, 71, 77, 82, 87, 92, 96, 99, 103, 105, 108, 110, 112, 114, 116, 117, 118, 119, 119, 119, 120],
  slam: 122,
  /** The held breath, then everything lets go. */
  fall: 134,
  /** v6 (Fable): a close two-shot from behind; the girl tugs Mama's dress twice, then points at the kite. */
  tugs: [2, 11],
  point: 19,
  /** The bell's three notes ("Ma-ma, look") start here, a third of a second apart; her handwriting writes on with them. */
  bell: 20,
  /** One move back and up along her arm and the string until the kite is in frame; her arm comes down slowly. */
  pull: [38, 63] as Span,
  armDown: [70, 115] as Span,
};
/** The same, for the 15-second cut. */
export const HOOK15 = {
  call: 2,
  at: [48, 51, 54, 56, 58, 59, 61, 63, 64, 65, 66, 67, 68, 69, 70, 70, 70, 71, 71, 71, 72],
  slam: 74,
  fall: 80,
  tugs: [2],
  point: 12,
  bell: 13,
  pull: [27, 48] as Span,
  armDown: [50, 80] as Span,
};

/** Kakak's sheet, sentence by sentence (frames in the "tell" scene). */
/**
 * v6 (Fable's pacing): only the terrace sentence is told to Kakak (frames in "tell", 0 = 15.0 s). One change at a
 * time, a pause before each tap, reading holds 2.5 s. The phone opens already framed on "Tell Kakak".
 */
export const TELL = {
  tap: 39,
  sheet: 45,
  toSheet: [50, 60] as Span,
  // v8: typed at a steady 15 characters a second (one every 2 frames) once the camera has settled.
  type: [58, 146] as Span,
  send: 156,
  card: 180,
  toCard: [184, 196] as Span,
  scroll: [258, 270] as Span,
  toOk: [272, 282] as Span,
  ok: 291,
  saved: 300,
};
/** 15 s (frames in "tell", 0 = 3.0 s): the typed sentence, the card held 2.4 s, "Looks right", "Saved". */
// v8: the input opens with the first words typed; the last 22 characters type at the same steady rate.
export const TELL15 = { type: [0, 44] as Span, send: 48, card: 58, toCard: [60, 70] as Span, scroll: [130, 138] as Span, ok: 141, saved: 145 };

/** v6: one staff beat (frames in "staff", 0 = 26.4 s): the line to Sari's phone, her list, the task, two photos, done. */
export const STAFF = {
  apart: [0, 18] as Span,
  line: [18, 40] as Span,
  push: [70, 93] as Span,
  card: 138,
  sheet: 144,
  toPhotos: [150, 162] as Span,
  before: 168,
  beforeIn: 177,
  after: 216,
  afterIn: 225,
  toFinish: [255, 267] as Span,
  finish: 276,
  done: 288,
  toDone: [296, 308] as Span,
};
/** 15 s: Sari's list with "Pel teras" highlighted and a slow push (frames in "sari", 0 = 8.0 s); no taps. */
export const SARI15 = { push: [0, 60] as Span, glow: 4 };

/** All on track; the phone sleeps; the one notification; the garden comes back (frames in "quiet"). */
// v9 (frames in "quiet", 0 = 38.0 s): "All on track" 38.0–41.0 with a slow push-in; the phone dark at 41.0; L9 while
// the clock runs; the phone falls away and the garden opens at 44.2 s. No notification, no ping.
export const QUIET = { push: [0, 86] as Span, sleep: [86, 96] as Span, set: [98, 112] as Span, clock: [100, 160] as Span, away: [168, 186] as Span };

// v9 (Fable; frames in "ending", 0 = 44.2 s): close on the pair. 45.0 the tug, her handwriting and the bell (the call
// rings in the last quiet bar); 47.0 Kakak softly "That one's yours." as the score opens; Mama turns ~48.4 and answers
// at 49.4; 51.0 the hand, then a 2 s hold; 53.0 the crane; 53.3 the end line; 57.0 the card's line on the bell;
// 57.6 the address. Bars fall on the odd seconds; the music is not re-cut.
export const ENDING = { mama: [-80, -1] as Span, tug: 24, point: 30, bell: 31, shade: [126, 141] as Span, hold: [204, 222] as Span, lift: [204, 334] as Span, crane: [264, 316] as Span, mark: 354, name: 363, line: 384, url: 402 };
// v9: the garden cut at 10.0 with the tug and bell together; the hand at 11.0 is her answer (a caption, as the end
// line needs the time); the end line from 11.85; the card's line on the bell at 13.0, the address at 13.4.
export const ENDING15 = { tug: 0, point: 6, bell: 1, shade: [16, 30] as Span, hold: [30, 46] as Span, mama: [-80, -1] as Span, lift: [28, 90] as Span, crane: [58, 96] as Span, mark: 70, name: 78, line: 90, url: 102 };

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
      call: [sec(HOOK.bell), at(S.ending, ENDING.bell)],
      tugs: [...HOOK.tugs.map((t) => sec(t + 3)), at(S.ending, ENDING.tug + 3)],
      taps: [at(S.tell, TELL.tap), at(S.tell, TELL.send), at(S.tell, TELL.ok), at(S.staff, STAFF.card), at(S.staff, STAFF.before), at(S.staff, STAFF.after), at(S.staff, STAFF.finish)],
      typing: [[at(S.tell, TELL.type[0]), at(S.tell, TELL.type[1])]],
      cards: [at(S.tell, TELL.card)],
      saved: [at(S.tell, TELL.saved), at(S.staff, STAFF.done)],
      shutters: [at(S.staff, STAFF.beforeIn), at(S.staff, STAFF.afterIn)],
      whooshes: [sec(S.tell[0]), at(S.staff, STAFF.line[0]), at(S.staff, STAFF.push[0]), sec(S.quiet[0]), at(S.quiet, QUIET.away[0])],
      arrive: at(S.staff, STAFF.line[1]),
      sleep: at(S.quiet, QUIET.sleep[0]),
      ping: null,
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
    call: [sec(HOOK15.bell), at(S.ending, ENDING15.bell)],
    tugs: [...HOOK15.tugs.map((t) => sec(t + 3)), at(S.ending, ENDING15.tug + 3)],
    taps: [at(S.tell, TELL15.send), at(S.tell, TELL15.ok)],
    typing: [[at(S.tell, TELL15.type[0]), at(S.tell, TELL15.type[1])]],
    cards: [at(S.tell, TELL15.card)],
    saved: [at(S.tell, TELL15.saved)],
    shutters: [],
    whooshes: [sec(S.tell[0]), sec(S.sari[0]), sec(S.ending[0])],
    arrive: null,
    sleep: null,
    ping: null,
    kakak: null,
    garden: [0, sec(S.ending[0])],
    mark: at(S.ending, ENDING15.mark),
  };
}
