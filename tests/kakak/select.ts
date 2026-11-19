// Which sentences a run plays. The held-out sentences are the fair test of
// the finished instructions (docs/kakak-eval.md): they stay out of tuning, so
// a run plays them only when it is asked for the holdout by name, never
// because a sentence's id was typed, and never from GitHub, where every
// conversation is public. Pure; unit-tested.

import type { KakakCase, KakakTestSet } from "./types";

export const SPLITS = ["dev", "holdout", "all"] as const;
export type Split = (typeof SPLITS)[number];

export interface Selection {
  split: Split;
  cases: KakakCase[];
  /** Sentences were picked by id: whatever they score, the run is not a full evaluation. */
  chosen: boolean;
}

const list = (ids: string[]) => ids.join(", ");

/**
 * The sentences for `--split` (dev unless given) and `--cases`. Throws,
 * before anything is spent, on a split that doesn't exist, an id that
 * doesn't exist, an id outside the split, or the holdout on GitHub.
 */
export function selectCases(
  testSet: KakakTestSet,
  options: { split?: string; only?: string[]; onGitHub?: boolean } = {},
): Selection {
  const split = (options.split ?? "dev") as Split;
  if (!SPLITS.includes(split)) throw new Error("--split must be dev, holdout or all.");
  if (options.onGitHub && split !== "dev") {
    throw new Error(
      "The held-out sentences are never played from GitHub: every conversation there is public. Run them at the laptop.",
    );
  }
  const inSplit = testSet.cases.filter((c) => (split === "all" ? true : split === "holdout" ? c.holdout : !c.holdout));
  if (!options.only) {
    if (inSplit.length === 0) throw new Error("No cases selected.");
    return { split, cases: inSplit, chosen: false };
  }

  const ids = [...new Set(options.only.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error("No cases selected.");
  const known = new Map(testSet.cases.map((c) => [c.id, c]));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`No such sentence: ${list(unknown)}.`);
  const outside = ids.filter((id) => !inSplit.some((c) => c.id === id));
  if (outside.length) {
    throw new Error(
      split === "dev"
        ? `Held out, so not played: ${list(outside)}. Held-out sentences are played only with --split holdout, once the instructions have stopped changing.`
        : `Not in the ${split} split: ${list(outside)}.`,
    );
  }
  return { split, cases: inSplit.filter((c) => ids.includes(c.id)), chosen: true };
}
