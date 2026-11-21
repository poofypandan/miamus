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
      /** Her line beside the card: each group must be in it (Can we cook it?: "everything but santan"). */
      mentions?: string[][];
      /** Her line must contain none of these (an amount she was never given). */
      avoids?: string[];
    }
  | {
      kind: "message";
      /** Each group: the reply must contain one of these (case-insensitive). */
      mentions?: string[][];
      /** The reply must contain none of these (case-insensitive): a made-up price, a list where a thank-you belongs. */
      avoids?: string[];
    };

export type MustNeverFlag =
  /** Two people fit the name: the first turn must not be a suggestion. */
  | "guess_lookalike"
  /** Food with no date given: no add_food before a question. */
  | "food_date_without_asking"
  /** Can we cook it?: anything she says states an amount with a kitchen unit ("400 ml"). She is never given one. */
  | "states_amount"
  /** Can we cook it?: anything she says names a word from the case's avoids lists (an ingredient no recipe lists). */
  | "invents_ingredient";

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
    | "staff_areas"
    /** Adding or bringing back a staff member, and removing one (staff onboarding step 5). */
    | "staff_add"
    | "staff_remove"
    | "safety"
    /** A question about Miamus, answered from the guide (Phase 180), and small talk. */
    | "about_miamus"
    /** Can we cook it? (20 Nov): a dish checked against what is at home, and put on the menu. */
    | "kitchen";
  /** Held back from prompt tuning; scored only in the final comparison. */
  holdout: boolean;
  /** Extra hard rules for this case (the automatic ones always apply). */
  mustNever?: MustNeverFlag[];
  /** Accepted paths; at least one. */
  paths: ExpectedTurn[][];
  /** Why the expectation is what it is, for reviewers. */
  note?: string;
  /**
   * PR C1: this case's own saved recipes and menu, in place of the shared
   * household's (nothing ready, a use-soon ingredient, no recipes). Applied
   * by householdForCase everywhere a case is run, checked or graded.
   */
  household?: Partial<Pick<KakakHousehold, "recipes" | "menu" | "foods">>;
}

/** The household a case runs against: the shared one, with the case's own recipes and menu. */
export function householdForCase(household: KakakHousehold, kakakCase: Pick<KakakCase, "household" | "ownerLocale">): KakakHousehold {
  return { ...household, ...(kakakCase.household ?? {}), ownerLocale: kakakCase.ownerLocale };
}

/** tests/kakak/test-set.json. The household is tests/kakak/household.json. */
export interface KakakTestSet {
  version: 1;
  cases: KakakCase[];
}

export type { KakakHousehold };
