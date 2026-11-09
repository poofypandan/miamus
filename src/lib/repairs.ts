import { nextOccurrence, occursOn, recurrenceOf } from "@/lib/chore-recurrence";
import type { OwnerLocale } from "@/lib/owner-locale";
import type { HouseholdTask, Repair } from "@/types/database";

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
  let day: string | null =
    today < template.due_date ? template.due_date : occursOn(template, today) ? today : nextOccurrence(template, today);
  // A handful of steps is plenty: each settled day is one already written.
  for (let i = 0; day && i < 400; i++) {
    if (!settled.has(day)) return day;
    day = nextOccurrence(template, day);
  }
  return null;
}

export function repairStage(repair: Repair, visits: HouseholdTask[], today: string = todayKey()): RepairStage {
  if (repair.status === "reported") return { kind: "reported" };
  if (repair.status === "fixed") return { kind: "fixed" };
  if (repair.status === "dismissed") return { kind: "dismissed" };
  const mine = visitsOf(repair.id, visits);
  const repeats = mine.filter((v) => !v.parent_task_id && recurrenceOf(v) !== "none");
  const upcoming: HouseholdTask[] = [
    // One-off visits, and days of a repeat written as their own rows.
    ...mine.filter((v) => v.status === "pending" && recurrenceOf(v) === "none"),
    // A repeat still running: its next day, as that day would read.
    ...repeats.flatMap((t) => {
      const day = nextRepeatDay(t, mine, today);
      return day ? [{ ...t, due_date: day, status: "pending" as const }] : [];
    }),
  ].sort(
    (a, b) =>
      a.due_date.localeCompare(b.due_date) || (a.due_time ?? "99:99").localeCompare(b.due_time ?? "99:99")
  );
  if (upcoming.length > 0) return { kind: "scheduled", next: upcoming[0] };
  const done = mine.filter((v) => v.status === "completed");
  if (done.length > 0) return { kind: "check", last: done[done.length - 1] };
  return { kind: "unscheduled" };
}

export interface RepairsBoard {
  /** Staff reports waiting for an owner, urgent first, oldest first. */
  toReview: Repair[];
  /** Open repairs, urgent first, then those needing a check, then by age. */
  open: Repair[];
  /** Fixed in the last 30 days, newest first. */
  fixed: Repair[];
}

export function repairsBoard(repairs: Repair[], visits: HouseholdTask[], now: Date = new Date()): RepairsBoard {
  const since = now.getTime() - FIXED_LIST_DAYS * 24 * 60 * 60 * 1000;
  const urgentFirst = (a: Repair, b: Repair) => Number(b.urgent) - Number(a.urgent);
  const oldestFirst = (a: Repair, b: Repair) => a.created_at.localeCompare(b.created_at);
  const stageRank = (r: Repair) => (repairStage(r, visits).kind === "check" ? 0 : 1);
  return {
    toReview: repairs.filter((r) => r.status === "reported").sort((a, b) => urgentFirst(a, b) || oldestFirst(a, b)),
    open: repairs
      .filter((r) => r.status === "open")
      .sort((a, b) => urgentFirst(a, b) || stageRank(a) - stageRank(b) || oldestFirst(a, b)),
    fixed: repairs
      .filter((r) => r.status === "fixed" && r.closed_at && new Date(r.closed_at).getTime() >= since)
      .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? "")),
  };
}

/** What the owners' Today screen says, when there is anything (both counts may be 0). */
export function repairsToday(repairs: Repair[], visits: HouseholdTask[]): { toReview: number; toCheck: number } {
  return {
    toReview: repairs.filter((r) => r.status === "reported").length,
    toCheck: repairs.filter((r) => r.status === "open" && repairStage(r, visits).kind === "check").length,
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
export function staffRepairStatus(repair: Repair, visits: HouseholdTask[]): string {
  const stage = repairStage(repair, visits);
  switch (stage.kind) {
    case "reported":
      return "Menunggu dicek";
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
