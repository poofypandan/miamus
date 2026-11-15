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
  quiet: [f(38), f(47)],
  ending: [f(47), f(60)],
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
  type: [60, 138] as Span,
  send: 150,
  card: 180,
  toCard: [184, 196] as Span,
  scroll: [258, 270] as Span,
  toOk: [272, 282] as Span,
  ok: 291,
  saved: 300,
};
/** 15 s (frames in "tell", 0 = 3.0 s): the typed sentence, the card held 2.4 s, "Looks right", "Saved". */
export const TELL15 = { type: [0, 36] as Span, send: 40, card: 50, toCard: [54, 64] as Span, scroll: [122, 132] as Span, ok: 138, saved: 143 };

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
// v7 (frames in "quiet", 0 = 38.0 s): "All on track" as one still with a slow push-in (3.4 s); the phone sleeps at
// 41.4 s and is set down; a small clock on its dark screen runs 4:30 → 5:30 while L9 is said and then nothing arrives.
// No notification and no ping: the silence is the promise. The phone falls away and the garden comes back at 47.0 s.
export const QUIET = { push: [0, 102] as Span, sleep: [102, 118] as Span, set: [120, 136] as Span, clock: [140, 236] as Span, away: [246, 270] as Span };

// v7 (Fable): the garden opens close on the pair (Mama already beside her, nothing in her hands). 48.0 the tug, the
// point, her handwriting and the bell; 49.0 Mama's "I'm looking, sweetie." as her hand comes up; ~51.2 she takes the
// girl's hand; 51.5 Kakak, softly, "That one's yours."; 53.0 the crane; Kakak's end line from 53.3; the card at 57.0.
// One set of cues for both languages, sized for Indonesian (Fable's final cue times).
export const ENDING = { mama: [-80, -1] as Span, tug: 30, point: 36, bell: 37, shade: [56, 71] as Span, hold: [120, 138] as Span, lift: [120, 250] as Span, crane: [180, 232] as Span, mark: 270, name: 279, line: 288, call: 300, url: 338 };
export const ENDING15 = { tug: 6, point: 12, bell: 13, shade: [18, 36] as Span, hold: [38, 56] as Span, mama: [-80, -1] as Span, lift: [28, 90] as Span, crane: [58, 96] as Span, mark: 70, name: 78, line: 84, call: 90, url: 106 };

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
