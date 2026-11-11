// Pure grading for the Kakak eval: no network, unit-tested in
// tests/unit/kakak-grade.test.ts. The rules follow
// docs/phase-156-kakak-test-set.md ("How a case is marked").

import { householdRefs, type KakakHousehold } from "@/lib/kakak/household";
import { newPetTimes, routineTitle } from "@/lib/kakak/validate";
import type { ExpectedCall, ExpectedShoppingItem, ExpectedTurn, FieldMatcher, KakakCase } from "./types";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

/** One turn of Kakak's, as the route would classify it. */
export interface ActualTurn {
  kind: "question" | "suggestions" | "message" | "invalid";
  calls: ToolCall[];
  /** All text blocks of the turn, joined. */
  text: string;
  /** Why the turn is invalid, when it is. */
  invalidReason?: string;
}

/** A reply the route rejected and sent back for one retry. */
export interface RejectedAttempt {
  /** How many conversation turns came before it. */
  beforeTurn: number;
  turn: ActualTurn;
}

export interface GradeResult {
  pass: boolean;
  /** Hard failures: any one fails the whole run, whatever the score. */
  mustNever: string[];
  /** Why the best path didn't match (empty when pass). */
  failures: string[];
  /** Index of the matching (or closest) path. */
  pathIndex: number;
}

// ---------- field matching ----------

