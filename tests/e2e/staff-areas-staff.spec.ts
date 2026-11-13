import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID, MOCHI, schedule } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// What each staff member sees (Phase 178, V3): the staff page follows the
// owner's switches for the person signed in. Dapur and Perbaikan pills,
// chores for Anyone, pet routines, Menu hari ini; Lapor stays whole; a
// shared phone follows whoever is signed in. Bahasa Indonesia only.

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const SYAM = "00000000-0000-4000-8000-00000000c002";
const person = (id: string, name: string, hidden: string[] = []) => ({
  id,
  household_id: HOUSEHOLD_ID,
  name,
  has_pin: true,
  user_id: null,
  archived_at: null,
  hidden_areas: hidden,
  created_at: "2026-10-01T00:00:00Z",
});

let n = 0;
const chore = (title: string, assigned_to: string | null) => ({
  id: `00000000-0000-4000-8000-0000001780${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  title,
  notes: null,
  category: "cleaning",
  assigned_to,
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
  spot: null,
});
const CHORES = [chore("Sapu teras", null), chore("Setrika baju", STAFF_ID)];
// A routine set for Ari by name, beside the fixture's routines for nobody.
const ARI_WALK = schedule(MOCHI, "Jalan pagi Ari", ["06:30"], { kind: "walk", proof: "tick", staff_id: STAFF_ID });
const DISH = {
  id: "00000000-0000-4000-8000-000000178d01",
  household_id: HOUSEHOLD_ID,
  day: today(),
  meal: "lunch",
  recipe_id: null,
  title: "Sayur asem",
  servings: null,
  notes: null,
  position: 0,
  cooked_at: null,
  cooked_by: null,
  cooked_uses: null,
  created_by: null,
  created_at: "2026-11-10T00:00:00Z",
  updated_at: "2026-11-10T00:00:00Z",
};

async function open(page: Page, ari: string[], syam: string[] = [], path = "/staff") {
  await installStub(page.context(), {
    stored: freshSession(),
    staffPhone: true,
    staff: [person(STAFF_ID, "Ari", ari), person(SYAM, "Syam", syam)],
    chores: CHORES,
    schedules: [ARI_WALK],
    features: { kitchen: true, repairs: true },
    menu: [DISH],
  });
  await page.goto(path);
  await expect(page.getByRole("tab", { name: "Tugas Hari Ini" })).toBeVisible({ timeout: 20_000 });
}

const pill = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

test("nothing switched off: the page is as before", async ({ page }) => {
  await open(page, []);
  await expect(pill(page, "Dapur")).toBeVisible();
  await expect(pill(page, "Perbaikan")).toBeVisible();
  await expect(page.getByText("Sapu teras")).toBeVisible();
  await expect(page.getByText("Setrika baju")).toBeVisible();
  await expect(page.getByText("Pipis & Pup").first()).toBeVisible();
  await expect(page.getByText("Jalan pagi Ari")).toBeVisible();
  await expect(page.getByRole("region", { name: "Menu hari ini", exact: true })).toBeVisible();
});

test("Kitchen and Repairs off: only Tugas Hari Ini, links to Dapur land on Tugas, Lapor unchanged", async ({ page }) => {
  await open(page, ["kitchen", "repairs"]);
  await expect(pill(page, "Dapur")).toHaveCount(0);
  await expect(pill(page, "Perbaikan")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Menu hari ini", exact: true })).toHaveCount(0);
  // Chores and routines are untouched.
  await expect(page.getByText("Sapu teras")).toBeVisible();
  await expect(page.getByText("Pipis & Pup").first()).toBeVisible();

  // Lapor keeps every report: food arriving and something broken.
  await page.getByRole("button", { name: /^Lapor/ }).click();
  const lapor = page.getByRole("dialog");
  await expect(lapor.getByText("Makanan masuk", { exact: true })).toBeVisible();
  await expect(lapor.getByText("Lapor kerusakan", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  // Links straight to Dapur or Perbaikan read as Tugas.
  for (const view of ["stok", "perbaikan"]) {
    await page.goto(`/staff?view=${view}`);
    await expect(pill(page, "Tugas Hari Ini")).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
    await expect(page.getByText("Sapu teras")).toBeVisible();
  }
  // No English on the page.
  await expect(page.locator("main")).not.toContainText(/Kitchen|Repairs|Anyone|Pet routines/);
});

test("Kitchen off alone keeps Perbaikan", async ({ page }) => {
  await open(page, ["kitchen"]);
  await expect(pill(page, "Dapur")).toHaveCount(0);
  await expect(pill(page, "Perbaikan")).toBeVisible();
});

test("Repairs off alone keeps Dapur", async ({ page }) => {
  await open(page, ["repairs"]);
  await expect(pill(page, "Dapur")).toBeVisible();
  await expect(pill(page, "Perbaikan")).toHaveCount(0);
});

test("chores for anyone and pet routines off: Anyone's work goes, what's given by name stays", async ({ page }) => {
  // Syam keeps both on, so nothing falls back to everybody.
  await open(page, ["home", "pets"]);
  await expect(page.getByText("Setrika baju")).toBeVisible();
  await expect(page.getByText("Jalan pagi Ari")).toBeVisible();
  await expect(page.getByText("Sapu teras")).toHaveCount(0);
  await expect(page.getByText("Pipis & Pup")).toHaveCount(0);
});

test("nobody has them on: chores for anyone and pet routines show to everybody", async ({ page }) => {
  await open(page, ["home", "pets"], ["home", "pets"]);
  await expect(page.getByText("Sapu teras")).toBeVisible();
  await expect(page.getByText("Pipis & Pup").first()).toBeVisible();
});

test("a shared phone follows whoever is signed in", async ({ page }) => {
  await open(page, ["kitchen", "repairs"]);
  await expect(pill(page, "Dapur")).toHaveCount(0);
  // Syam signs in on the same phone (the gate stores whose PIN opened it).
  await page.evaluate((syam) => {
    localStorage.setItem("banyuwangi11:staffId", syam);
    localStorage.setItem("banyuwangi11:staffName", "Syam");
  }, SYAM);
  await page.reload();
  await expect(page.getByRole("tab", { name: "Tugas Hari Ini" })).toBeVisible({ timeout: 20_000 });
  await expect(pill(page, "Dapur")).toBeVisible();
  await expect(pill(page, "Perbaikan")).toBeVisible();
  // Ari's own chore is not Syam's.
  await expect(page.getByText("Setrika baju")).toHaveCount(0);
});
