/**
 * The north star in numbers (Phase 172 PR 0, migrations/145).
 *
 * platform_north_star() returns S1–S5 per sign-up week plus a summary, as
 * counts, medians and shares only: no names, emails or household ids. This
 * module reads that answer defensively (anything malformed becomes null or
 * zero, never a crash) and turns it into the five tiles of
 * /dashboard/north-star. Pure: no network, no React.
 *
 * The signals (docs/app-evaluation-2026-11-10.md):
 *   S1  time to first value: staff finish a first task the same day, with
 *       under 10 minutes of the owner's setup time
 *   S2  at most 10 typed fields to set up a big house
 *   S3  at least 90% of due tasks closed (done, or "couldn't") without chasing
 *   S4  70% of new households active in week 4
 *   S5  50% of households that tried Kakak use her 3+ times in week 3
 */

export interface NorthStarNumbers {
  households: number;
  firstFinishMinutes: number | null;
  sameDay: number;
  sameDayOf: number;
  signupMinutes: number | null;
  setupHouseholds: number;
  setupMinutes: number | null;
  typedFields: number | null;
  handItems14d: number | null;
  handItems14dOf: number;
  s3Due: number;
  s3Closed: number;
  s4Active: number;
  s4Of: number;
  s5Repeat: number;
  s5Of: number;
}

export interface NorthStarWeek extends NorthStarNumbers {
  /** Monday, Jakarta, as YYYY-MM-DD. */
  weekStart: string;
  paths: { template: number; kakak: number; manual: number; mixed: number };
}

export interface NorthStarTargets {
  s1SetupMinutes: number;
  s2TypedFields: number;
  s3Share: number;
  s4Share: number;
  s5Share: number;
}

export interface NorthStarReport {
  asOf: string;
  targets: NorthStarTargets;
  summary: NorthStarNumbers;
  weeks: NorthStarWeek[];
}

/**
 * S1's "same day" as a share: met when the median household had a staff
 * member finish a first task on the day it was made.
 */
export const S1_SAME_DAY_SHARE = 0.5;

