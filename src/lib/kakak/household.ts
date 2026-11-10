// The household block sent to Claude after the shared, cached instructions
// (docs/phase-156-step2-kakak-plan.md, section 4, "What is sent to Claude").
// Only short references and first names; never database ids, emails, notes,
// logs or anything else from the household.
//
// Relative days ("besok", "Sabtu ini", "akhir bulan") are the commonest
// mistake for a language model, so the block lists the next 14 dates with
// their weekdays, worked out here in code, instead of leaving the arithmetic
// to the model.

export type KakakLocale = "id" | "en";

export interface KakakHousehold {
  /** Today in Asia/Jakarta, YYYY-MM-DD. */
  today: string;
  /** Now in Asia/Jakarta, HH:mm. */
  now: string;
  ownerLocale: KakakLocale;
  /** The owner's own roster row, always M1. */
  owner: { ref: "M1"; name: string };
  people: { ref: string; name: string }[];
  pets: {
    ref: string;
    name: string;
    kind: "dog" | "cat" | "other";
    meals: string[];
    potty: string[];
  }[];
  /**
   * Places (migrations/129): `name` is the place's own name; a room on a
   * floor carries the floor's name, and a floor itself is `wholeFloor`, for
   * a chore on the whole floor.
   */
  rooms: { ref: string; name: string; floor?: string | null; wholeFloor?: boolean }[];
  items: { ref: string; name: string; pet: boolean }[];
  /**
   * "Who lives here?" (Phase 162, migrations/133): true only when the owner
   * said the household has no pets. Absent otherwise, so the block for every
   * household with pets is exactly what it was.
   */
  petsOff?: boolean;
}

const WEEKDAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_ID = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Parses YYYY-MM-DD as a calendar date (UTC midnight), no time zone drift. */
function parseDay(day: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) throw new Error(`Not a YYYY-MM-DD date: ${day}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== day) throw new Error(`Not a real date: ${day}`);
  return date;
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
  const date = parseDay(day);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDay(date);
}

export function weekdayIndex(day: string): number {
  return parseDay(day).getUTCDay();
}

export function lastDayOfMonth(day: string): string {
  const date = parseDay(day);
  return formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

export function firstDayOfNextMonth(day: string): string {
  const date = parseDay(day);
  return formatDay(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)));
}

function longDate(day: string): string {
  const date = parseDay(day);
  return `${WEEKDAYS_EN[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS_EN[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function dayLine(day: string): string {
  const index = weekdayIndex(day);
  return `${day} ${WEEKDAYS_EN[index]} (${WEEKDAYS_ID[index]})`;
}

function times(list: string[]): string {
  return list.length ? list.join(", ") : "none";
}

/** Every reference the household block defines, for checking a reply. */
export function householdRefs(household: KakakHousehold): {
  people: Set<string>;
  pets: Set<string>;
  rooms: Set<string>;
  /** The references that are a floor (whole floor), which a new room may sit on. */
  floors: Set<string>;
  items: Set<string>;
} {
  return {
    people: new Set([household.owner.ref, ...household.people.map((p) => p.ref)]),
    pets: new Set(household.pets.map((p) => p.ref)),
    rooms: new Set(household.rooms.map((r) => r.ref)),
    floors: new Set(household.rooms.filter((r) => r.wholeFloor).map((r) => r.ref)),
    items: new Set(household.items.map((i) => i.ref)),
  };
}

export function renderHouseholdBlock(household: KakakHousehold): string {
  const lines: string[] = [];
  lines.push("<household>");
  lines.push(
    `Owner's chosen language: ${household.ownerLocale === "id" ? "Bahasa Indonesia (id)" : "English (en)"}.`,
  );
  lines.push("");
  lines.push("People who can be given chores:");
  lines.push(`- ${household.owner.ref}: the owner (${household.owner.name})`);
  for (const person of household.people) lines.push(`- ${person.ref}: ${person.name}`);
  lines.push("");
  if (household.petsOff) {
    lines.push("Pets: switched off for this household (Household → Who lives here). No pet routines.");
  } else {
    lines.push("Pets (current daily times):");
    for (const pet of household.pets) {
      lines.push(
        `- ${pet.ref}: ${pet.name} (${pet.kind}). Meals: ${times(pet.meals)}. Potty: ${times(pet.potty)}.`,
      );
    }
    if (household.pets.length === 0) lines.push("- none");
  }
  lines.push("");
  lines.push("Rooms:");
  for (const room of household.rooms) lines.push(`- ${room.ref}: ${roomLine(room)}`);
  if (household.rooms.length === 0) lines.push("- none");
  lines.push("");
  lines.push("Shopping items already in the app:");
  for (const item of household.items) {
    lines.push(`- ${item.ref}: ${item.name}${item.pet ? " (pet)" : ""}`);
  }
  if (household.items.length === 0) lines.push("- none");
  lines.push("");
  // Today and the calendar go last so the shared instructions before this
  // block, and the rest of this block within a conversation, stay cached.
  lines.push(`Today: ${longDate(household.today)}, ${household.now.replace(":", ".")} (Asia/Jakarta). ISO: ${household.today}.`);
  lines.push("Next 14 days:");
  for (let offset = 1; offset <= 14; offset += 1) lines.push(`- ${dayLine(addDays(household.today, offset))}`);
  lines.push(`Last day of this month: ${dayLine(lastDayOfMonth(household.today))}.`);
  lines.push(`First day of next month: ${dayLine(firstDayOfNextMonth(household.today))}.`);
  lines.push("</household>");
  return lines.join("\n");
}

/** "LT2 (whole floor)", "LT2 · Lounge", or a room with no floor by its name. */
function roomLine(room: KakakHousehold["rooms"][number]): string {
  if (room.wholeFloor) return `${room.name} (whole floor)`;
  return room.floor ? `${room.floor} · ${room.name}` : room.name;
}
