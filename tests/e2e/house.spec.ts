import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, installStub } from "./stub-backend";

// Home opens on the house (21 Nov; Fable's 07 "The house view" and 08,
// decision 17): Rooms · Chores · Repairs, Rooms first and drawn as the house,
// the top floor first. A room is amber, with its mark, for an open repair or
// a chore left from an earlier day, and the reason is in words underneath.
// A chore simply not done yet today leaves its room plain.

const id = (n: number) => `00000000-0000-4000-8000-0000000007${String(n).padStart(2, "0")}`;
const place = (n: number, name: string, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  household_id: HOUSEHOLD_ID,
  name,
  created_at: "2026-10-01T00:00:00Z",
  kind: "room",
  parent_id: null,
  sort_order: n,
  ...extra,
});
const LT1 = place(1, "LT1", { kind: "floor", sort_order: 0 });
const LT2 = place(2, "LT2", { kind: "floor", sort_order: 1 });
const KITCHEN = place(3, "Dapur", { parent_id: LT1.id });
const LIVING = place(4, "Ruang tamu", { parent_id: LT1.id });
const TERRACE = place(5, "Teras", { parent_id: LT1.id });
const GUEST = place(6, "Kamar Tamu", { parent_id: LT2.id });
const BATH = place(7, "Kamar mandi", { parent_id: LT2.id });

