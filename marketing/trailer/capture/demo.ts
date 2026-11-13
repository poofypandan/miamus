/**
 * The trailer's demo household (storyboard: "Demo data to seed first").
 * Made up, every name and row: Sari, Yanti, Budi and Joko; the dogs Coco and
 * Bruno; no real home, no real person, no prices anywhere.
 *
 * Everything is pinned to one moment, Monday 16 Nov 2026 at 16.30 WIB, so
 * every run captures the same screens.
 */
import type { BrowserContext, Page } from "@playwright/test";
import { HOUSEHOLD_ID, MOCHI, BENTO, SCHEDULES, logFor, schedule } from "../../../tests/fixtures/household";
import { OWNER, STAFF_ID, installStub, session, type Stub } from "../../../tests/e2e/stub-backend";

export const DAY = "2026-11-16"; // a Monday
export const NOW = new Date(`${DAY}T16:30:00+07:00`);
export const NEXT_MONDAY = "2026-11-23";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const SARI = STAFF_ID; // the staff phone's person
export const YANTI = id(0xc002);
export const BUDI = id(0xc003);
export const JOKO = id(0xc004);

const person = (pid: string, name: string, created: string) => ({
  id: pid,
  household_id: HOUSEHOLD_ID,
  name,
  has_pin: true,
  user_id: null,
  archived_at: null,
  hidden_areas: [],
  created_at: created,
});
export const STAFF = [
  person(SARI, "Sari", "2026-10-01T00:00:00Z"),
  person(YANTI, "Yanti", "2026-10-01T00:01:00Z"),
  person(BUDI, "Budi", "2026-10-01T00:02:00Z"),
  person(JOKO, "Joko", "2026-10-01T00:03:00Z"),
];

export const PETS: [string, string] = ["Coco", "Bruno"];
export const COCO = MOCHI.id;
export const BRUNO = BENTO.id;

const room = (n: number, name: string) => ({ id: id(0x100 + n), household_id: HOUSEHOLD_ID, name, created_at: `2026-10-01T00:0${n % 10}:00Z` });
export const TERRACE = room(1, "Teras");
export const ROOMS = [
  TERRACE,
  room(2, "Ruang tamu"),
  room(3, "Dapur"),
  room(4, "Kamar utama"),
  room(5, "Kamar anak"),
  room(6, "Kamar mandi"),
  room(7, "Taman"),
  room(8, "Garasi"),
];
const R = (name: string) => ROOMS.find((r) => r.name === name)!.id;

/** A photo path in the household's bucket; served by our /api/photo route (photos.ts). */
const photo = (name: string) => `http://supabase.test/storage/v1/object/public/household-logs/${HOUSEHOLD_ID}/demo/${name}.jpg`;

let n = 0;
let cutoff = "16:30";
function chore(title: string, who: string, time: string, room: string | null, _planned: boolean, extra: Record<string, unknown> = {}) {
  n += 1;
  const done = time < cutoff;
  return {
    id: id(0x2000 + n),
    household_id: HOUSEHOLD_ID,
    title,
    notes: null,
    category: "cleaning",
    assigned_to: who,
    due_date: DAY,
    due_time: time,
    status: done ? "completed" : "pending",
    completed_by: done ? who : null,
    completed_at: done ? `${DAY}T${addMinutes(time, 12)}:00+07:00` : null,
    photo_url: done ? photo(`room-${(n % 4) + 1}`) : null,
    created_at: "2026-11-01T00:00:00Z",
    recurrence: "none",
    recurrence_until: null,
    parent_task_id: null,
    requires_supervision: false,
    before_photo_url: null,
    after_photo_url: null,
    location_id: room ? R(room) : null,
    ...extra,
  };
}

