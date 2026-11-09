import { CHORE_JOBS, choreJobsIn, type ChoreJob } from "@/lib/chore-jobs";
import { recurrenceOf } from "@/lib/chore-recurrence";
import type { OwnerLocale } from "@/lib/owner-locale";
import type { HouseholdLocation, HouseholdTask } from "@/types/database";

/**
 * The Rooms view's model (Phase 158, PR A): every room, grouped by floor,
 * with the chores set up in it and the jobs those chores do.
 *
 * No database change in this step. Floors are read from the room names the
 * household already uses ("LT2 Lounge" is the Lounge on LT2; a room named
 * just "LT2" stands for the whole floor). PR B stores floors for real, and
 * its one-time "Sort your rooms into floors" uses the same parser.
 */

export interface ParsedRoomName {
  /** The floor's number, for ordering; null when the name names no floor. */
  floor: number | null;
  /** The floor as the household wrote it ("LT2", "Lantai 2"); null as above. */
  floorLabel: string | null;
  /** The room on that floor; null when the name is the floor alone. */
  room: string | null;
}

// "LT2 Lounge", "Lt.2 - Lounge", "LT 2: Lounge", "Lantai 2 Lounge",
// "Floor 2 Lounge", "2F Lounge". The floor is a number from 0 to 99.
const FLOOR_PATTERNS: { re: RegExp; label: (n: string) => string }[] = [
  { re: /^(lt\.?\s*(\d{1,2}))(?![\p{L}\p{N}])/iu, label: (n) => `LT${n}` },
  { re: /^(lantai\s*(\d{1,2}))(?![\p{L}\p{N}])/iu, label: (n) => `Lantai ${n}` },
  { re: /^(floor\s*(\d{1,2}))(?![\p{L}\p{N}])/iu, label: (n) => `Floor ${n}` },
  { re: /^((\d{1,2})\s*f)(?![\p{L}\p{N}])/iu, label: (n) => `${n}F` },
];

/** Reads the floor out of a room's name, when the name starts with one. */
export function parseRoomName(name: string): ParsedRoomName {
  const trimmed = name.trim();
  for (const { re, label } of FLOOR_PATTERNS) {
    const match = trimmed.match(re);
    if (!match) continue;
    const number = match[2];
    const rest = trimmed
      .slice(match[1].length)
      .replace(/^[\s\-–—·:.,/]+/u, "")
      .trim();
    return { floor: Number(number), floorLabel: label(number), room: rest || null };
  }
  return { floor: null, floorLabel: null, room: trimmed || null };
}

/**
 * Is this chore set up — the plan for a room, rather than history?
 *
 * - a repeat (daily, weekly, monthly) whose repeat hasn't ended;
 * - a one-off that isn't done or cancelled yet, due today or later.
 *
 * Never a materialised day of a repeat (it has a parent): that is one day's
 * work, already counted through its template. Overdue one-offs stay in Today.
 */
export function isSetUp(task: HouseholdTask, today: string): boolean {
  if (task.parent_task_id) return false;
  if (task.status === "cancelled") return false;
  if (recurrenceOf(task) !== "none") {
    return !task.recurrence_until || task.recurrence_until >= today;
  }
  return task.status !== "completed" && task.due_date >= today;
}

export interface RoomChore {
  task: HouseholdTask;
  jobs: ChoreJob[];
}

export interface RoomEntry {
  /** The household_locations id. */
  id: string;
  /** The name shown in the floor's section: the room without its floor. */
  label: string;
  /** The room's full name as stored, for the sheet's title. */
  fullName: string;
  chores: RoomChore[];
}

export interface FloorSection {
  /** Stable key: the floor's id when stored, its number when read from names. */
  key: string;
  label: string;
  /** The room named just "LT2", if there is one: chores for the whole floor. */
  whole: RoomEntry | null;
  rooms: RoomEntry[];
}

export interface RoomsModel {
  floors: FloorSection[];
  /** Rooms with no floor (stored floors), or whose names name none. */
  otherRooms: RoomEntry[];
  /** True when the household has floors of its own (migrations/129). */
  storedFloors: boolean;
  /** Set-up chores with no room (or a room that was deleted). */
  noRoom: RoomChore[];
  /** The jobs that appear at least once, in CHORE_JOBS order. */
  jobs: ChoreJob[];
}

const byName = (a: { label: string }, b: { label: string }) =>
  a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" });

