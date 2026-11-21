// Pure grading for the Kakak eval: no network, unit-tested in
// tests/unit/kakak-grade.test.ts. The rules follow
// docs/phase-156-kakak-test-set.md ("How a case is marked").

import { householdRefs, type KakakHousehold, type KakakLocale } from "@/lib/kakak/household";
import { IDEA_LINE, KITCHEN_AMOUNT, looksLikeWrongLanguage, noteTells, type NoteTell } from "@/lib/kakak/reply-guard";
import { FOOD_RULES_PRESETS, foodRulesQuestion, type FoodRule } from "@/lib/food-preferences";
import { toIsoDays } from "@/lib/kakak/suggestions";
import { newPetTimes, routineTitle } from "@/lib/kakak/validate";
import { householdForCase, type ExpectedCall, type ExpectedShoppingItem, type ExpectedTurn, type FieldMatcher, type KakakCase } from "./types";

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

/** One turn of Kakak's, as the route would classify it. */
export interface ActualTurn {
  kind: "question" | "suggestions" | "message" | "invalid";
  calls: ToolCall[];
  /**
   * All text blocks of the turn, joined, as the owner would see them: after
   * the route's guard (lib/kakak/reply-guard.ts) for a kept turn.
   */
  text: string;
  /** The model's own text before the guard, when the guard changed it. */
  rawText?: string;
  /** Why the guard replaced the text (the sheet's or the safe fallback line was used). */
  guarded?: string[];
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
  put_away_ingredient: {
    expiry_is_guess: false,
    // No amount unless the owner gave one; a listed item has no new name or shelf.
    amount: null,
    unit: null,
    new_name: null,
    shelf: null,
  },
  add_to_shopping_list: {},
  plan_dish: {},
  save_recipe_idea: {},
  set_staff_areas: {
    show: { sameSet: [] },
    hide: { sameSet: [] },
  },
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
  if (call.name === "put_away_ingredient") {
    // The newer fields read as null when a call leaves them out (validate.ts).
    return {
      name: call.name,
      input: { new_name: null, new_name_en: null, shelf: null, amount: null, unit: null, amount_is: "bought", ...call.input },
    };
  }
  if (call.name !== "add_pet_routine") return call;
  const times = Array.isArray(call.input.times) ? (call.input.times as string[]) : [];
  const pets = Array.isArray(call.input.pets) ? (call.input.pets as string[]) : [];
  const kind = String(call.input.kind);
  const title = routineTitle(kind, call.input.title);
  const request = { days: toIsoDays(call.input.days), until: typeof call.input.until === "string" ? call.input.until : null };
  const fresh = pets.map((pet) => ({ pet, times: newPetTimes(household, pet, kind, times, title, request) }));
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
    // PR C2: the food-rules card is its own kind of question.
    const card = actual.calls[0]?.name === "ask_food_preferences";
    if (expected.card === "food_rules" && !card) return ["expected the food-rules card (ask_food_preferences), got ask_question"];
    if (expected.card !== "food_rules" && card) return ["expected ask_question, got the food-rules card"];
    const answers = actual.calls[0] ? questionOf(actual.calls[0], household.ownerLocale).answers.map(lower) : [];
    const missing = (expected.answersInclude ?? []).filter(
      (group) => !group.some((needle) => answers.some((answer) => answer.includes(needle.toLowerCase()))),
    );
    return missing.map((group) => `question answers lack one of ${JSON.stringify(group)}; got ${JSON.stringify(answers)}`);
  }
  if (expected.kind === "message") {
    if (!actual.text.trim()) return ["an empty reply"];
    const body = actual.text.toLowerCase();
    const missing = (expected.mentions ?? []).filter((group) => !group.some((n) => body.includes(n.toLowerCase())));
    const said = (expected.avoids ?? []).filter((n) => body.includes(n.toLowerCase()));
    return [
      ...missing.map((group) => `reply doesn't mention one of ${JSON.stringify(group)}`),
      ...said.map((n) => `reply says ${JSON.stringify(n)}, which it must not`),
    ];
  }
  const ok = matchAll(expected.calls, actual.calls, (e, a) => callMismatches(household, e, a).length === 0);
  if (ok) {
    // Her line beside the card (Can we cook it?): what it must say and must not.
    // A line the guard dropped leaves the fallback, "Here's what I'll add:" (Fable S0).
    if ((expected.mentions ?? []).length && !actual.text.trim()) {
      return ["her line beside the card was dropped by the guard: the owner sees the fallback"];
    }
    const body = actual.text.toLowerCase();
    const missing = (expected.mentions ?? []).filter((group) => !group.some((n) => body.includes(n.toLowerCase())));
    const said = (expected.avoids ?? []).filter((n) => body.includes(n.toLowerCase()));
    return [
      ...missing.map((group) => `the line beside the card doesn't mention one of ${JSON.stringify(group)}`),
      ...said.map((n) => `the line beside the card says ${JSON.stringify(n)}, which it must not`),
    ];
  }
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

// The language check lives with the route's guard, which uses it too.
export { looksLikeWrongLanguage };

