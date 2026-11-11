import type { AgendaItem } from "@/lib/scheduleEngine";
import type { UnifiedAgendaEntry } from "@/lib/unified-agenda";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { TaskLog } from "@/types/database";

/**
 * Where a vet visit stands (moved out of AgendaGroupCard in Phase 131, so the
 * card and the staff list's Selesai section read it the same way).
 *
 * A visit is two logs against the same schedule: the check-in, then either a
 * check-out or an admission. buildAgenda hands back one log per item, so the
 * pair is read straight from the day's logs.
 */
export function vetVisitState(items: AgendaItem[], logs: TaskLog[]) {
  const scheduleIds = new Set(items.map((i) => i.scheduleId).filter(Boolean));
  const day = items[0]?.log?.completed_at;
  const today = day ? formatDateLocal(new Date(day)) : formatDateLocal(new Date());
  const mine = logs.filter(
    (l) =>
      l.schedule_id &&
      scheduleIds.has(l.schedule_id) &&
      formatDateLocal(new Date(l.completed_at)) === today
  );
  return {
    checkedIn: mine.some((l) => l.sub_type === "check_in"),
    closed: mine.some((l) => l.sub_type === "check_out" || l.sub_type === "admitted"),
    admitted: mine.some((l) => l.sub_type === "admitted"),
  };
}

/** The three steps of a three-photo routine (Phase 173, D14), in order. */
export type ThreePhotoStep = "start" | "arrived" | "end";

const STEP_SUB_TYPE: Record<ThreePhotoStep, "check_in" | "arrived" | "check_out"> = {
  start: "check_in",
  arrived: "arrived",
  end: "check_out",
};

export function stepSubType(step: ThreePhotoStep) {
  return STEP_SUB_TYPE[step];
}

export interface ThreePhotoState {
  /** The step the card's button takes next; null once the end photo is in. */
  next: ThreePhotoStep | null;
  /** Each step's first log for this card that day, if taken. */
  start: TaskLog | null;
  arrived: TaskLog | null;
  end: TaskLog | null;
  /** Every step log on the card that day (all pets): what a cancel removes. */
  logs: TaskLog[];
}

/**
 * Where a three-photo routine stands (Phase 173, D14), from that day's logs
 * alone, the saves still waiting in the offline queue included (they are in
 * `logs` already, see shownLogs in HouseholdContext). Close the app at the
 * park, open it later, and the card still says "Sudah sampai": nothing is
 * kept apart from the logs.
 *
 * Read per card, across its pets: each step is saved for every open pet in
 * one batch, so the card has one place in the walk. The steps go in order:
 * an "arrived" log only counts after a start, an end only after both.
 */
export function threePhotoState(items: AgendaItem[], logs: TaskLog[], date: string): ThreePhotoState {
  const keys = new Set(items.map((i) => `${i.scheduleId}|${i.entityId}`));
  const mine = logs
    .filter(
      (l) =>
        l.schedule_id &&
        keys.has(`${l.schedule_id}|${l.entity_id}`) &&
        (l.sub_type === "check_in" || l.sub_type === "arrived" || l.sub_type === "check_out") &&
        formatDateLocal(new Date(l.completed_at)) === date
    )
    .sort((a, b) => a.completed_at.localeCompare(b.completed_at));
  const first = (sub: string) => mine.find((l) => l.sub_type === sub) ?? null;
  const start = first("check_in");
  const arrived = start ? first("arrived") : null;
  const end = arrived ? first("check_out") : null;
  return {
    next: !start ? "start" : !arrived ? "arrived" : !end ? "end" : null,
    start,
    arrived,
    end,
    logs: mine,
  };
}

/**
 * The walk a card shows (Phase 173): the card's walk, or, once that one is
 * finished, a walk of their own for the pets still open: a pet left out of
 * the first walk (someone said it couldn't be done, then it could) starts its
 * own sequence without touching the finished one (Codex, PR #85). A pet whose
 * walk is done is "completed" (buildAgenda finishes it at its end photo).
 */
export function cardWalkState(items: AgendaItem[], logs: TaskLog[], date: string): ThreePhotoState {
  const all = threePhotoState(items, logs, date);
  if (all.next !== null) return all;
  const open = items.filter((i) => i.status !== "completed");
  if (open.length > 0) return threePhotoState(open, logs, date);
  // Every pet walked, perhaps in two walks: the card shows the latest, so
  // its Batalkan jalan-jalan follows the walk that just ended (Codex, PR #85).
  // A walk's end photo is one batch, saved at one moment for its pets.
  const ends = all.logs.filter((l) => l.sub_type === "check_out");
  const last = ends.reduce<TaskLog | null>((a, l) => (!a || l.completed_at > a.completed_at ? l : a), null);
  if (!last) return all;
  const walked = new Set(ends.filter((l) => l.completed_at === last.completed_at).map((l) => l.entity_id));
  return threePhotoState(items.filter((i) => walked.has(i.entityId)), logs, date);
}

