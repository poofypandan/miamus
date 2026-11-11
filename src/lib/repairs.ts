import { nextOccurrence, occursOn, previousOccurrence, recurrenceOf } from "@/lib/chore-recurrence";
import type { OwnerLocale } from "@/lib/owner-locale";
import { dayKeyOf, isOpenWalkIn, walkInsOf } from "@/lib/repair-walkins";
import type { HouseholdTask, Repair, RepairWalkIn } from "@/types/database";

/**
 * Repairs (Phase 159, docs/phase-159-repairs-plan.md): pure rules, tested
 * without a browser. A repair is a problem in a room fixed by one or more
 * visits; a visit is a chore with repair_id set. "Scheduled" and "work done"
 * are read from the visits here, never stored (migrations/130).
 */

export const REPAIR_LIMITS = { title: 120, details: 500, dismissReason: 200, fixedByName: 60 } as const;

/** How long fixed repairs stay in the Repairs list; older ones live in the rooms' history. */
export const FIXED_LIST_DAYS = 30;

/** A staff phone may take back its own report for this long (migrations/130's delete policy). */
export const STAFF_UNDO_MS = 5 * 60 * 1000;

/**
 * Where an open repair stands, from its visits:
 *   unscheduled  no visit planned, none done yet;
 *   scheduled    a visit still to happen (the next one is `next`);
 *   check        visits done and none still to happen: "work done — check the photos".
 */
export type RepairStage =
  | { kind: "reported" }
  | { kind: "unscheduled" }
  /** A walk-in still open: someone is working on it now (Phase 174). */
  | { kind: "working"; walkIn: RepairWalkIn }
  | { kind: "scheduled"; next: HouseholdTask }
  | { kind: "check"; last: HouseholdTask }
  | { kind: "fixed" }
  | { kind: "dismissed" };

