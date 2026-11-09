import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * The kinds of work a chore does, read from its own words (Phase 158, plan
 * D2): "Vacuum & pel, dusting plafon" is Vacuum, Mop and Dust. Nothing new to
 * fill in on a chore; the Rooms view uses this to answer "which rooms get
 * vacuumed, and which don't".
 *
 * Households write chores in Indonesian, English, or both, with their own
 * spellings, so each job lists the phrases seen in real titles. Matching is
 * on whole words, **longest phrase first, and a matched phrase is used up**:
 * "sedot debu" is read as Vacuum before the single word "debu" is looked at,
 * so "sedot debu karpet" is Vacuum only, never Vacuum and Dust (Codex, PR
 * #27). Add phrases here as households use new words; the unit tests run the
 * list over real title patterns.
 */
export const CHORE_JOBS = [
  "vacuum",
  "mop",
  "sweep",
  "dust",
  "toilet",
  "sheets",
  "towels",
  "trash",
  "tidy",
  "ironing",
  "windows",
  "plants",
] as const;

export type ChoreJob = (typeof CHORE_JOBS)[number];

const LABELS: Record<OwnerLocale, Record<ChoreJob, string>> = {
  en: {
    vacuum: "Vacuum",
    mop: "Mop",
    sweep: "Sweep",
    dust: "Dust",
    toilet: "Toilet",
    sheets: "Sheets",
    towels: "Towels",
    trash: "Trash",
    tidy: "Tidy",
    ironing: "Ironing",
    windows: "Windows",
    plants: "Plants",
  },
  // docs/indonesian-glossary.md, Phase 158 rows.
  id: {
    vacuum: "Vakum",
    mop: "Pel",
    sweep: "Sapu",
    dust: "Lap debu",
    toilet: "Toilet",
    sheets: "Seprai",
    towels: "Handuk",
    trash: "Sampah",
    tidy: "Rapikan",
    ironing: "Setrika",
    windows: "Kaca",
    plants: "Tanaman",
  },
};

export function choreJobLabel(job: ChoreJob, locale: OwnerLocale): string {
  return LABELS[locale][job];
}

/** Every phrase, lower-case, with the job it means. */
const PHRASES: Record<ChoreJob, string[]> = {
  vacuum: ["vacuum", "vacum", "vakum", "vaccum", "vacuming", "vacuuming", "sedot debu"],
  mop: ["pel", "ngepel", "mengepel", "mop", "mopping"],
  sweep: ["sapu", "nyapu", "menyapu", "sweep", "sweeping"],
  dust: ["dusting", "dust", "debu", "lap debu", "lap ambalan", "ambalan", "lap meja", "lap2 meja"],
  toilet: ["toilet", "wc", "kloset", "closet"],
  sheets: ["seprai", "seprei", "sprei", "sheets", "bed sheets"],
  towels: ["handuk", "towel", "towels"],
  trash: ["sampah", "trash", "garbage", "rubbish"],
  tidy: ["rapihkan", "rapikan", "merapikan", "beresin", "beres beres", "tidy", "tidy up"],
  ironing: ["setrika", "menyetrika", "ironing", "iron"],
  windows: ["kaca", "jendela", "window", "windows"],
  plants: ["siram", "menyiram", "tanaman", "plants", "water the plants"],
};

/** Longest first, so a longer phrase is matched (and used up) before its parts. */
const ORDERED: { words: string[]; job: ChoreJob }[] = CHORE_JOBS.flatMap((job) =>
  PHRASES[job].map((phrase) => ({ words: phrase.split(" "), job }))
).sort((a, b) => b.words.length - a.words.length || b.words.join(" ").length - a.words.join(" ").length);

/** Lower-case words, with punctuation and symbols ("&", ",", "-") as breaks. */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/**
 * The jobs a chore's text names, in CHORE_JOBS order, each once. Empty when
 * none of the words are known: the Rooms view shows such a chore under
 * "Other".
 */
export function choreJobsIn(text: string): ChoreJob[] {
  const words: (string | null)[] = wordsOf(text);
  const found = new Set<ChoreJob>();
  for (const { words: phrase, job } of ORDERED) {
    for (let i = 0; i + phrase.length <= words.length; i++) {
      let match = true;
      for (let j = 0; j < phrase.length; j++) {
        if (words[i + j] !== phrase[j]) {
          match = false;
          break;
        }
      }
      if (!match) continue;
      found.add(job);
      // Used up: the shorter phrases inside it can't match these words again.
      for (let j = 0; j < phrase.length; j++) words[i + j] = null;
    }
  }
  return CHORE_JOBS.filter((job) => found.has(job));
}

export function isChoreJob(value: string | null | undefined): value is ChoreJob {
  return !!value && (CHORE_JOBS as readonly string[]).includes(value);
}
