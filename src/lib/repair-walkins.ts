import type { OwnerLocale } from "@/lib/owner-locale";
import { formatTime } from "@/lib/time";
import type { Repair, RepairSupervision, RepairWalkIn, WalkInOutcome } from "@/types/database";

/**
 * Walk-in repairs and supervising (Phase 174 PR A,
 * docs/phase-174-repairs-walkin-plan.md, migrations/149). Pure rules, tested
 * without a browser: which walk-ins are open, the name chips, the times to
 * show, who is supervising now, and which missed task a supervising stretch
 * explains (D10 A: read at display time, never written for the staff).
 *
 * A walk-in is a repair person who turned up: logged at the gate with a
 * before photo, closed with Selesai and an after photo. Its times are the
 * server's; a save sent later shows the phone's, marked as such.
 */

export const WALKIN_LIMITS = { workerName: 60, note: 300 } as const;

/** The fixed name chip, beside the recent names (D3). */
export const DEVELOPER_CHIP = "Tim developer";

/** Recent names: the last 90 days, at most 6, most used first (D3). */
export const NAME_CHIP_DAYS = 90;
export const NAME_CHIP_MAX = 6;

/** "Sudah diperbaiki" on the staff pill: the last 7 days. */
export const FIXED_RECENT_DAYS = 7;

/** A staff phone may take back its walk-in, or its Selesai, for this long (migrations/149). */
export const WALKIN_UNDO_MS = 5 * 60 * 1000;

/** A task due this long before a stretch started is still explained by it (D10). */
export const SUPERVISION_LEAD_MS = 15 * 60 * 1000;