function refsUsed(call: ToolCall): { field: string; kind: "people" | "pets" | "rooms" | "items" | "recipes"; value: unknown }[] {
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
    case "put_away_ingredient":
      // Null is a new ingredient, by name: only a reference can be invented.
      return [{ field: "item", kind: "items", value: input.item }];
    case "plan_dish":
      // "none" is a typed dish, not a reference.
      return input.recipe === "none" ? [] : [{ field: "recipe", kind: "recipes", value: input.recipe }];
    case "save_recipe_idea":
      // PR C2: "none" is an ingredient that isn't listed, not a reference.
      return ((input.ingredients as { item?: unknown }[] | undefined) ?? [])
        .map((line, i) => ({ field: `ingredients[${i}].item`, kind: "items" as const, value: line?.item }))
        .filter((used) => used.value !== "none");
    default:
      return [];
  }
}

/**
 * A question call as the owner sees it: ask_question's own words, or the
 * app's fixed food-rules card for ask_food_preferences (PR C2, D2).
 */
export function questionOf(call: ToolCall, locale: KakakLocale): { question: string; answers: string[] } {
  if (call.name === "ask_food_preferences") {
    return { question: foodRulesQuestion(locale), answers: FOOD_RULES_PRESETS.map((p) => p[locale]) };
  }
  return { question: String(call.input.question ?? ""), answers: ((call.input.answers as unknown[] | undefined) ?? []).map(String) };
}

/** A question's words and answers. The food-rules card's are the app's, never Kakak's, so they are left out. */
function questionWords(turn: ActualTurn): string[] {
  return turn.calls
    .filter((c) => c.name === "ask_question")
    .flatMap((c) => [String(c.input.question ?? ""), ...((c.input.answers as string[] | undefined) ?? [])]);
}

function shownText(turn: ActualTurn): string {
  return [turn.text, ...questionWords(turn)].join("\n");
}

function questionText(turn: ActualTurn): string[] {
  return questionWords(turn);
}

/**
 * What the app actually shows of a kept turn: a question and its answers (the
 * route drops a question turn's free text), or the free text beside a card or
 * on its own, after the route's guard (run-core sets `text` to it).
 */
export function visibleText(turn: ActualTurn): string {
  if (turn.kind !== "question") return turn.text;
  return questionText(turn).join("\n");
}

export type LeakTell = NoteTell | "language";

function leakTells(text: string, locale: KakakLocale): LeakTell[] {
  const tells: LeakTell[] = noteTells(text);
  if (looksLikeWrongLanguage(text, locale)) tells.push("language");
  return tells;
}

/**
 * A leak on screen: a reference, an ISO date, a tool or field name, or the
 * wrong language in what the owner would read. A must-never on every case, so
 * a re-run measures what still gets past the guard.
 */
export function leakViolation(turn: ActualTurn, locale: KakakLocale, where: string): string | null {
  const shown = visibleText(turn);
  const tells = leakTells(shown, locale);
  if (tells.length === 0) return null;
  if (tells.length === 1 && tells[0] === "language") return `${where}: reply not in the owner's language (${locale})`;
  return `${where}: shows a note to self (${tells.join(", ")}): ${JSON.stringify(shown.slice(0, 120))}`;
}

/**
 * The same tells on the model's own words before the guard (a question
 * turn's free text included). Reported as a rate, never a failure: the guard
 * is there to catch them.
 */
export function rawLeakTells(turn: ActualTurn, locale: KakakLocale): LeakTell[] {
  const raw = turn.rawText ?? turn.text;
  return leakTells(turn.kind === "question" ? [raw, ...questionText(turn)].join("\n") : raw, locale);
}

/** Checks that apply to anything Kakak produced, kept or rejected. */
function replyViolations(household: KakakHousehold, turn: ActualTurn, where: string): string[] {
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
  // The wrong language is checked on what is shown (leakViolation).
  return out;
}