/** Today as a day key ("2026-11-09"), in the phone's time zone. */
function todayKey(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** The visits of one repair, in date then time order. */
export function visitsOf(repairId: string, visits: HouseholdTask[]): HouseholdTask[] {
  return visits
    .filter((v) => v.repair_id === repairId && v.status !== "cancelled")
    .sort(
      (a, b) =>
        a.due_date.localeCompare(b.due_date) || (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99")
    );
}

/**
 * A repeating visit's next day still to happen, from today on, or null when
 * its run is over. Its template's own status only speaks for its first day;
 * later days are virtual until someone writes them (expandChores), and a day
 * written as done or called off is skipped (Codex, PR #37).
 */
function nextRepeatDay(template: HouseholdTask, rows: HouseholdTask[], today: string): string | null {
  const settled = new Set(
    rows
      .filter((r) => r.parent_task_id === template.id && r.status !== "pending")
      .map((r) => r.due_date)
  );
  if (template.status !== "pending") settled.add(template.due_date);
  // A missed day still owed, exactly as expandChores carries it into Today
  // as overdue: the most recent day before today, while today isn't one of
  // the repeat's days, and nobody has written that day yet (Codex, PR #37).
  if (!occursOn(template, today)) {
    const missed = previousOccurrence(template, today);
    if (missed && !rows.some((r) => r.parent_task_id === template.id && r.due_date === missed)) {
      if (missed !== template.due_date || template.status === "pending") return missed;
    }
  }
  let day: string | null =
    today < template.due_date ? template.due_date : occursOn(template, today) ? today : nextOccurrence(template, today);
  // A handful of steps is plenty: each settled day is one already written.
  for (let i = 0; day && i < 400; i++) {
    if (!settled.has(day)) return day;
    day = nextOccurrence(template, day);
  }
  return null;
}

/**
 * A staff report that already has a walk-in skips To review: someone is
 * already fixing it (Phase 174). It reads as open from then on.
 */
export function awaitsReview(repair: Repair, walkIns: readonly RepairWalkIn[] = []): boolean {
  return repair.status === "reported" && !walkIns.some((v) => v.repair_id === repair.id);
}

/** Open for the lists: an accepted repair, or a staff report with a walk-in. */
export function isOpenRepair(repair: Repair, walkIns: readonly RepairWalkIn[] = []): boolean {
  return repair.status === "open" || (repair.status === "reported" && !awaitsReview(repair, walkIns));
}

export function repairStage(
  repair: Repair,
  visits: HouseholdTask[],
  today: string = todayKey(),
  walkIns: readonly RepairWalkIn[] = []
): RepairStage {
  if (awaitsReview(repair, walkIns)) return { kind: "reported" };
  if (repair.status === "fixed") return { kind: "fixed" };
  if (repair.status === "dismissed") return { kind: "dismissed" };
  const myWalkIns = walkInsOf(repair.id, walkIns);
  const working = myWalkIns.filter(isOpenWalkIn);
  if (working.length > 0) return { kind: "working", walkIn: working[working.length - 1] };
  const mine = visitsOf(repair.id, visits);
  // Days called off stay in for the recurrence: a skipped day is settled,
  // not still to come (Codex, PR #37). They're left out of the history.
  const allRows = visits.filter((v) => v.repair_id === repair.id);
  const repeats = mine.filter((v) => !v.parent_task_id && recurrenceOf(v) !== "none");
  const upcoming: HouseholdTask[] = [
    // One-off visits, and days of a repeat written as their own rows.
    ...mine.filter((v) => v.status === "pending" && recurrenceOf(v) === "none"),
    // A repeat still running: its next day, as that day would read.
    ...repeats.flatMap((t) => {
      const day = nextRepeatDay(t, allRows, today);
      return day ? [{ ...t, due_date: day, status: "pending" as const }] : [];
    }),
  ].sort(
    (a, b) =>
      a.due_date.localeCompare(b.due_date) || (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99")
  );
  if (upcoming.length > 0) return { kind: "scheduled", next: upcoming[0] };
  const done = mine.filter((v) => v.status === "completed");
  // The latest finished walk-in, unless a scheduled visit was finished after
  // it: "work done — check the photos", except when the tukang is coming
  // back (Phase 174, plan mockup 5).
  const lastWalkIn = myWalkIns.filter((v) => !!v.left_at).at(-1) ?? null;
  const lastDone = done.length > 0 ? done[done.length - 1] : null;
  const walkInIsLatest =
    !!lastWalkIn && (!lastDone || (lastWalkIn.left_at ?? "") >= (lastDone.completed_at ?? lastDone.due_date));
  if (walkInIsLatest) return lastWalkIn.outcome === "come_back"
      ? { kind: "unscheduled" }
      : { kind: "check", last: walkInAsTask(lastWalkIn, repair.title) };
  if (lastDone) return { kind: "check", last: lastDone };
  return { kind: "unscheduled" };
}

/**
 * A walk-in in the shape of a finished visit (its photos and time), so the
 * before-and-after picture (ChoreProofPhotos) and a "check" stage read it
 * like a scheduled visit.
 */
export function walkInAsTask(visit: RepairWalkIn, title = ""): HouseholdTask {
  return {
    id: visit.id,
    household_id: visit.household_id,
    repair_id: visit.repair_id,
    title,
    status: "completed",
    due_date: dayKeyOf(visit.left_at ?? visit.arrived_at),
    completed_at: visit.left_at,
    before_photo_url: visit.before_photo_url,
    after_photo_url: visit.after_photo_url,
    photo_url: visit.after_photo_url,
  } as HouseholdTask;
}

export interface RepairsBoard {
  /** Staff reports waiting for an owner, urgent first, oldest first. */
  toReview: Repair[];
  /** Open repairs, urgent first, then those needing a check, then by age. */
  open: Repair[];
  /** Fixed in the last 30 days, newest first. */
  fixed: Repair[];
}

export function repairsBoard(
  repairs: Repair[],
  visits: HouseholdTask[],
  now: Date = new Date(),
  walkIns: readonly RepairWalkIn[] = []
): RepairsBoard {
  const since = now.getTime() - FIXED_LIST_DAYS * 24 * 60 * 60 * 1000;
  const urgentFirst = (a: Repair, b: Repair) => Number(b.urgent) - Number(a.urgent);
  const oldestFirst = (a: Repair, b: Repair) => a.created_at.localeCompare(b.created_at);
  // Someone working on it now first, then work to check, then the rest.
  const stageRank = (r: Repair) => {
    const kind = repairStage(r, visits, todayKey(now), walkIns).kind;
    return kind === "working" ? 0 : kind === "check" ? 1 : 2;
  };
  return {
    toReview: repairs.filter((r) => awaitsReview(r, walkIns)).sort((a, b) => urgentFirst(a, b) || oldestFirst(a, b)),
    open: repairs
      .filter((r) => isOpenRepair(r, walkIns))
      .sort((a, b) => urgentFirst(a, b) || stageRank(a) - stageRank(b) || oldestFirst(a, b)),
    fixed: repairs
      .filter((r) => r.status === "fixed" && r.closed_at && new Date(r.closed_at).getTime() >= since)
      .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? "")),
  };
}

/** What the owners' Today screen says, when there is anything (both counts may be 0). */
export function repairsToday(
  repairs: Repair[],
  visits: HouseholdTask[],
  walkIns: readonly RepairWalkIn[] = []
): { toReview: number; toCheck: number } {
  return {
    toReview: repairs.filter((r) => awaitsReview(r, walkIns)).length,
    toCheck: repairs.filter(
      (r) => isOpenRepair(r, walkIns) && repairStage(r, visits, todayKey(), walkIns).kind === "check"
    ).length,
  };
}

export function repairsTodayLabel(kind: "review" | "check", count: number, locale: OwnerLocale): string {
  if (kind === "review") {
    return locale === "id"
      ? `${count} laporan kerusakan perlu dicek`
      : `${count} repair${count === 1 ? "" : "s"} to review`;
  }
  return locale === "id"
    ? `${count} perbaikan selesai — cek fotonya`
    : `${count} repair${count === 1 ? "" : "s"} done — check the photos`;
}

/**
 * What a staff member sees beside their own report (Bahasa Indonesia only):
 * Menunggu dicek · Diterima · Dijadwalkan · Sudah diperbaiki · Tidak perlu.
 */
export function staffRepairStatus(
  repair: Repair,
  visits: HouseholdTask[],
  walkIns: readonly RepairWalkIn[] = []
): string {
  const stage = repairStage(repair, visits, todayKey(), walkIns);
  switch (stage.kind) {
    case "reported":
      return "Menunggu dicek";
    case "working":
      return "Sedang dikerjakan";
    case "scheduled":
      return "Dijadwalkan";
    case "check":
      return "Sedang dicek pemilik";
    case "fixed":
      return "Sudah diperbaiki";
    case "dismissed":
      return repair.dismiss_reason ? `Tidak perlu: ${repair.dismiss_reason}` : "Tidak perlu";
    default:
      return "Diterima";
  }
}

/** A visit's title, as the chore form starts it: "Perbaiki: dinding retak". Staff read it, so Indonesian. */
export function visitTitle(repair: Repair): string {
  const title = `Perbaiki: ${repair.title.trim()}`;
  return title.length > 120 ? `${title.slice(0, 119).trimEnd()}…` : title;
}

/** The visit's notes: who is coming, when the owner has named them. */
export function visitNotes(repair: Repair): string | null {
  return repair.fixed_by_name ? `Tukang: ${repair.fixed_by_name}` : null;
}

/** May this phone still take back its report? (its own, still waiting, under 5 minutes old) */
export function canUndoReport(repair: Repair, staffId: string | null, now: number = Date.now()): boolean {
  return (
    repair.status === "reported" &&
    !!staffId &&
    repair.reported_by_staff === staffId &&
    now - new Date(repair.created_at).getTime() < STAFF_UNDO_MS
  );
}

// --- PR B (migrations/131): notes, cost, warranty, repair people -------------

/** A note is short (repair_notes' check). */
export const NOTE_LIMIT = 500;
/** A cost's note (repair_costs' check). */
export const COST_NOTE_LIMIT = 200;

/** May this phone still take back its note? (its own, under 5 minutes old) */
export function canTakeBackNote(
  note: { staff_id: string | null; created_at: string },
  staffId: string | null,
  now: number = Date.now()
): boolean {
  return !!staffId && note.staff_id === staffId && now - new Date(note.created_at).getTime() < STAFF_UNDO_MS;
}

/** "Mon 9 Nov, 14:05" (or "2:05 PM" in English) for a note's time. */
export function noteTime(iso: string, locale: OwnerLocale): string {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Rupiah as people write it: "Rp350.000". */
export function formatIdr(amount: number): string {
  return `Rp${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(amount)}`;
}

/**
 * What an owner typed as a cost, as whole rupiah: "350.000", "350000",
 * "Rp 350.000" and "350rb" all read 350000. Null for blank or unreadable.
 */
export function parseIdr(text: string): number | null {
  const raw = text.trim().toLowerCase().replace(/^rp\.?\s*/, "");
  if (!raw) return null;
  const thousands = /^(\d+(?:[.,]\d+)?)\s*(rb|ribu|k)$/.exec(raw);
  if (thousands) return Math.round(Number(thousands[1].replace(",", ".")) * 1000);
  const millions = /^(\d+(?:[.,]\d+)?)\s*(jt|juta)$/.exec(raw);
  if (millions) return Math.round(Number(millions[1].replace(",", ".")) * 1_000_000);
  const compact = raw.replace(/\s/g, "");
  // Indonesian grouping, cents optional: 350.000 / 350.000,00 (Codex, PR #38).
  const indonesian = /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(compact);
  // English grouping: 350,000 / 350,000.00.
  const english = /^(\d{1,3}(?:,\d{3})+)(?:\.(\d{1,2}))?$/.exec(compact);
  // No grouping: 350000 / 350000,00 / 350000.00.
  const plain = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(compact);
  const match = indonesian ?? english ?? plain;
  if (!match) return null;
  const whole = match[1].replace(/[.,]/g, "");
  if (whole.length > 13) return null;
  // Whole rupiah: cents round to the nearest rupiah.
  return Math.round(Number(`${whole}.${match[2] ?? "0"}`));
}

/** "Under warranty until 3 Mar 2027", or that it ended; null without a date. */
export function warrantyLabel(until: string | null | undefined, locale: OwnerLocale, today: string = todayKey()): string | null {
  if (!until) return null;
  const date = new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${until}T00:00:00`));
  if (until >= today) return locale === "id" ? `Garansi sampai ${date}` : `Under warranty until ${date}`;
  return locale === "id" ? `Garansi berakhir ${date}` : `Warranty ended ${date}`;
}

/** Repair people named before, most used first, for the name field's suggestions. */
export function repairPeople(repairs: Repair[]): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const repair of repairs) {
    const name = repair.fixed_by_name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const entry = counts.get(key) ?? { name, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .map((entry) => entry.name);
}