const STEP_RANK: Record<string, number> = { check_in: 0, arrived: 1, check_out: 2 };

/**
 * The logs a delete really removes (Phase 173): a three-photo routine's steps
 * go in order, so taking back a start or arrived photo takes back the same
 * pet's later steps that day too. Otherwise the end photo would keep the pet
 * done while its walk reads as unfinished (Codex, PR #85). Every photo view
 * deletes through this. Other logs pass through unchanged.
 */
export function withLaterSteps(rows: TaskLog[], logs: TaskLog[]): TaskLog[] {
  const out = new Map(rows.map((r) => [r.id, r]));
  for (const row of rows) {
    const rank = STEP_RANK[row.sub_type ?? ""];
    if (rank === undefined || rank === 2 || !row.schedule_id) continue;
    const day = formatDateLocal(new Date(row.completed_at));
    for (const l of logs) {
      if (
        l.schedule_id === row.schedule_id &&
        l.entity_id === row.entity_id &&
        (STEP_RANK[l.sub_type ?? ""] ?? -1) > rank &&
        formatDateLocal(new Date(l.completed_at)) === day
      ) {
        out.set(l.id, l);
      }
    }
  }
  return [...out.values()];
}

/** A save that reached the server more than this after the phone's time was sent offline (D14 rule 3). */
export const LATE_SAVE_MS = 5 * 60_000;

/**
 * The time to show for a step: the server's (received_at) when the save
 * arrived within 5 minutes; otherwise the phone's, flagged, with when it was
 * sent (an offline save). A save still in the queue has no server time yet.
 */
export function stepTime(log: Pick<TaskLog, "completed_at" | "received_at">): {
  at: string;
  sentAt: string | null;
  phoneTime: boolean;
} {
  const phone = log.completed_at;
  const server = log.received_at ?? null;
  if (!server) return { at: phone, sentAt: null, phoneTime: true };
  const late = new Date(server).getTime() - new Date(phone).getTime() > LATE_SAVE_MS;
  return late ? { at: phone, sentAt: server, phoneTime: true } : { at: server, sentAt: null, phoneTime: false };
}

/**
 * The walk's minutes, from the first and last photos (D14): server times when
 * both arrived on time, else phone times, marked as such. Never negative.
 */
export function walkMinutes(
  start: Pick<TaskLog, "completed_at" | "received_at">,
  end: Pick<TaskLog, "completed_at" | "received_at">
): { minutes: number; phoneTime: boolean } {
  const a = stepTime(start);
  const b = stepTime(end);
  const phoneTime = a.phoneTime || b.phoneTime;
  const from = phoneTime ? start.completed_at : a.at;
  const to = phoneTime ? end.completed_at : b.at;
  const minutes = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
  return { minutes, phoneTime };
}

/** How far a walk photo's file time may be from the phone's clock (D14 rule 2). */
export const FRESH_PHOTO_MS = 2 * 60_000;

/**
 * Whether a photo was just taken: its file time within 2 minutes of now. Stops
 * the easy case (an old photo from the gallery), not a determined one: the
 * file time comes from the phone. A file with no time (0) is refused.
 */
export function isFreshCapture(lastModified: number, now: number = Date.now()): boolean {
  return lastModified > 0 && Math.abs(now - lastModified) <= FRESH_PHOTO_MS;
}

/**
 * Whether a staff-list entry has nothing left for anyone to do — what moves
 * it into the collapsed Selesai section (Phase 131).
 *
 * Stricter than isEntryDone, which only asks whether every item is logged:
 *   - a vet visit is logged complete at check-in, but stays in the day until
 *     it is closed (the dog came home, or was admitted);
 *   - dogs at the clinic are left out of a routine's count, as the card does,
 *     so the three dogs at home finishing their meal settles it;
 *   - a routine whose dogs are *all* at the clinic is never settled: it stays
 *     in the day, dimmed, saying the round is paused rather than done.
 */
export function isEntrySettled(
  entry: UnifiedAgendaEntry,
  { logs, admittedIds }: { logs: TaskLog[]; admittedIds: Set<string> }
): boolean {
  if (entry.kind === "chore") return entry.occurrence.status === "completed";
  const { group } = entry;
  const isVet = group.category === "vet";
  const active = isVet ? group.items : group.items.filter((i) => !admittedIds.has(i.entityId));
  if (active.length === 0) return false;
  if (!active.every((i) => i.status === "completed")) return false;
  if (!isVet) return true;
  const visit = vetVisitState(group.items, logs);
  return !visit.checkedIn || visit.closed;
}
