import { expect, test, type Page } from "@playwright/test";
import { BENTO, HOUSEHOLD_ID, MOCHI, schedule } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Staff progress on Today (owners, 11 Nov): one row per person, house and
// pets, only the kinds each has and never 0/0; Libur on leave; an "Anyone,
// not done yet" row; calm tones; a tap opens the person's day; gone from
// Chores; a staff phone sees only its own numbers.

// Today in Jakarta, the browser's zone (playwright.config.ts), whatever zone
// the runner is in: CI runs in UTC. The clock is fixed at 10.00 there, so
// what is late is the same on every run.
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const at10 = (page: Page) => page.clock.setFixedTime(new Date(`${today()}T10:00:00+07:00`));

const SYAM = "00000000-0000-4000-8000-00000000c002";
const DEWI = "00000000-0000-4000-8000-00000000c003";
const person = (id: string, name: string) => ({
  id,
  household_id: HOUSEHOLD_ID,
  name,
  has_pin: true,
  user_id: null,
  archived_at: null,
  created_at: "2026-10-01T00:00:00Z",
});
const STAFF = [person(STAFF_ID, "Ari"), person(SYAM, "Syam"), person(DEWI, "Dewi")];

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000001740${String(++n).padStart(2, "0")}`,
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
  spot: null,
  ...over,
});

// Syam's two routines (staff chip, migrations/144): the walk done at 07.20,
// fresh water at 12.00 still ahead.
const WALK = schedule(MOCHI, "Jalan-jalan", ["07:00"], { kind: "walk", proof: "tick", staff_id: SYAM });
const WATER = schedule(BENTO, "Ganti air minum", ["12:00"], { kind: "water", proof: "tick", staff_id: SYAM });
const walkLog = () => ({
  id: "00000000-0000-4000-8000-000000174a01",
  schedule_id: WALK.id,
  entity_id: MOCHI.id,
  module: "pet",
  photo_url: null,
  notes: null,
  completed_at: `${today()}T07:20:00+07:00`,
  staff_id: SYAM,
  sub_type: "complete",
  received_at: `${today()}T00:20:01Z`,
});

const sweep = () => chore({ title: "Sweep the hall", status: "completed", completed_by: STAFF_ID, completed_at: `${today()}T01:00:00Z` });
const mop = () => chore({ title: "Mop the kitchen" });

const progress = (page: Page, name = "Today's progress") => page.getByRole("region", { name });
const row = (page: Page, name: string) => page.getByTestId("staff-progress-row").filter({ hasText: name });

test("a chores-only maid and a pets-only maid each show only their own kind, never 0/0", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    staff: [person(STAFF_ID, "Ari"), person(SYAM, "Syam")],
    chores: [sweep(), mop()],
    schedules: [WALK, WATER],
    logs: [walkLog()],
  });
  await at10(page);
  await page.goto("/dashboard");

  const card = progress(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  const ari = row(page, "Ari");
  await expect(ari.getByTestId("progress-house")).toHaveText("House 1/2");
  await expect(ari.getByTestId("progress-pets")).toHaveCount(0);
  await expect(ari.getByTestId("staff-progress-line")).toHaveText("1 left");
  await expect(ari).toHaveAttribute("data-tone", "neutral");

  const syam = row(page, "Syam");
  await expect(syam.getByTestId("progress-pets")).toHaveText("Pets 1/2");
  await expect(syam.getByTestId("progress-house")).toHaveCount(0);
  await expect(syam).toHaveAttribute("data-tone", "neutral");
  await expect(card).not.toContainText("0/0");

  // A tap opens Syam's whole day.
  await syam.click();
  await expect(page).toHaveURL(new RegExp(`workload=today&person=${SYAM}`));
  const sheet = page.getByRole("dialog", { name: "Syam" });
  const day = sheet.getByTestId("staff-person-day");
  await expect(day.getByTestId("staff-person-task")).toHaveCount(2);
  await expect(day.getByTestId("staff-person-task").nth(0)).toContainText("Jalan-jalan · Mochi");
  await expect(day.getByTestId("staff-person-task").nth(0)).toContainText(/Done 7:20/);
  await expect(day.getByTestId("staff-person-task").nth(1)).toContainText("Ganti air minum · Bento");
  await expect(day.getByTestId("staff-person-task").nth(1)).toContainText("Not yet");

  // Back to everyone, then closed.
  await sheet.getByRole("button", { name: "Everyone" }).click();
  await expect(page.getByRole("dialog", { name: "Who did what" })).toBeVisible();
  await expect(page).not.toHaveURL(/person=/);
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/workload=/);

  // No strip on Chores, none on Pets.
  await page.goto("/dashboard?module=chores");
  await expect(page.getByText("Mop the kitchen")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("staff-progress-row")).toHaveCount(0);
  await expect(page.getByText("Today's progress")).toHaveCount(0);
  await page.goto("/dashboard?module=pets");
  // Its own per-pet card stays; no staff rows.
  await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("staff-progress-row")).toHaveCount(0);
});

test("someone on approved leave shows Libur, and their chore waits for anyone", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "id" },
    staff: STAFF,
    chores: [sweep(), chore({ title: "Setrika baju", assigned_to: DEWI })],
    leaves: [
      {
        id: "00000000-0000-4000-8000-000000174b01",
        household_id: HOUSEHOLD_ID,
        staff_id: DEWI,
        start_date: today(),
        end_date: today(),
        status: "approved",
        fallback_action: "unassign",
        fallback_assignee_id: null,
        ended_on: null,
        decided_by: null,
        decided_at: null,
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
  });
  await at10(page);
  await page.goto("/dashboard");

  const dewi = row(page, "Dewi");
  await expect(dewi).toBeVisible({ timeout: 20_000 });
  await expect(dewi.getByTestId("staff-progress-line")).toHaveText("Libur");
  await expect(dewi.getByTestId("progress-house")).toHaveCount(0);
  await expect(row(page, "Ari").getByTestId("progress-house")).toHaveText("Rumah 1/1");

  // Her ironing is on the Anyone row now.
  await page.getByTestId("staff-progress-anyone").click();
  const sheet = page.getByRole("dialog", { name: "Siapa saja, belum dikerjakan" });
  await expect(sheet.getByTestId("staff-person-task").filter({ hasText: "Setrika baju" })).toBeVisible();
});

test("Anyone tasks sit on their own small row, red once some are late", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, staff: [person(STAFF_ID, "Ari")], chores: [chore({ title: "Water the plants", assigned_to: null })] });
  await at10(page);
  await page.goto("/dashboard");

  // The fixture's 13 routine slots are anyone's, plus the plants. At 10.00 the
  // two 07.00 potties and the 08.00 medicine are past their hour's grace.
  const anyone = page.getByTestId("staff-progress-anyone");
  await expect(anyone).toBeVisible({ timeout: 20_000 });
  await expect(anyone).toContainText("Anyone, not done yet");
  await expect(anyone).toContainText("14");
  await expect(anyone).toContainText("3 late");
  await expect(anyone).toHaveAttribute("data-tone", "red");
  // Ari has none of it: a calm "No tasks", not 0/0.
  await expect(row(page, "Ari").getByTestId("staff-progress-line")).toHaveText("No tasks");
  await expect(progress(page)).not.toContainText("0/0");

  await anyone.click();
  await expect(page).toHaveURL(/person=anyone/);
  const tasks = page.getByRole("dialog", { name: "Anyone, not done yet" }).getByTestId("staff-person-task");
  await expect(tasks).toHaveCount(14);
  await expect(tasks.filter({ hasText: "Water the plants" })).toContainText("Not yet");
  await expect(tasks.filter({ hasText: "Late" })).toHaveCount(3);
});

test("amber when something couldn't be done, red only when late", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    staff: [person(STAFF_ID, "Ari"), person(SYAM, "Syam")],
    chores: [sweep(), chore({ title: "Wash the car", due_time: "08:00:00" })],
    schedules: [WALK, WATER],
    logs: [walkLog()],
    exceptions: [
      {
        id: "00000000-0000-4000-8000-000000174c01",
        household_id: HOUSEHOLD_ID,
        chore_id: null,
        schedule_id: WATER.id,
        entity_id: BENTO.id,
        occurs_on: today(),
        slot_time: "12:00:00",
        reason: "out_of_stock",
        note: null,
        photo_url: null,
        inventory_item_id: null,
        staff_id: SYAM,
        created_at: `${today()}T02:30:00Z`,
      },
    ],
  });
  await at10(page);
  await page.goto("/dashboard");

  const ari = row(page, "Ari");
  await expect(ari).toHaveAttribute("data-tone", "red", { timeout: 20_000 });
  await expect(ari.getByTestId("staff-progress-line")).toHaveText("1 late");
  const syam = row(page, "Syam");
  await expect(syam).toHaveAttribute("data-tone", "amber");
  await expect(syam.getByTestId("staff-progress-line")).toHaveText("1 couldn't be done");
  await syam.click();
  await expect(page.getByRole("dialog", { name: "Syam" }).getByTestId("staff-person-task").nth(1)).toContainText(
    "Couldn't · Out of stock"
  );
});

test("a staff phone shows only its own progress, in Indonesian", async ({ context, page }) => {
  // This phone is Ari's (stub-backend): house only. Syam's pet numbers stay off it.
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    staff: [person(STAFF_ID, "Ari"), person(SYAM, "Syam")],
    chores: [sweep(), mop()],
    schedules: [WALK, WATER],
    logs: [walkLog()],
  });
  await at10(page);
  await page.goto("/staff");

  const mine = page.getByRole("group", { name: "Progres Anda" });
  await expect(mine).toBeVisible({ timeout: 20_000 });
  await expect(mine).toHaveText("Rumah 1/2");
  await expect(mine).not.toContainText("Hewan");
  // No one else's row. (Syam's name is still on her routine's card, which
  // every phone shows since migrations/144: the card says who it is for.)
  await expect(page.getByTestId("staff-progress-row")).toHaveCount(0);
  await expect(page.getByTestId("staff-progress-anyone")).toHaveCount(0);
  await expect(page.getByTestId("my-progress")).toHaveCount(1);
});

test("with Pets switched off, no pet counts and no pet routines on the Anyone row", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    household: { hasPets: false },
    staff: [person(STAFF_ID, "Ari"), person(SYAM, "Syam")],
    chores: [sweep(), mop()],
    schedules: [WALK, WATER],
    logs: [walkLog()],
  });
  await at10(page);
  await page.goto("/dashboard");

  await expect(row(page, "Ari").getByTestId("progress-house")).toHaveText("House 1/2", { timeout: 20_000 });
  await expect(page.getByTestId("progress-pets")).toHaveCount(0);
  await expect(row(page, "Syam").getByTestId("staff-progress-line")).toHaveText("No tasks");
  // The fixture's routines are anyone's; with Pets off they aren't counted.
  await expect(page.getByTestId("staff-progress-anyone")).toHaveCount(0);
});
