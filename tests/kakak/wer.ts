// Word error rate and name checks for the speech-to-text comparison
// (tests/kakak/run-voice.ts). Pure functions, unit-tested in
// tests/unit/kakak-wer.test.ts.
//
// Normalising is deliberately simple: lowercase, punctuation removed,
// whitespace collapsed. Letters (accented ones included) and digits are kept,
// so "jam 9" stays "jam 9". Number words are NOT mapped to digits: "jam
// sembilan" vs "jam 9" counts as an error. Write reference transcripts the
// way the app should show them (digits for times) so that this is fair.

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(text: string): string[] {
  const clean = normalise(text);
  return clean ? clean.split(" ") : [];
}

export interface WerResult {
  /** (substitutions + deletions + insertions) / refWords; 0 when both are empty. */
  wer: number;
  substitutions: number;
  deletions: number;
  insertions: number;
  refWords: number;
}

/** Word-level Levenshtein alignment between a reference and a hypothesis. */
export function wordErrorRate(reference: string, hypothesis: string): WerResult {
  const ref = words(reference);
  const hyp = words(hypothesis);
  // cost[i][j] = edits to turn ref[0..i) into hyp[0..j), with the operation counts.
  type Cell = { cost: number; s: number; d: number; i: number };
  const rows: Cell[][] = [];
  for (let i = 0; i <= ref.length; i += 1) {
    const row: Cell[] = [];
    for (let j = 0; j <= hyp.length; j += 1) {
      if (i === 0) row.push({ cost: j, s: 0, d: 0, i: j });
      else if (j === 0) row.push({ cost: i, s: 0, d: i, i: 0 });
      else row.push({ cost: 0, s: 0, d: 0, i: 0 });
    }
    rows.push(row);
  }
  for (let i = 1; i <= ref.length; i += 1) {
    for (let j = 1; j <= hyp.length; j += 1) {
      if (ref[i - 1] === hyp[j - 1]) {
        rows[i][j] = { ...rows[i - 1][j - 1] };
        continue;
      }
      const sub = rows[i - 1][j - 1];
      const del = rows[i - 1][j];
      const ins = rows[i][j - 1];
      const best = Math.min(sub.cost, del.cost, ins.cost);
      if (best === sub.cost) rows[i][j] = { cost: sub.cost + 1, s: sub.s + 1, d: sub.d, i: sub.i };
      else if (best === del.cost) rows[i][j] = { cost: del.cost + 1, s: del.s, d: del.d + 1, i: del.i };
      else rows[i][j] = { cost: ins.cost + 1, s: ins.s, d: ins.d, i: ins.i + 1 };
    }
  }
  const end = rows[ref.length][hyp.length];
  const errors = end.s + end.d + end.i;
  return {
    wer: ref.length === 0 ? (hyp.length === 0 ? 0 : 1) : errors / ref.length,
    substitutions: end.s,
    deletions: end.d,
    insertions: end.i,
    refWords: ref.length,
  };
}

export interface NameHit {
  name: string;
  /** Present in the hypothesis as a whole word (case-insensitive). */
  hit: boolean;
}

function hasWord(text: string, name: string): boolean {
  const target = normalise(name);
  if (!target) return false;
  return ` ${normalise(text)} `.includes(` ${target} `);
}

/**
 * The household names (staff and pets) that appear in the reference, and
 * whether each also appears in the hypothesis. Honorifics don't matter:
 * "Mbak Sari" in the reference counts the name "Sari".
 */
export function nameHits(reference: string, hypothesis: string, names: string[]): NameHit[] {
  const seen = new Set<string>();
  const hits: NameHit[] = [];
  for (const name of names) {
    const key = normalise(name);
    if (!key || seen.has(key) || !hasWord(reference, name)) continue;
    seen.add(key);
    hits.push({ name, hit: hasWord(hypothesis, name) });
  }
  return hits;
}