export function buildRoomsModel(
  locations: HouseholdLocation[],
  tasks: HouseholdTask[],
  today: string
): RoomsModel {
  const choresByRoom = new Map<string, RoomChore[]>();
  const known = new Set(locations.map((l) => l.id));
  const noRoom: RoomChore[] = [];
  const jobsSeen = new Set<ChoreJob>();

  for (const task of tasks) {
    if (!isSetUp(task, today)) continue;
    const chore: RoomChore = { task, jobs: choreJobsIn(`${task.title} ${task.notes ?? ""}`) };
    chore.jobs.forEach((job) => jobsSeen.add(job));
    if (task.location_id && known.has(task.location_id)) {
      const list = choresByRoom.get(task.location_id) ?? [];
      list.push(chore);
      choresByRoom.set(task.location_id, list);
    } else {
      noRoom.push(chore);
    }
  }

  const jobs = CHORE_JOBS.filter((job) => jobsSeen.has(job));

  // Stored floors (migrations/129): rooms sit under them; a floor's own
  // chores are its "Whole floor" row, shown only when it has some.
  if (locations.some((l) => l.kind === "floor")) {
    const order = (a: HouseholdLocation, b: HouseholdLocation) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    const floorRows = locations.filter((l) => l.kind === "floor").sort(order);
    const floorIds = new Set(floorRows.map((f) => f.id));
    const sections: FloorSection[] = floorRows.map((floor) => {
      const wholeChores = choresByRoom.get(floor.id) ?? [];
      return {
        key: floor.id,
        label: floor.name,
        whole: wholeChores.length
          ? { id: floor.id, label: floor.name, fullName: floor.name, chores: wholeChores }
          : null,
        rooms: locations
          .filter((r) => r.kind !== "floor" && r.parent_id === floor.id)
          .sort(order)
          .map((r) => ({
            id: r.id,
            label: r.name,
            fullName: `${floor.name} · ${r.name}`,
            chores: choresByRoom.get(r.id) ?? [],
          })),
      };
    });
    const loose = locations
      .filter((r) => r.kind !== "floor" && (!r.parent_id || !floorIds.has(r.parent_id)))
      .sort(order)
      .map((r) => ({ id: r.id, label: r.name, fullName: r.name, chores: choresByRoom.get(r.id) ?? [] }));
    return { floors: sections, otherRooms: loose, storedFloors: true, noRoom, jobs };
  }

  const floors = new Map<number, FloorSection>();
  const otherRooms: RoomEntry[] = [];

  for (const location of locations) {
    const parsed = parseRoomName(location.name);
    const entry: RoomEntry = {
      id: location.id,
      label: parsed.room ?? location.name,
      fullName: location.name,
      chores: choresByRoom.get(location.id) ?? [],
    };
    if (parsed.floor === null || parsed.floorLabel === null) {
      otherRooms.push(entry);
      continue;
    }
    const section = floors.get(parsed.floor) ?? {
      key: String(parsed.floor),
      label: parsed.floorLabel,
      whole: null,
      rooms: [],
    };
    // Two rooms named just "LT2" can't both be the whole floor: the second
    // is listed as a room, so nothing disappears.
    if (parsed.room === null && !section.whole) section.whole = entry;
    else section.rooms.push(entry);
    floors.set(parsed.floor, section);
  }

  for (const section of floors.values()) section.rooms.sort(byName);
  otherRooms.sort(byName);

  return {
    floors: [...floors.entries()].sort(([a], [b]) => a - b).map(([, section]) => section),
    otherRooms,
    storedFloors: false,
    noRoom,
    jobs,
  };
}

/** Does a room have this job set up? */
export function roomHasJob(entry: RoomEntry, job: ChoreJob): boolean {
  return entry.chores.some((chore) => chore.jobs.includes(job));
}

/**
 * The number on a job's chip: rooms that have the job, plus whole floors
 * that have it. A job set up only as a whole-floor chore (trash for all of
 * LT2) would otherwise read "Trash 0" next to a floor that clearly has it.
 */
export function placesWithJob(model: RoomsModel, job: ChoreJob): number {
  const wholeFloors = model.floors.filter((floor) => floor.whole && roomHasJob(floor.whole, job)).length;
  return allRoomRows(model).filter((room) => roomHasJob(room, job)).length + wholeFloors;
}

/** Every room row, whole-floor rows excluded: what "9 of 19 rooms" counts. */
export function allRoomRows(model: RoomsModel): RoomEntry[] {
  return [...model.floors.flatMap((f) => f.rooms), ...model.otherRooms];
}

function localDate(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

/**
 * When a set-up chore happens, in a few words: "Daily", "Mon", "Monthly, 14th",
 * or the date of a one-off ("Sat 14 Nov").
 */
export function scheduleLabel(task: HouseholdTask, locale: OwnerLocale): string {
  const tag = locale === "id" ? "id-ID" : "en-GB";
  const date = localDate(task.due_date);
  switch (recurrenceOf(task)) {
    case "daily":
      return locale === "id" ? "Setiap hari" : "Daily";
    case "weekly":
      return new Intl.DateTimeFormat(tag, { weekday: "short" }).format(date);
    case "monthly":
      return locale === "id" ? `Tiap bulan, tgl ${date.getDate()}` : `Monthly, ${ordinal(date.getDate())}`;
    default:
      return new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short" }).format(date);
  }
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

/**
 * The days a room's chores for one job fall on, joined: weekly days first in
 * week order (Mon, Thu), then the rest. "Mon, Thu" reads better than two
 * separate lines for one vacuum rota.
 */
export function scheduleSummary(tasks: HouseholdTask[], locale: OwnerLocale): string {
  const weekly = tasks
    .filter((t) => recurrenceOf(t) === "weekly")
    .sort((a, b) => ((localDate(a.due_date).getDay() + 6) % 7) - ((localDate(b.due_date).getDay() + 6) % 7));
  const rest = tasks.filter((t) => recurrenceOf(t) !== "weekly");
  const labels = [...weekly, ...rest].map((t) => scheduleLabel(t, locale));
  return [...new Set(labels)].join(", ");
}
