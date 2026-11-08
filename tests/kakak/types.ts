// The format of tests/kakak/test-set.json. See docs/kakak-eval.md.
//
// A case is one sentence typed by the owner. It lists one or more accepted
// paths; each path is the sequence of turns Kakak may take. The runner plays
// the first turn, picks the path whose first turn has the same kind
// (question / suggestions / message), and, for a question, sends that path's
// scripted answer and plays on.

import type { KakakHousehold, KakakLocale } from "@/lib/kakak/household";
import type { KakakToolName } from "@/lib/kakak/tools";

/** One field check. A bare value means equal (strings compared exactly). */
export type FieldMatcher =
  | string
  | number
  | boolean
  | null
  | { anyOf: (string | number | boolean | null)[] }
  /** HH:mm inclusive range; orNull also accepts null. */
  | { timeBetween: [string, string]; orNull?: boolean }
  /** YYYY-MM-DD inclusive range. */
  | { dateBetween: [string, string] }
  /**
   * Text by meaning: every group must match; a group matches when the text
   * contains any of its strings (case-insensitive). orNull also accepts null.
   */
  | { textHas: string[][]; orNull?: boolean }
  /** Same set of strings, any order (pet times). */
  | { sameSet: string[] }
  /** Shopping items: same count, each expected item matched once, any order. */
  | { items: ExpectedShoppingItem[] }
  /** Anything, including null. */
  | { any: true };

export interface ExpectedShoppingItem {
  item: FieldMatcher;
  status: FieldMatcher;
  note?: FieldMatcher;
  pet?: FieldMatcher;
}

export interface ExpectedCall {
  tool: Exclude<KakakToolName, "ask_question">;
  /** Fields to check. Unlisted fields must equal the tool's defaults (grade.ts). */
  fields: Record<string, FieldMatcher>;
}

export type ExpectedTurn =
  | {
      kind: "question";
      /** What the question is about, for people reading results. */
      about: string;
      /** Each group: one of these must be among the offered answers (case-insensitive substring). */
      answersInclude?: string[][];
      /** The answer the runner taps (or types, if no offered answer contains it). */
      reply: string;
    }
  | {
      kind: "suggestions";
      /** Exactly these calls, any order. */
      calls: ExpectedCall[];
    }
  | {
      kind: "message";
      /** Each group: the reply must contain one of these (case-insensitive). */
      mentions?: string[][];
    };

export type MustNeverFlag =
  /** Two people fit the name: the first turn must not be a suggestion. */
  | "guess_lookalike"
  /** Food with no date given: no add_food before a question. */
  | "food_date_without_asking";

export interface KakakCase {
  /** K001…K100. */
  id: string;
  sentence: string;
  /** The owner's chosen language for this run (replies must be in it). */
  ownerLocale: KakakLocale;
  /** The language the sentence is written in. */
  lang: "id" | "en" | "mixed";
  category:
    | "chore_repeat"
    | "chore_once"
    | "shopping"
    | "pet_routine"
    | "food"
    | "several"
    | "cannot_do"
    | "safety";
  /** Held back from prompt tuning; scored only in the final comparison. */
  holdout: boolean;
  /** Extra hard rules for this case (the automatic ones always apply). */
  mustNever?: MustNeverFlag[];
  /** Accepted paths; at least one. */
  paths: ExpectedTurn[][];
  /** Why the expectation is what it is, for reviewers. */
  note?: string;
}

/** tests/kakak/test-set.json. The household is tests/kakak/household.json. */
export interface KakakTestSet {
  version: 1;
  cases: KakakCase[];
}

export type { KakakHousehold };
