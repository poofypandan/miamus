import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, installStub } from "./stub-backend";

// Chores → Rooms (Phase 158, PR A): the household's rooms by floor, which
// rooms have a job (Vacuum) and which don't, and adding it from there. Rooms
// and chores come from the stub; nothing reaches a real backend.

const room = (id: string, name: string) => ({
  id: `00000000-0000-4000-8000-0000000001${id}`,
  household_id: HOUSEHOLD_ID,
  name,
  created_at: "2026-10-01T00:00:00Z",
});
const LOUNGE = room("01", "LT2 Lounge");
const WHOLE_LT2 = room("02", "LT2");
const CLOSET = room("03", "LT2 Walk-in closet");
const MUSIC = room("04", "LT3 Music Room");
const TERRACE = room("05", "Teras");

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000002${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  notes: null,
  category: "cleaning",
  assigned_to: STAFF_ID,
  due_date: today(),
  due_time: null,
  status: "pending",
  completed_by: null,
  completed_at: null,
  photo_url: null,
  created_at: "2026-11-01T00:00:00Z",
  recurrence: "none",
  recurrence_until: null,
  parent_task_id: null,
  requires_supervision: false,
  before_photo_url: null,
  after_photo_url: null,
  location_id: null,
  ...over,
});

const CHORES = [
  // A Monday and a Thursday: the Lounge is vacuumed "Mon, Thu".
  chore({ title: "Vacuum & pel, dusting plafon", recurrence: "weekly", due_date: "2026-11-09", location_id: LOUNGE.id }),
  chore({ title: "Vacuum & pel", recurrence: "weekly", due_date: "2026-11-12", location_id: LOUNGE.id }),
  chore({ title: "Buang sampah", recurrence: "daily", location_id: WHOLE_LT2.id }),
  chore({ title: "Rapihkan baju, setrika baju", recurrence: "weekly", due_date: "2026-11-11", location_id: CLOSET.id }),
  chore({ title: "Sedot debu karpet", recurrence: "weekly", due_date: "2026-11-11", location_id: MUSIC.id }),
  chore({ title: "Vacuum sofa" }),
  // Set up three weeks out: outside the week the Agenda loads (Codex, #30).
  chore({ title: "Vacuum kamar musik", due_date: inDays(21), location_id: TERRACE.id }),
];
const ROOMS = [LOUNGE, WHOLE_LT2, CLOSET, MUSIC, TERRACE];

test("Rooms: which rooms get vacuumed, and adding it where it's missing", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, rooms: ROOMS, chores: CHORES });
  await page.goto("/dashboard?module=chores");

  await page.getByRole("tab", { name: "Rooms" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/chores=rooms/);

  // Floors in order, the whole floor first, rooms without a floor last.
  const lt2 = page.getByRole("region", { name: "LT2" });
  await expect(lt2.getByText("Whole floor")).toBeVisible();
  await expect(lt2.getByText("Lounge")).toBeVisible();
  await expect(page.getByRole("region", { name: "LT3" }).getByText("Music Room")).toBeVisible();
  await expect(page.getByRole("region", { name: "Other rooms" }).getByText("Teras")).toBeVisible();
  // One chip per job, with its days.
  await expect(lt2.getByText("Vacuum · Mon, Thu")).toBeVisible();
  await expect(page.getByText("1 chore has no room")).toBeVisible();

  // Vacuum: "sedot debu" counts as vacuuming, never as dusting.
  await page.getByRole("button", { name: /^Vacuum \d/ }).click();
  await expect(page).toHaveURL(/job=vacuum/);
  // The terrace's vacuum is three weeks out, yet it counts.
  await expect(page.getByText(/in 3 of 4\s+rooms/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Other rooms" }).getByText("No vacuum yet")).toHaveCount(0);
  await expect(lt2.getByText("Vacuum in 1 of 2")).toBeVisible();
  await expect(lt2.getByText("Mon, Thu · Ari")).toBeVisible();
  await expect(page.getByRole("region", { name: "LT3" }).getByText("Wed · Ari")).toBeVisible();
  await expect(lt2.getByText("No vacuum yet")).toHaveCount(2); // the whole floor and the closet

  // Add it to the closet: the room and the job are filled in.
  await page.getByRole("button", { name: "Add vacuum in Walk-in closet" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Add Chore" })).toBeVisible();
  await expect(dialog.getByRole("textbox").first()).toHaveValue("Vakum");
  await expect(dialog.getByText("LT2 Walk-in closet")).toBeVisible();
  await dialog.getByRole("button", { name: "Add Chore" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Vakum", location_id: CLOSET.id });
  await expect(lt2.getByText("No vacuum yet")).toHaveCount(1);
  await expect(page.getByText(/in 4 of 4\s+rooms/)).toBeVisible();

  // A room's sheet lists what's set up there, by job.
  await page.getByRole("button", { name: /^All \d/ }).click();
  await lt2.getByText("Lounge").click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "LT2 Lounge" })).toBeVisible();
  await expect(sheet.getByText("Every Monday · Ari")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Add chore here" })).toBeVisible();

  expect(stub.seen.realBackend).toEqual([]);
});

test("Rooms in Bahasa Indonesia, with its What's new card shown once", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" }, rooms: ROOMS, chores: CHORES });
  await page.goto("/dashboard?module=chores");

  const card = page.getByRole("region", { name: "Baru: Ruangan" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole("button", { name: "Lihat Ruangan" }).click();
  await expect(page).toHaveURL(/chores=rooms/);
  await expect(page.getByRole("tab", { name: "Ruangan" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Seluruh lantai")).toBeVisible();
  await expect(page.getByText("Vakum · Sen, Kam")).toBeVisible();

  await page.getByRole("button", { name: /^Vakum \d/ }).click();
  await expect(page.getByText(/di 3 dari 4\s+ruangan/)).toBeVisible();
  await expect(page.getByText("Belum ada vakum").first()).toBeVisible();

  // Closed once, it stays closed on this phone; Household → Yang baru keeps it.
  await page.goto("/dashboard?module=chores");
  await expect(page.getByRole("tab", { name: "Hari ini" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Baru: Ruangan" })).toHaveCount(0);
  await page.goto("/dashboard?module=access&page=whats-new");
  await expect(page.getByRole("heading", { name: "Baru: Ruangan" })).toBeVisible({ timeout: 20_000 });
});