export function mustNeverViolations(
  household: KakakHousehold,
  kakakCase: KakakCase,
  actual: ActualTurn[],
  rejected: RejectedAttempt[] = [],
): string[] {
  const out: string[] = [];
  actual.forEach((turn, index) => {
    out.push(...replyViolations(household, turn, `turn ${index + 1}`));
    const leak = leakViolation(turn, kakakCase.ownerLocale, `turn ${index + 1}`);
    if (leak) out.push(leak);
  });
  rejected.forEach((attempt) =>
    out.push(...replyViolations(household, attempt.turn, `rejected reply before turn ${attempt.beforeTurn + 1}`)),
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
  // Can we cook it? (20 Nov): an amount or an ingredient she was never given,
  // in anything the owner would read, kept or bounced.
  const everything = [...actual.map((turn) => shownText(turn)), ...rejected.map((a) => shownText(a.turn))];
  if (flags.includes("states_amount") && everything.some((text) => KITCHEN_AMOUNT.test(text))) {
    out.push("stated an amount for a recipe, which she is never given");
  }
  // PR C2: the food-rules card is asked once, and never once it is saved.
  const saved = Array.isArray(household.foodRules);
  const cards = [...actual, ...rejected.map((a) => a.turn)].filter((t) => t.calls.some((c) => c.name === "ask_food_preferences"));
  if (saved && cards.length > 0) out.push("asked the food rules again, though they are saved");
  else if (actual.filter((t) => t.calls.some((c) => c.name === "ask_food_preferences")).length > 1) out.push("asked the food rules twice in one conversation");
  if (saved && [...actual, ...rejected.map((a) => a.turn)].some((t) => questionWords(t).some((w) => FOOD_RULES_QUESTION.test(w)))) {
    out.push("asked about food rules in words, though they are saved");
  }
  if (flags.includes("breaks_food_preference")) {
    const rules = new Set<FoodRule>([...(household.foodRules ?? []), ...tappedRules(kakakCase, actual)]);
    const ideaWords = [
      ...everything,
      ...[...actual, ...rejected.map((a) => a.turn)].flatMap((t) =>
        t.calls
          .filter((c) => c.name === "save_recipe_idea")
          .flatMap((c) => [String(c.input.name ?? ""), ...((c.input.ingredients as { name?: unknown }[] | undefined) ?? []).map((l) => String(l?.name ?? ""))]),
      ),
    ];
    const broken = [...rules].flatMap((rule) => ruleBreaks(rule, ideaWords).map((word) => `${rule}: ${word}`));
    if (broken.length) out.push(`broke the food preferences: ${[...new Set(broken)].join(", ")}`);
  }
  if (flags.includes("idea_as_recipe")) {
    const lines = everything.flatMap((text) => text.split("\n")).filter((line) => IDEA_LINE.test(line));
    if (lines.some((line) => IDEA_AS_RECIPE.test(line))) out.push("called an idea ready or a saved recipe");
  }
  if (flags.includes("invents_ingredient")) {
    const words = kakakCase.paths.flatMap((path) => path.flatMap((turn) => (turn.kind === "question" ? [] : (turn.avoids ?? []))));
    const named = [...new Set(words)].filter((w) => everything.some((text) => text.toLowerCase().includes(w.toLowerCase())));
    if (named.length) out.push(`named an ingredient no recipe lists: ${named.join(", ")}`);
  }
  return out;
}

// ---------- food preferences (PR C2) ----------

/** A question in words about the household's food rules. */
const FOOD_RULES_QUESTION = /\b(aturan makanan|pantangan|food rules?|dietary|halal)\b/i;

/** An idea line that calls the idea ready or a saved recipe. */
const IDEA_AS_RECIPE = /\b(ready|siap|saved recipe|resep tersimpan|sudah tersimpan)\b/i;

/** Words each rule rules out (plan, section 4). Matched as whole words. */
const RULE_WORDS: Record<FoodRule, string[]> = {
  halal: ["babi", "pork", "bacon", "ham", "lard", "minyak babi", "char siu", "samcan"],
  no_alcohol: ["ang ciu", "angciu", "arak", "mirin", "rum", "wine", "bir", "beer", "sake", "sherry"],
  no_beef: ["sapi", "beef", "rendang daging", "bakso sapi"],
  vegetarian: [
    "babi", "pork", "bacon", "ham", "sapi", "beef", "daging", "meat", "ayam", "chicken", "ikan", "fish",
    "udang", "shrimp", "prawn", "cumi", "squid", "kambing", "lamb", "mutton", "bebek", "duck", "seafood",
  ],
};

/** "tanpa arak", "no pork", "instead of wine": naming a word to leave it out isn't using it. */
const LEFT_OUT = /\b(tanpa|no|without|bebas|ganti|gantikan|pengganti|instead of|bukan|selain|except)\s+(\S+\s+)?$/i;

function ruleBreaks(rule: FoodRule, texts: string[]): string[] {
  const found: string[] = [];
  for (const word of RULE_WORDS[rule]) {
    const pattern = new RegExp(`\\b${word.replace(/\s+/g, "\\s+")}\\b`, "gi");
    for (const text of texts) {
      for (const match of text.matchAll(pattern)) {
        const before = text.slice(Math.max(0, (match.index ?? 0) - 24), match.index);
        if (!LEFT_OUT.test(before)) found.push(word);
      }
    }
  }
  return found;
}

/** The rules the owner answered on the food-rules card in this conversation, from the case's scripted reply. */
function tappedRules(kakakCase: KakakCase, actual: ActualTurn[]): FoodRule[] {
  const out: FoodRule[] = [];
  actual.forEach((turn, index) => {
    if (!turn.calls.some((c) => c.name === "ask_food_preferences")) return;
    const reply = (scriptedReply(kakakCase, actual, index) ?? "").toLowerCase();
    if (/halal/.test(reply)) out.push("halal");
    if (/alkohol|alcohol/.test(reply)) out.push("no_alcohol");
    if (/sapi|beef/.test(reply)) out.push("no_beef");
    if (/vegetari/.test(reply)) out.push("vegetarian");
  });
  return out;
}

// ---------- the whole case ----------

export function gradeCase(
  household: KakakHousehold,
  kakakCase: KakakCase,
  actual: ActualTurn[],
  rejected: RejectedAttempt[] = [],
): GradeResult {
  household = householdForCase(household, kakakCase);
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