function addMinutes(hhmm: string, minutes: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/** Today's chores: all done up to 16.30, two still to come, none late. */
export function chores(opts: { terraceToDo?: boolean; at?: string } = {}) {
  n = 0;
  cutoff = opts.at ?? "16:30";
  return [
    chore("Sapu dan pel ruang tamu", SARI, "07:00", "Ruang tamu", true),
    chore("Rapikan kamar utama", SARI, "08:00", "Kamar utama", true),
    chore("Ganti seprai", SARI, "08:30", "Kamar utama", true),
    chore("Bersihkan kamar mandi", SARI, "09:30", "Kamar mandi", true),
    chore("Rapikan kamar anak", SARI, "10:30", "Kamar anak", true),
    chore("Cuci baju", SARI, "11:00", null, true),
    chore("Setrika baju", SARI, "14:00", null, true),
    chore("Lap kaca jendela", SARI, "15:00", "Ruang tamu", true),
    chore("Siapkan sarapan", YANTI, "06:30", "Dapur", true, { category: "groceries" }),
    chore("Cuci piring pagi", YANTI, "08:00", "Dapur", true),
    chore("Masak makan siang", YANTI, "11:00", "Dapur", true, { category: "groceries" }),
    chore("Bersihkan kompor", YANTI, "13:30", "Dapur", true),
    chore("Cek isi kulkas", YANTI, "15:30", "Dapur", true),
    chore("Masak makan malam", YANTI, "17:30", "Dapur", false, { category: "groceries" }),
    chore("Siram tanaman", BUDI, "07:00", "Taman", true),
    chore("Sapu halaman", BUDI, "08:00", "Taman", true),
    chore("Potong rumput", BUDI, "10:00", "Taman", true),
    chore("Buang sampah", BUDI, "16:00", null, true),
    chore("Cuci mobil", JOKO, "07:30", "Garasi", true),
    chore("Antar anak sekolah", JOKO, "06:30", null, true, { category: "errand" }),
    chore("Jemput anak sekolah", JOKO, "13:00", null, true, { category: "errand" }),
    chore("Isi bensin", JOKO, "15:00", null, true, { category: "errand" }),
    chore("Tutup gerbang dan garasi", JOKO, "19:00", "Garasi", false),
    ...(opts.terraceToDo ? [chore("Pel teras", SARI, "09:00", "Teras", false)] : []),
  ];
}

/** The dogs' routines: breakfast added to the fixture's lunch, dinner and potty; the fixture's test medicine left out. */
export const BREAKFASTS = [MOCHI, BENTO].map((p) => schedule(p, "Sarapan", ["07:30"]));
export const LIGHTS = [MOCHI, BENTO].map((p) =>
  schedule(p, "Matikan lampu", ["21:30"], {
    kind: "lights",
    routine_group_id: id(0x17d2),
    staff_id: null,
    proof: "photo",
    remind_staff: true,
    alert_owners: true,
  } as never)
);

/**
 * The evening walk, 17.00, both dogs, with "tell me if it isn't done" on: the
 * routine the owner hears about in shot 8 (meals can't carry that switch in
 * the app; walks and lights can).
 */
export const WALKS = [MOCHI, BENTO].map((p) =>
  schedule(p, "Jalan-jalan", ["17:00"], {
    kind: "walk",
    routine_group_id: id(0x17d3),
    staff_id: null,
    proof: "photo",
    remind_staff: true,
    alert_owners: true,
  } as never)
);

/** Logs for every pet slot before `nowHm` today, except the routines left `open`. */
export function petLogs(schedules: Record<string, unknown>[], nowHm = "16:30", open: string[] = []) {
  return schedules.flatMap((s) =>
    open.includes(String(s.kind))
      ? []
      : ((s.fixed_times as string[]) ?? [])
          .filter((t) => t < nowHm)
          .map((t) => ({
            ...logFor(s as never, DAY, addMinutes(t, 6)),
            id: `log-${s.id}-${t}`,
            scheduled_time: t,
            staff_id: t < "12:00" ? SARI : YANTI,
            // The photo staff take each time: the empty bowl after a meal,
            // the lawn after a potty break; one per slot, so each is its own tile.
            photo_url: /Sarapan|Makan/.test(String(s.title))
              ? photo(`bowl-${t}`)
              : /Pipis/.test(String(s.title))
                ? photo(`lawn-${t}`)
                : null,
          }))
  );
}

/** Food at home for the Kitchen glimpse (made up; no prices). */
export function foods(locale: "id" | "en") {
  const row = (n: number, name: string, kept_in: string, expires_on: string | null, source: string | null, from_whom: string | null) => ({
    id: id(0xf00 + n), household_id: HOUSEHOLD_ID, name, kept_in, expires_on, expiry_unknown: false, source, from_whom,
    return_container: false, container_returned_at: null, notes: null, photo_url: null, added_by: null, created_by: null,
    outcome: null, finished_at: null, finished_by: null, created_at: "2026-11-16T01:00:00Z", updated_at: "2026-11-16T01:00:00Z",
  });
  return [
    row(1, "Opor", "fridge", "2026-11-18", "gift", locale === "en" ? "Aunt Rina" : "Tante Rina"),
    row(2, "Sayur asem", "fridge", "2026-11-17", "home", null),
    row(3, "Rendang", "freezer", "2026-12-10", "home", null),
    row(4, "Kue lapis", "counter", "2026-11-19", "bought", null),
  ];
}

export const ITEMS = [
  { name: "Telur", category: "Dapur" },
  { name: "Sabun cuci piring", category: "Kebersihan" },
  { name: "Beras", category: "Dapur" },
  { name: "Minyak goreng", category: "Dapur" },
  { name: "Gula", category: "Dapur" },
  { name: "Tisu", category: "Kebersihan" },
].map((item, i) => ({
  id: id(0x6100 + i),
  household_id: HOUSEHOLD_ID,
  name: item.name,
  category: item.category,
  scope: "household",
  stock_status: "ok",
  quantity: 0,
  unit: null,
  track_amount: false,
  min_threshold: null,
  kept_in: i === 0 ? "fridge" : "pantry",
  expires_on: null,
  photo_url: null,
  notes: null,
  created_at: "2026-10-05T00:00:00Z",
}));
export const EGGS = ITEMS[0].id;
export const SOAP = ITEMS[1].id;

export const REPAIR = {
  id: id(0x1590),
  household_id: HOUSEHOLD_ID,
  title: "Keran wastafel bocor",
  notes: "Menetes terus sejak pagi.",
  status: "open",
  location_id: R("Kamar mandi"),
  reported_by: SARI,
  photo_url: photo("repair-tap"),
  created_at: "2026-11-15T03:00:00Z",
  updated_at: "2026-11-15T03:00:00Z",
};

export const REPAIR_2 = {
  ...REPAIR,
  id: id(0x1591),
  title: "Lampu teras mati",
  notes: "Bohlam di atas pintu depan.",
  location_id: R("Teras"),
  reported_by: JOKO,
  photo_url: null,
  created_at: "2026-11-16T00:30:00Z",
  updated_at: "2026-11-16T00:30:00Z",
};

export interface Demo {
  stub: Stub;
}

/** Install the stub with the demo household, for the owner (locale) or Sari's phone. */
export async function installDemo(
  context: BrowserContext,
  page: Page,
  as: { owner: "id" | "en" } | { staff: true },
  extra: { lights?: boolean; terraceToDo?: boolean; kakak?: boolean; at?: string; open?: string[] } = {}
): Promise<Stub> {
  // A token good for a year: the browser's clock is pinned to NOW and must
  // never think it ran out (a refresh loop would follow).
  const yearFromNow = Math.floor(Date.now() / 1000) + 365 * 86400;
  const schedules = [...BREAKFASTS, ...WALKS, ...(extra.lights ? LIGHTS : [])] as unknown as Record<string, unknown>[];
  const stub = await installStub(context, {
    ...("owner" in as
      ? { owner: { locale: as.owner }, stored: session(OWNER, yearFromNow, false) }
      : { staffPhone: true, stored: session("00000000-0000-4000-8000-00000000d001", yearFromNow, true) }),
    kakak: { allowed: true, enabled: extra.kakak ?? true },
    petNames: PETS,
    staff: STAFF.map((s) => ({ ...s })),
    rooms: ROOMS.map((r) => ({ ...r })),
    chores: chores({ terraceToDo: extra.terraceToDo, at: extra.at }),
    items: ITEMS,
    repairs: [{ ...REPAIR }, { ...REPAIR_2 }],
    schedules,
    household: { hasPets: true, createdAt: "2026-09-20T00:00:00Z" },
  });
  // The fixture's test medicine has no place in the demo home.
  for (let i = stub.schedules.length - 1; i >= 0; i--) {
    if (String(stub.schedules[i].title).startsWith("Medication")) stub.schedules.splice(i, 1);
  }
  const at = extra.at ?? "16:30";
  stub.logs.push(...petLogs(stub.schedules, at, extra.open ?? ["lights", "walk"]));
  await page.clock.setFixedTime(new Date(`${DAY}T${at}:00+07:00`));
  return stub;
}

export { HOUSEHOLD_ID, SCHEDULES };