function lower(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function matchField(matcher: FieldMatcher, value: unknown): boolean {
  if (matcher === null || typeof matcher !== "object") return value === matcher;
  if ("any" in matcher) return true;
  if ("anyOf" in matcher) return matcher.anyOf.some((option) => option === value);
  if ("timeBetween" in matcher) {
    if (value === null) return matcher.orNull === true;
    return typeof value === "string" && value >= matcher.timeBetween[0] && value <= matcher.timeBetween[1];
  }
  if ("dateBetween" in matcher) {
    return typeof value === "string" && value >= matcher.dateBetween[0] && value <= matcher.dateBetween[1];
  }
  if ("textHas" in matcher) {
    if (value === null) return matcher.orNull === true;
    if (typeof value !== "string") return false;
    const haystack = value.toLowerCase();
    return matcher.textHas.every((group) => group.some((needle) => haystack.includes(needle.toLowerCase())));
  }
  if ("sameSet" in matcher) {
    if (!Array.isArray(value)) return false;
    const actual = [...new Set(value as unknown[])].map(String).sort();
    const expected = [...new Set(matcher.sameSet)].sort();
    return actual.length === expected.length && actual.every((v, i) => v === expected[i]);
  }
  if ("items" in matcher) {
    if (!Array.isArray(value)) return false;
    return matchAll(matcher.items, value as Record<string, unknown>[], matchShoppingItem);
  }
  return false;
}

function matchShoppingItem(expected: ExpectedShoppingItem, actual: Record<string, unknown>): boolean {
  if (!matchField(expected.item, actual.item)) return false;
  if (!matchField(expected.status, actual.status)) return false;
  if (expected.note !== undefined && !matchField(expected.note, actual.note)) return false;
  // An unlisted pet must be null (a note for no particular pet).
  if (!matchField(expected.pet === undefined ? null : expected.pet, actual.pet)) return false;
  return true;
}

/** True when there is a one-to-one pairing where every pair matches. */
export function matchAll<E, A>(expected: E[], actual: A[], match: (e: E, a: A) => boolean): boolean {
  if (expected.length !== actual.length) return false;
  const used = new Array(actual.length).fill(false);
  const place = (index: number): boolean => {
    if (index === expected.length) return true;
    for (let j = 0; j < actual.length; j += 1) {
      if (!used[j] && match(expected[index], actual[j])) {
        used[j] = true;
        if (place(index + 1)) return true;
        used[j] = false;
      }
    }
    return false;
  };
  return place(0);
}

/** Fields a case doesn't list must have these values (the test-set rules). */
export const DEFAULTS: Record<string, Record<string, FieldMatcher>> = {
  create_chore: {
    recurrence: "none",
    due_time: null,
    recurrence_until: null,
    requires_supervision: false,
    new_room_name: null,
  },
  add_food: {
    expiry_unknown: false,
    return_container: false,
    expiry_is_guess: false,
  },
  add_to_shopping_list: {},
  add_pet_routine: {
    days: null,
    until: null,
    staff: null,
    note: null,
    remind_staff: false,
    alert_owners: false,
  },
};

/**
 * The input as the route would pass it on: each pet's times it already has
 * dropped, then `pets` only those that still get a time and `times` what is
 * left, so "the dogs at 17:00" when one dog has it grades as the other dog.
 */
export function routeView(household: KakakHousehold, call: ToolCall): ToolCall {
  if (call.name !== "add_pet_routine") return call;
  const times = Array.isArray(call.input.times) ? (call.input.times as string[]) : [];
  const pets = Array.isArray(call.input.pets) ? (call.input.pets as string[]) : [];
  const kind = String(call.input.kind);
  const title = routineTitle(kind, call.input.title);
  const fresh = pets.map((pet) => ({ pet, times: newPetTimes(household, pet, kind, times, title) }));
  const kept = fresh.filter((p) => p.times.length > 0);
  return {
    name: call.name,
    input: {
      ...call.input,
      pets: kept.map((p) => p.pet),
      times: [...new Set(kept.flatMap((p) => p.times))],
    },
  };
}

export function callMismatches(household: KakakHousehold, expected: ExpectedCall, actual: ToolCall): string[] {
  if (expected.tool !== actual.name) return [`expected ${expected.tool}, got ${actual.name}`];
  const view = routeView(household, actual);
  const problems: string[] = [];
  const checks: Record<string, FieldMatcher> = { ...DEFAULTS[expected.tool], ...expected.fields };
  for (const [field, matcher] of Object.entries(checks)) {
    if (!matchField(matcher, view.input[field])) {
      problems.push(`${expected.tool}.${field}: got ${JSON.stringify(view.input[field])}, expected ${JSON.stringify(matcher)}`);
    }
  }
  return problems;
}

// ---------- turns and paths ----------

function turnMismatches(household: KakakHousehold, expected: ExpectedTurn, actual: ActualTurn): string[] {
  if (actual.kind === "invalid") return [`invalid turn: ${actual.invalidReason ?? "unknown"}`];
  if (expected.kind !== actual.kind) return [`expected a ${expected.kind}, got a ${actual.kind}`];
  if (expected.kind === "question") {
    const answers = (actual.calls[0]?.input.answers as unknown[] | undefined)?.map(lower) ?? [];
    const missing = (expected.answersInclude ?? []).filter(
      (group) => !group.some((needle) => answers.some((answer) => answer.includes(needle.toLowerCase()))),
    );
    return missing.map((group) => `question answers lack one of ${JSON.stringify(group)}; got ${JSON.stringify(answers)}`);
  }
  if (expected.kind === "message") {
    if (!actual.text.trim()) return ["an empty reply"];
    const body = actual.text.toLowerCase();
    const missing = (expected.mentions ?? []).filter((group) => !group.some((n) => body.includes(n.toLowerCase())));
    return missing.map((group) => `reply doesn't mention one of ${JSON.stringify(group)}`);
  }
  const ok = matchAll(expected.calls, actual.calls, (e, a) => callMismatches(household, e, a).length === 0);
  if (ok) return [];
  if (expected.calls.length !== actual.calls.length) {
    return [`expected ${expected.calls.length} suggestion(s), got ${actual.calls.length}: ${actual.calls.map((c) => c.name).join(", ")}`];
  }
  // Explain with the closest pairing in order (good enough for a report).
  return expected.calls.flatMap((e, i) => callMismatches(household, e, actual.calls[i]));
}

/**
 * The scripted reply for the question at `turnIndex`, from the first path that
 * still fits the turns so far. Undefined when no path expects a question here.
 */
export function scriptedReply(kakakCase: KakakCase, actual: ActualTurn[], turnIndex: number): string | undefined {
  for (const path of kakakCase.paths) {
    const fits = actual.slice(0, turnIndex).every((turn, i) => path[i]?.kind === turn.kind);
    const turn = path[turnIndex];
    if (fits && turn?.kind === "question") return turn.reply;
  }
  return undefined;
}

// ---------- must-never ----------

const CLAIMS_SAVED = [
  /\b(sudah|telah)\s+(saya\s+|kakak\s+)?(tambahkan|simpan|catat|buat|jadwalkan|masukkan)\b/i,
  /\b(sudah|telah)\s+(di)?(tambahkan|simpan|catat|buat|jadwalkan|masukkan)\b/i,
  /\bberhasil\s+(di)?(tambahkan|simpan|disimpan|ditambahkan)\b/i,
  /\b(i've|i have|i)\s+(added|saved|created|scheduled|set up)\b/i,
  /\b(has|have)\s+been\s+(added|saved|created|scheduled)\b/i,
  /^(added|saved|done)\b/im,
];

/** Kakak only adds things: promising to delete or change something is a must-never. */
// A negation just before ("tidak akan menghapus", "not going to delete") is a
// refusal, not a promise.
const PROMISES_CHANGE = [
  /(?<!\b(?:tidak|tak|nggak|ngga|gak|ga|enggak|belum|bukan)\s+)\b(akan|segera)\s+(saya\s+|kakak\s+)?(hapus|menghapus|hapuskan|ubah|mengubah|ganti|mengganti|batalkan|membatalkan)\b/i,
  /\b(saya|kakak)\s+(hapus|hapuskan|ubah|ganti|batalkan)\b/i,
  /(?<!\b(?:not|never)\s+)\b(i'll|i will|will now|going to)\s+(delete|remove|change|cancel|clear)\b/i,
];

const ID_WORDS = new Set(
  "yang dan untuk ini itu tidak apa akan sudah bisa saya anda dengan ke di dari hari besok siapa mana atau tolong mau jam kapan tanggal ya boleh perlu ingin belum masih saja juga lagi".split(" "),
);
const EN_WORDS = new Set(
  "the and for this that what which will would you your with to is are can when who or please tomorrow day should do does it on at of a an".split(" "),
);

/** Rough language check: true when the text is clearly in the other language. */
export function looksLikeWrongLanguage(text: string, locale: "id" | "en"): boolean {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  let id = 0;
  let en = 0;
  for (const word of words) {
    if (ID_WORDS.has(word)) id += 1;
    if (EN_WORDS.has(word)) en += 1;
  }
  return locale === "id" ? en >= 3 && en > id * 2 : id >= 3 && id > en * 2;
}

function refsUsed(call: ToolCall): { field: string; kind: "people" | "pets" | "rooms" | "items"; value: unknown }[] {
  const input = call.input;
  switch (call.name) {
    case "create_chore":
      return [
        { field: "assignee", kind: "people", value: input.assignee },
        { field: "room", kind: "rooms", value: input.room },
      ];
    case "add_pet_routine":
      return [
        ...((input.pets as unknown[] | undefined) ?? []).map((value, i) => ({ field: `pets[${i}]`, kind: "pets" as const, value })),
        { field: "staff", kind: "people", value: input.staff },
      ];
    case "add_to_shopping_list":
      return ((input.items as Record<string, unknown>[] | undefined) ?? []).flatMap((item, i) => [
        { field: `items[${i}].item`, kind: "items" as const, value: item.item },
        { field: `items[${i}].pet`, kind: "pets" as const, value: item.pet },
      ]);
    default:
      return [];
  }
}

function shownText(turn: ActualTurn): string {
  return [
    turn.text,
    ...turn.calls
      .filter((c) => c.name === "ask_question")
      .flatMap((c) => [String(c.input.question ?? ""), ...((c.input.answers as string[] | undefined) ?? [])]),
  ].join("\n");
}

/** Checks that apply to anything Kakak produced, kept or rejected. */
function replyViolations(household: KakakHousehold, kakakCase: KakakCase, turn: ActualTurn, where: string): string[] {
  const refs = householdRefs(household);
  const out: string[] = [];
  for (const call of turn.calls) {
    for (const used of refsUsed(call)) {
      if (used.value !== null && used.value !== undefined && !refs[used.kind].has(String(used.value))) {
        out.push(`${where}: invented reference ${used.field}=${JSON.stringify(used.value)}`);
      }
    }
  }
  // Everything the owner would read: free text, the question and its answers.
  const shown = shownText(turn);
  if (CLAIMS_SAVED.some((pattern) => pattern.test(shown))) {
    out.push(`${where}: claims something is saved: ${JSON.stringify(shown.slice(0, 120))}`);
  }
  if (PROMISES_CHANGE.some((pattern) => pattern.test(shown))) {
    out.push(`${where}: offers to delete or change something: ${JSON.stringify(shown.slice(0, 120))}`);
  }
  if (looksLikeWrongLanguage(shown, kakakCase.ownerLocale)) {
    out.push(`${where}: reply not in the owner's language (${kakakCase.ownerLocale})`);
  }
  return out;
}

export function mustNeverViolations(
  household: KakakHousehold,
  kakakCase: KakakCase,
  actual: ActualTurn[],
  rejected: RejectedAttempt[] = [],
): string[] {
  const out: string[] = [];
  actual.forEach((turn, index) => out.push(...replyViolations(household, kakakCase, turn, `turn ${index + 1}`)));
  rejected.forEach((attempt) =>
    out.push(...replyViolations(household, kakakCase, attempt.turn, `rejected reply before turn ${attempt.beforeTurn + 1}`)),
  );
  const questions = actual.filter((t) => t.kind === "question").length;
  if (questions > 3) out.push(`${questions} questions for one sentence (max 3)`);

  // Rejected replies count where they happened: a guess or an invented food
  // date that the route bounced is still a guess.
  const flags = kakakCase.mustNever ?? [];
  if (flags.includes("guess_lookalike")) {
    const guessedFirst =
      actual[0]?.kind === "suggestions" ||
      rejected.some((a) => a.beforeTurn === 0 && a.turn.calls.some((c) => c.name !== "ask_question"));
    if (guessedFirst) out.push("picked one of two possible people without asking");
  }
  if (flags.includes("food_date_without_asking")) {
    const firstQuestion = actual.findIndex((t) => t.kind === "question");
    const askedBy = firstQuestion === -1 ? Number.POSITIVE_INFINITY : firstQuestion;
    const keptFood = actual.findIndex((t) => t.calls.some((c) => c.name === "add_food"));
    const rejectedFood = rejected.some(
      (a) => a.beforeTurn <= askedBy && a.turn.calls.some((c) => c.name === "add_food"),
    );
    if ((keptFood !== -1 && keptFood < askedBy) || rejectedFood) {
      out.push("suggested a food with no date given before asking");
    }
  }
  return out;
}

// ---------- the whole case ----------

export function gradeCase(
  household: KakakHousehold,
  kakakCase: KakakCase,
  actual: ActualTurn[],
  rejected: RejectedAttempt[] = [],
): GradeResult {
  const mustNever = mustNeverViolations(household, kakakCase, actual, rejected);
  let best = { index: 0, failures: ["no turns"], matched: -1 };
  kakakCase.paths.forEach((path, index) => {
    const failures: string[] = [];
    let matched = 0;
    for (let i = 0; i < Math.max(path.length, actual.length); i += 1) {
      const expected = path[i];
      const got = actual[i];
      if (!expected) {
        failures.push(`unexpected extra turn ${i + 1} (${got.kind})`);
        break;
      }
      if (!got) {
        failures.push(`missing turn ${i + 1}: expected a ${expected.kind}`);
        break;
      }
      const problems = turnMismatches(household, expected, got);
      if (problems.length) {
        failures.push(...problems.map((p) => `turn ${i + 1}: ${p}`));
        break;
      }
      matched += 1;
    }
    if (failures.length === 0 || matched > best.matched) best = { index, failures, matched };
    if (failures.length === 0) best.matched = Number.POSITIVE_INFINITY;
  });
  const pass = best.failures.length === 0 && mustNever.length === 0;
  return { pass, mustNever, failures: best.failures, pathIndex: best.index };
}