function day(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000006${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  notes: null,
  category: "cleaning",
  assigned_to: STAFF_ID,
  due_date: day(0),
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

const leak = {
  id: id(50),
  household_id: HOUSEHOLD_ID,
  location_id: BATH.id,
  spot: null,
  title: "Keran wastafel bocor",
  details: null,
  photo_url: null,
  urgent: false,
  status: "open",
  reported_by_staff: null,
  created_by: null,
  created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  updated_at: new Date().toISOString(),
  decided_by: null,
  decided_at: null,
  dismiss_reason: null,
  fixed_by_name: null,
  closed_at: null,
};

const ROOMS = [LT1, LT2, KITCHEN, LIVING, TERRACE, GUEST, BATH];
const CHORES = [
  // Left from three days ago: the terrace turns amber.
  chore({ title: "Pel teras", due_date: day(-3), location_id: TERRACE.id }),
  // Today's, not done yet: the kitchen stays plain.
  chore({ title: "Lap kompor", due_date: day(0), location_id: KITCHEN.id }),
];

async function seenCards(context: import("@playwright/test").BrowserContext) {
  await context.addInitScript(() => {
    for (const card of [
      "home-centre-2026-11",
      "rooms-2026-11",
      "floors-2026-11",
      "room-picker-2026-11",
      "rooms-inside-2026-11",
      "repairs-2026-11",
    ]) {
      localStorage.setItem(`miamus.whats-new.${card}`, "seen");
    }
  });
}

test("Home opens on the house: top floor first, amber only for a repair or an earlier chore", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, rooms: ROOMS, chores: CHORES, repairs: [leak] });
  await seenCards(context);
  await page.goto("/dashboard?module=chores");

  const pills = page.getByRole("tablist", { name: "Home" });
  await expect(pills.getByRole("tab")).toHaveText(["Rooms", "Chores", "Repairs"], { timeout: 20_000 });
  await expect(pills.getByRole("tab", { name: "Rooms" })).toHaveAttribute("aria-selected", "true");

  const house = page.getByRole("region", { name: "The house" });
  await expect(house.getByRole("button", { name: /show its list$/ })).toHaveText(["LT2", "LT1"]);
  await expect(house.getByRole("button", { name: "LT2 · Kamar mandi, needs attention" })).toBeVisible();
  await expect(house.getByRole("button", { name: "LT1 · Teras, needs attention" })).toBeVisible();
  // Today's chore not done yet is not a problem.
  await expect(house.getByRole("button", { name: "LT1 · Dapur", exact: true })).toBeVisible();
  await expect(house.getByRole("button", { name: "LT2 · Kamar Tamu", exact: true })).toBeVisible();

  // The reasons, in words.
  const attention = page.getByRole("region", { name: "Needs attention" });
  await expect(attention.getByText("Keran wastafel bocor")).toBeVisible();
  await expect(attention.getByText("Pel teras")).toBeVisible();
  await expect(attention.getByText(/LT1 · Teras · since /)).toBeVisible();

  // A floor's name opens its list.
  await house.getByRole("button", { name: "LT1: show its list" }).click();
  const floor = page.getByRole("dialog", { name: "LT1" });
  await expect(floor.getByText("3 rooms")).toBeVisible();
  await expect(floor.getByRole("button", { name: /^Teras/ })).toBeVisible();
  await floor.getByRole("button", { name: /^Dapur/ }).click();
  await expect(page.getByRole("dialog", { name: "LT1 · Dapur" })).toBeVisible();
  await page.keyboard.press("Escape");

  // A room opens its sheet, with its repair.
  await house.getByRole("button", { name: "LT2 · Kamar mandi, needs attention" }).click();
  const bath = page.getByRole("dialog", { name: "LT2 · Kamar mandi" });
  await expect(bath.getByRole("region", { name: "Repairs" }).getByText("Keran wastafel bocor")).toBeVisible();
  await page.keyboard.press("Escape");

  // A late chore opens Chores, where it waits under From earlier.
  await attention.getByRole("button", { name: /^Pel teras/ }).click();
  await expect(page).toHaveURL(/chores=today/);
  await expect(pills.getByRole("tab", { name: "Chores" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("From earlier")).toBeVisible();
  await page.goBack();
  await expect(pills.getByRole("tab", { name: "Rooms" })).toHaveAttribute("aria-selected", "true");
});

test("browsing another week first: the house still knows what was left, and its link opens today (Codex, PR #186)", async ({
  context,
  page,
}) => {
  await installStub(context, { owner: { locale: "en" }, rooms: ROOMS, chores: CHORES, repairs: [leak] });
  await seenCards(context);
  await page.goto("/dashboard?module=chores&chores=today");
  await page.getByLabel("Jump to date").fill(day(9), { timeout: 20_000 });
  await page.getByRole("tablist", { name: "Home" }).getByRole("tab", { name: "Rooms" }).click();

  const house = page.getByRole("region", { name: "The house" });
  await expect(house.getByRole("button", { name: "LT1 · Teras, needs attention" })).toBeVisible();
  const attention = page.getByRole("region", { name: "Needs attention" });
  await attention.getByRole("button", { name: /^Pel teras/ }).click();
  await expect(page).toHaveURL(/chores=today/);
  await expect(page.getByText("From earlier")).toBeVisible();
  await expect(page.getByText("Pel teras")).toBeVisible();
});

test("the house in Bahasa Indonesia", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" }, rooms: ROOMS, chores: CHORES, repairs: [leak] });
  await seenCards(context);
  await page.goto("/dashboard?module=chores");

  await expect(page.getByRole("tablist", { name: "Rumah" }).getByRole("tab")).toHaveText(["Ruangan", "Tugas", "Perbaikan"], {
    timeout: 20_000,
  });
  const house = page.getByRole("region", { name: "Rumah" }).last();
  await expect(house.getByRole("button", { name: "LT2 · Kamar mandi, perlu perhatian" })).toBeVisible();
  const attention = page.getByRole("region", { name: "Perlu perhatian" });
  await expect(attention.getByText(/LT1 · Teras · sejak /)).toBeVisible();
});

test("a home of two rooms keeps the list, and nothing amber means no Needs attention", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    rooms: [place(8, "Teras"), place(9, "Garasi")],
    chores: [],
    repairs: [],
  });
  await seenCards(context);
  await page.goto("/dashboard?module=chores");
  await expect(page.getByRole("button", { name: /^Teras/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "The house" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
});

test("Repairs switched off: no amber for repairs, ?chores=repairs opens the house", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    rooms: ROOMS,
    chores: [],
    repairs: [leak],
    features: { repairs: false },
  });
  await seenCards(context);
  await page.goto("/dashboard?module=chores&chores=repairs");
  const house = page.getByRole("region", { name: "The house" });
  await expect(house.getByRole("button", { name: "LT2 · Kamar mandi", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Needs attention" })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Home" }).getByRole("tab")).toHaveText(["Rooms", "Chores"]);
});