/** A save that reached the server more than this after the phone's time was sent later. */
export const LATE_SAVE_MS = 5 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** "2026-11-11", in the phone's time zone. */
export function dayKeyOf(at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Not closed yet: no Selesai has reached the server (or is waiting on this phone). */
export function isOpenWalkIn(visit: Pick<RepairWalkIn, "left_at" | "after_photo_url">): boolean {
  return !visit.left_at && !visit.after_photo_url;
}

/** Still open from an earlier day: "Belum ditutup sejak kemarin" (D6). It never closes itself. */
export function isForgotten(visit: RepairWalkIn, today: string): boolean {
  return isOpenWalkIn(visit) && dayKeyOf(visit.arrived_at) < today;
}

/** Open walk-ins, the forgotten ones first, then oldest first. */
export function openWalkIns(walkIns: readonly RepairWalkIn[]): RepairWalkIn[] {
  return walkIns.filter(isOpenWalkIn).sort((a, b) => a.arrived_at.localeCompare(b.arrived_at));
}

/** One repair's walk-ins, in arrival order. */
export function walkInsOf(repairId: string, walkIns: readonly RepairWalkIn[]): RepairWalkIn[] {
  return walkIns.filter((v) => v.repair_id === repairId).sort((a, b) => a.arrived_at.localeCompare(b.arrived_at));
}

/** Closed in the last 7 days, newest first: "Sudah diperbaiki" on the staff pill. */
export function recentlyFinished(walkIns: readonly RepairWalkIn[], now: Date = new Date()): RepairWalkIn[] {
  const since = now.getTime() - FIXED_RECENT_DAYS * DAY_MS;
  return walkIns
    .filter((v) => !!v.left_at && new Date(v.left_at).getTime() >= since)
    .sort((a, b) => (b.left_at ?? "").localeCompare(a.left_at ?? ""));
}

/**
 * The name chips (D3): the household's names from the last 90 days, most
 * used first, then the most recent, at most 6. "Tim developer" is its own
 * fixed chip, so it isn't repeated here. Names go when their visits go.
 */
export function recentWorkerNames(walkIns: readonly RepairWalkIn[], now: Date = new Date()): string[] {
  const since = now.getTime() - NAME_CHIP_DAYS * DAY_MS;
  const byKey = new Map<string, { name: string; count: number; last: string }>();
  for (const visit of walkIns) {
    const name = visit.worker_name?.trim();
    if (!name || new Date(visit.arrived_at).getTime() < since) continue;
    const key = name.toLowerCase();
    if (key === DEVELOPER_CHIP.toLowerCase()) continue;
    const entry = byKey.get(key);
    if (!entry) byKey.set(key, { name, count: 1, last: visit.arrived_at });
    else {
      entry.count += 1;
      if (visit.arrived_at > entry.last) {
        entry.last = visit.arrived_at;
        entry.name = name;
      }
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, NAME_CHIP_MAX)
    .map((e) => e.name);
}

/** The name on a repair's latest walk-in: chosen already when that repair is picked again. */
export function lastWorkerName(repairId: string, walkIns: readonly RepairWalkIn[]): string | null {
  const mine = walkInsOf(repairId, walkIns).filter((v) => !!v.worker_name?.trim());
  return mine.length ? mine[mine.length - 1].worker_name!.trim() : null;
}

/**
 * The time to show for an arrival or a leaving: the server's when the save
 * arrived within 5 minutes of the phone's time; otherwise the phone's,
 * flagged (sent later, as Phase 173's walks). A save still waiting on the
 * phone has only the phone's time.
 */
export function walkInTime(
  visit: Pick<RepairWalkIn, "arrived_at" | "arrived_phone_at" | "left_at" | "left_phone_at">,
  which: "in" | "out"
): { at: string; phoneTime: boolean } | null {
  const server = which === "in" ? visit.arrived_at : visit.left_at;
  const phone = which === "in" ? visit.arrived_phone_at : visit.left_phone_at;
  if (!server) return phone ? { at: phone, phoneTime: true } : null;
  if (phone && new Date(server).getTime() - new Date(phone).getTime() > LATE_SAVE_MS) {
    return { at: phone, phoneTime: true };
  }
  return { at: server, phoneTime: false };
}

/** "09.10–11.40" / "9:10 AM–11:40 AM", or "sejak 09.10" while open. */
export function walkInSpanLabel(visit: RepairWalkIn, locale: OwnerLocale): string {
  const arrived = walkInTime(visit, "in");
  const left = walkInTime(visit, "out");
  const from = arrived ? formatTime(new Date(arrived.at), locale) : "";
  if (!left) return locale === "id" ? `sejak ${from}` : `since ${from}`;
  return `${from}–${formatTime(new Date(left.at), locale)}`;
}

/** The staff's chips, Bahasa Indonesia only. */
export function staffOutcomeLabel(outcome: WalkInOutcome): string {
  switch (outcome) {
    case "fixed":
      return "Sudah beres";
    case "come_back":
      return "Belum selesai, datang lagi";
    case "check":
      return "Perlu dicek pemilik rumah";
  }
}

/** The chips as owners read them. */
export function ownerOutcomeLabel(outcome: WalkInOutcome, locale: OwnerLocale): string {
  const id = locale === "id";
  switch (outcome) {
    case "fixed":
      return id ? "Sudah beres" : "Done";
    case "come_back":
      return id ? "Akan datang lagi" : "Coming back";
    case "check":
      return id ? "Mohon dicek" : "Please check";
  }
}

/** "1 jam 20 menit" / "45 menit" / "kurang dari 1 menit": the staff strip's running time. */
export function staffDurationWords(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "kurang dari 1 menit";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} menit`;
  return m === 0 ? `${h} jam` : `${h} jam ${m} menit`;
}

// --- Supervising (D10, D11) -----------------------------------------------------

/** One stretch of supervising, with what it was about. */
export interface SupervisionStretch {
  id: string;
  visitId: string;
  repairId: string;
  repairTitle: string;
  /** The roster row (admins have one too). Null for an owner with no row. */
  staffId: string | null;
  start: string;
  /** Null while it is still going on. */
  end: string | null;
}

/** Each stretch joined to its visit and repair; stretches of a visit no longer here are left out. */
export function supervisionStretches(
  spans: readonly RepairSupervision[],
  walkIns: readonly RepairWalkIn[],
  repairs: readonly Pick<Repair, "id" | "title">[]
): SupervisionStretch[] {
  const visits = new Map(walkIns.map((v) => [v.id, v]));
  const titles = new Map(repairs.map((r) => [r.id, r.title]));
  return spans.flatMap((s): SupervisionStretch[] => {
    const visit = visits.get(s.visit_id);
    if (!visit) return [];
    return [
      {
        id: s.id,
        visitId: s.visit_id,
        repairId: visit.repair_id,
        repairTitle: titles.get(visit.repair_id) ?? "",
        staffId: s.staff_id,
        start: s.started_at,
        end: s.ended_at,
      },
    ];
  });
}

/**
 * Who is supervising right now, by roster id: at most one open stretch per
 * person (the database refuses a second, supervision_busy). A stretch whose
 * visit is already closed on this phone (a Selesai still waiting to send)
 * doesn't count.
 */
export function supervisingNow(
  stretches: readonly SupervisionStretch[],
  walkIns: readonly RepairWalkIn[]
): Map<string, SupervisionStretch> {
  const open = new Set(walkIns.filter(isOpenWalkIn).map((v) => v.id));
  const out = new Map<string, SupervisionStretch>();
  for (const s of stretches) {
    if (s.end || !s.staffId || !open.has(s.visitId)) continue;
    const prev = out.get(s.staffId);
    if (!prev || s.start > prev.start) out.set(s.staffId, s);
  }
  return out;
}

/** Start and end of a local day, as times. */
function dayBounds(day: string): { from: number; to: number } {
  const from = new Date(`${day}T00:00:00`).getTime();
  return { from, to: from + DAY_MS };
}

/** A day's stretches per person, clipped to the day, by start time. Open ones end now (or at midnight). */
export function supervisionSpansOn(
  stretches: readonly SupervisionStretch[],
  day: string,
  now: Date = new Date()
): Map<string, (SupervisionStretch & { from: number; to: number; open: boolean })[]> {
  const { from, to } = dayBounds(day);
  const out = new Map<string, (SupervisionStretch & { from: number; to: number; open: boolean })[]>();
  for (const s of stretches) {
    if (!s.staffId) continue;
    const start = new Date(s.start).getTime();
    const end = s.end ? new Date(s.end).getTime() : now.getTime();
    if (end <= from || start >= to) continue;
    const entry = { ...s, from: Math.max(start, from), to: Math.min(end, to), open: !s.end };
    const list = out.get(s.staffId);
    if (list) list.push(entry);
    else out.set(s.staffId, [entry]);
  }
  for (const list of out.values()) list.sort((a, b) => a.from - b.from);
  return out;
}

/** What auto-explain needs to know about a task. */
export interface ExplainableTask {
  /** The person it is for, or null for anyone (and every pet routine). */
  staffId: string | null;
  /** YYYY-MM-DD. */
  date: string;
  /** "HH:MM", or null for an anytime task (never explained). */
  time: string | null;
  /** Only an open task is explained: done wins, and a couldn't-do says it itself. */
  state?: "open" | "done" | "couldnt";
}

/** The stretch inside which a task's time falls, for one person. */
function stretchAt(
  stretches: readonly SupervisionStretch[],
  staffId: string,
  dueAt: number,
  now: number
): SupervisionStretch | null {
  for (const s of stretches) {
    if (s.staffId !== staffId) continue;
    const start = new Date(s.start).getTime() - SUPERVISION_LEAD_MS;
    const end = s.end ? new Date(s.end).getTime() : now;
    if (dueAt >= start && dueAt <= end) return s;
  }
  return null;
}

/**
 * The stretch that explains a missed task, or null (D10 A).
 *
 * - Only an open task with a time, due by now, whose time falls inside a
 *   stretch: from 15 minutes before it started until it ended (or now).
 * - A task for one person: that person's stretch.
 * - A task for anyone, and a pet routine, only when every staff member on
 *   duty that day (not on leave) was supervising at that time; otherwise
 *   someone else could have done it. Nobody on duty: not explained.
 *
 * It explains; it never makes the task done.
 */
export function supervisionExplains(
  task: ExplainableTask,
  stretches: readonly SupervisionStretch[],
  staffOnDuty: readonly string[],
  now: Date = new Date()
): SupervisionStretch | null {
  if (task.state && task.state !== "open") return null;
  if (!task.time || stretches.length === 0) return null;
  const dueAt = new Date(`${task.date}T${task.time.slice(0, 5)}:00`).getTime();
  const nowMs = now.getTime();
  if (!Number.isFinite(dueAt) || dueAt > nowMs) return null;
  if (task.staffId) return stretchAt(stretches, task.staffId, dueAt, nowMs);
  if (staffOnDuty.length === 0) return null;
  let first: SupervisionStretch | null = null;
  for (const person of staffOnDuty) {
    const s = stretchAt(stretches, person, dueAt, nowMs);
    if (!s) return null;
    first ??= s;
  }
  return first;
}

/** The staff label on a task explained by supervising. */
export const STAFF_SUPERVISING_LABEL = "Mengawasi perbaikan";

/** The owner's busy label on a progress row: "<label> since 10:00 AM" is added by the row. */
export function ownerSupervisingBusyLabel(locale: OwnerLocale): string {
  return locale === "id" ? "Mengawasi perbaikan" : "Supervising a repair";
}

/**
 * An owner row's line for a task explained by supervising: "Ari was
 * supervising a repair, 10:00 AM–1:30 PM" / "Ari mengawasi perbaikan
 * 10.00–13.30"; "since" while it is still going on.
 */
export function ownerSupervisingLine(
  stretch: Pick<SupervisionStretch, "start" | "end">,
  who: string | null,
  locale: OwnerLocale
): string {
  const from = formatTime(new Date(stretch.start), locale);
  const id = locale === "id";
  const name = who ?? (id ? "Staf" : "Staff");
  if (!stretch.end) {
    return id ? `${name} mengawasi perbaikan sejak ${from}` : `${name} has been supervising a repair since ${from}`;
  }
  const to = formatTime(new Date(stretch.end), locale);
  return id ? `${name} mengawasi perbaikan ${from}–${to}` : `${name} was supervising a repair, ${from}–${to}`;
}

/**
 * "Supervised by Ari 9:10–10:30 AM, then Syam 10:30–11:40 AM" for a repair's
 * timeline; null when nobody is on record (stretches go after 90 days).
 */
export function supervisedByLine(
  stretches: readonly SupervisionStretch[],
  visitId: string,
  nameOf: (staffId: string | null) => string,
  locale: OwnerLocale
): string | null {
  const mine = stretches.filter((s) => s.visitId === visitId).sort((a, b) => a.start.localeCompare(b.start));
  if (mine.length === 0) return null;
  const id = locale === "id";
  const parts = mine.map((s) => {
    const from = formatTime(new Date(s.start), locale);
    const span = s.end ? `${from}–${formatTime(new Date(s.end), locale)}` : id ? `sejak ${from}` : `since ${from}`;
    return `${nameOf(s.staffId)} ${span}`;
  });
  const joined = parts.join(id ? ", lalu " : ", then ");
  return id ? `Diawasi ${joined}` : `Supervised by ${joined}`;
}

/** The owners' Today quiet line: "Pak Budi is here · Leaking tap, LT2" / "Pak Budi sedang bekerja · …". */
export function walkInTodayLine(
  visit: Pick<RepairWalkIn, "worker_name">,
  repairTitle: string,
  place: string | null,
  locale: OwnerLocale
): string {
  const id = locale === "id";
  const who = visit.worker_name?.trim();
  const head = who
    ? id
      ? `${who} sedang bekerja`
      : `${who} is here`
    : id
      ? "Tukang sedang bekerja"
      : "A repair person is here";
  return `${head} · ${[repairTitle, place].filter(Boolean).join(", ")}`;
}