/** The targets the evaluation set; used when the answer leaves one out. */
export const DEFAULT_TARGETS: NorthStarTargets = {
  s1SetupMinutes: 10,
  s2TypedFields: 10,
  s3Share: 0.9,
  s4Share: 0.7,
  s5Share: 0.5,
};

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite number, or null. */
function num(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** A count: a whole number of at least 0 (anything else reads as 0). */
function count(value: unknown): number {
  const n = num(value);
  return n === null || n < 0 ? 0 : Math.floor(n);
}

function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function numbers(raw: Json): NorthStarNumbers {
  return {
    households: count(raw.households),
    firstFinishMinutes: num(raw.first_finish_minutes),
    sameDay: count(raw.same_day),
    sameDayOf: count(raw.same_day_of),
    signupMinutes: num(raw.signup_minutes),
    setupHouseholds: count(raw.setup_households),
    setupMinutes: num(raw.setup_minutes),
    typedFields: num(raw.typed_fields),
    handItems14d: num(raw.hand_items_14d),
    handItems14dOf: count(raw.hand_items_14d_of),
    s3Due: count(raw.s3_due),
    s3Closed: count(raw.s3_closed),
    s4Active: count(raw.s4_active),
    s4Of: count(raw.s4_of),
    s5Repeat: count(raw.s5_repeat),
    s5Of: count(raw.s5_of),
  };
}

/** The database's answer, or null if it isn't one. */
export function parseNorthStar(value: unknown): NorthStarReport | null {
  if (!isObject(value) || !isObject(value.summary) || !isDay(value.as_of)) return null;
  const t = isObject(value.targets) ? value.targets : {};
  const targets: NorthStarTargets = {
    s1SetupMinutes: num(t.s1_setup_minutes) ?? DEFAULT_TARGETS.s1SetupMinutes,
    s2TypedFields: num(t.s2_typed_fields) ?? DEFAULT_TARGETS.s2TypedFields,
    s3Share: num(t.s3_share) ?? DEFAULT_TARGETS.s3Share,
    s4Share: num(t.s4_share) ?? DEFAULT_TARGETS.s4Share,
    s5Share: num(t.s5_share) ?? DEFAULT_TARGETS.s5Share,
  };
  const weeks: NorthStarWeek[] = (Array.isArray(value.weeks) ? value.weeks : [])
    .filter((w): w is Json => isObject(w) && isDay(w.week_start))
    .map((w) => {
      const p = isObject(w.paths) ? w.paths : {};
      return {
        ...numbers(w),
        weekStart: w.week_start as string,
        paths: {
          template: count(p.template),
          kakak: count(p.kakak),
          manual: count(p.manual),
          mixed: count(p.mixed),
        },
      };
    })
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  return { asOf: value.as_of, targets, summary: numbers(value.summary), weeks };
}

/** part / whole, or null when there is nothing to divide. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? Math.min(Math.max(part / whole, 0), 1) : null;
}

/** "75%", or null. */
export function percent(value: number | null): string | null {
  return value === null ? null : `${Math.round(value * 100)}%`;
}

export type SignalStatus = "met" | "below" | "none";

/** At least the target (a share or a count to reach). */
export function atLeast(value: number | null, target: number): SignalStatus {
  if (value === null) return "none";
  return value >= target ? "met" : "below";
}

/** At most the target (minutes or fields to stay under). */
export function atMost(value: number | null, target: number): SignalStatus {
  if (value === null) return "none";
  return value <= target ? "met" : "below";
}

/**
 * Minutes as people say them: "45 min", "2 h 5 min", "3 d 4 h". Null stays
 * null. Rounded to whole minutes; under a minute reads "< 1 min".
 */
export function formatMinutes(minutes: number | null, locale: "en" | "id" = "en"): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  const m = Math.round(minutes);
  const words = locale === "id" ? { min: "mnt", h: "j", d: "h" } : { min: "min", h: "h", d: "d" };
  if (m < 1) return `< 1 ${words.min}`;
  if (m < 60) return `${m} ${words.min}`;
  if (m < 60 * 24) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} ${words.h} ${rest} ${words.min}` : `${h} ${words.h}`;
  }
  const d = Math.floor(m / (60 * 24));
  const h = Math.floor((m % (60 * 24)) / 60);
  return h ? `${d} ${words.d} ${h} ${words.h}` : `${d} ${words.d}`;
}

export interface SignalTile {
  key: "s1" | "s2" | "s3" | "s4" | "s5";
  /** The headline number, already formatted; null when there's no data yet. */
  value: string | null;
  status: SignalStatus;
  /** The parts behind the headline, for the line under it. */
  part: number;
  whole: number;
}

/**
 * The five tiles from the summary. S1's headline is the same-day share (the
 * owner-time half is its own line on the page); S2's is the median typed
 * fields from setup rows, which exist once the setup screens ship (PR A2).
 */
export function signalTiles(report: NorthStarReport): SignalTile[] {
  const s = report.summary;
  const t = report.targets;
  const sameDay = share(s.sameDay, s.sameDayOf);
  const s3 = share(s.s3Closed, s.s3Due);
  const s4 = share(s.s4Active, s.s4Of);
  const s5 = share(s.s5Repeat, s.s5Of);
  return [
    {
      key: "s1",
      value: percent(sameDay),
      status: atLeast(sameDay, S1_SAME_DAY_SHARE),
      part: s.sameDay,
      whole: s.sameDayOf,
    },
    {
      key: "s2",
      value: s.typedFields === null ? null : String(Math.round(s.typedFields)),
      status: atMost(s.typedFields, t.s2TypedFields),
      part: s.setupHouseholds,
      whole: s.households,
    },
    { key: "s3", value: percent(s3), status: atLeast(s3, t.s3Share), part: s.s3Closed, whole: s.s3Due },
    { key: "s4", value: percent(s4), status: atLeast(s4, t.s4Share), part: s.s4Active, whole: s.s4Of },
    { key: "s5", value: percent(s5), status: atLeast(s5, t.s5Share), part: s.s5Repeat, whole: s.s5Of },
  ];
}
