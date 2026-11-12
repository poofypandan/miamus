import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, installStub } from "./stub-backend";

// Today's new order (Phase 175, S3; docs/phase-175-tabs-and-today-plan.md,
// section 3): one status line first ("All on track" or "N waiting for you"),
// then what waits for the owner in one counted group, then each person's
// progress, what's coming, and the day's list with the Day · Week pill.
// A home that hasn't finished anything yet gets the Set up card instead.

// Today in Jakarta, the browser's zone, with the clock fixed at 10.00 so
// what is late is the same on every run (as staff-progress.spec.ts).
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const at10 = (page: Page) => page.clock.setFixedTime(new Date(`${today()}T10:00:00+07:00`));

const BUDI = "00000000-0000-4000-8000-00000000c012";
const person = (id: string, name: string) => ({
  id,
  household_id: HOUSEHOLD_ID,
  name,
  has_pin: true,
  user_id: null,
  archived_at: null,
  created_at: "2026-10-01T00:00:00Z",
});
const STAFF = [person(STAFF_ID, "Sari"), person(BUDI, "Budi")];

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000001750${String(++n).padStart(2, "0")}`,
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
const sweep = () =>
  chore({ title: "Sweep the hall", status: "completed", completed_by: STAFF_ID, completed_at: `${today()}T01:00:00Z` });
const mop = () => chore({ title: "Mop the kitchen" });

const report = () => ({
  id: "00000000-0000-4000-8000-000000175b01",
  household_id: HOUSEHOLD_ID,
  location_id: null,
  spot: null,
  title: "Keran bocor",
  details: null,
  photo_url: null,
  urgent: false,
  status: "reported",
  reported_by_staff: STAFF_ID,
  created_by: null,
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  updated_at: new Date().toISOString(),
  decided_by: null,
  decided_at: null,
  dismiss_reason: null,
  fixed_by_name: null,
  closed_at: null,
});

const status = (page: Page) => page.getByTestId("today-status");
const top = async (page: Page, locator: ReturnType<Page["locator"]>) => (await locator.boundingBox())!.y;

test("all clear: All on track first, no Waiting group, the pill down with the list", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    // Chores only, so the count is the two below; pet routines are counted
    // the same way, by tests/unit/today-status.test.ts.
    household: { hasPets: false },
    staff: STAFF,
    chores: [sweep(), mop()],
  });
  await at10(page);
  await page.goto("/dashboard");

  await expect(status(page)).toBeVisible({ timeout: 20_000 });
  await expect(status(page)).toHaveAttribute("data-state", "ok");
  await expect(status(page)).toContainText("All on track");
  // Nothing is late at 10.00: the mop has the whole day.
  await expect(status(page)).toContainText("1 of 2 done · nothing late");

  // Nothing waits, so the whole group is gone.
  await expect(page.getByTestId("waiting-for-you")).toBeHidden();
  await expect(page.getByText("Waiting for you")).toHaveCount(0);

  // The order: status, then each person, then the day with its pill.
  const progress = page.getByRole("region", { name: "Today's progress" });
  const pill = page.getByRole("tablist", { name: "Agenda range" });
  await expect(progress).toBeVisible();
  expect(await top(page, status(page))).toBeLessThan(await top(page, progress));
  expect(await top(page, progress)).toBeLessThan(await top(page, pill));

  // A tap on the status line opens Who did what.
  await status(page).click();
  await expect(page).toHaveURL(/workload=/);
  await expect(page.getByRole("dialog", { name: "Who did what" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Week keeps its pill on top; back on Day it is with the list again.
  await pill.getByRole("tab", { name: "Week" }).click();
  await expect(status(page)).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Agenda range" })).toBeVisible();
  await page.getByRole("tablist", { name: "Agenda range" }).getByRole("tab", { name: "Day" }).click();
  await expect(status(page)).toBeVisible();
});

test("Bahasa Indonesia, a busy day: the rows waiting are counted once, in one group", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "id" },
    household: { hasPets: false },
    staff: STAFF,
    // Washing the car was due at 08.00: late by 10.00.
    chores: [sweep(), mop(), chore({ title: "Cuci mobil", due_time: "08:00:00" })],
    repairs: [report()],
  });
  await at10(page);
  await page.goto("/dashboard");

  await expect(status(page)).toBeVisible({ timeout: 20_000 });
  await expect(status(page)).toHaveAttribute("data-state", "waiting");
  // Two rows: what is late, and the repair report.
  await expect(status(page)).toContainText("2 menunggu Anda");
  await expect(status(page)).toContainText("1 dari 3 selesai · 1 terlambat");

  const waiting = page.getByTestId("waiting-for-you");
  await expect(waiting).toBeVisible();
  await expect(waiting.getByRole("heading")).toHaveText("Menunggu Anda (2)");
  await expect(waiting.getByTestId("late-line")).toHaveText("1 terlambat");
  await expect(waiting.getByText("1 laporan kerusakan perlu dicek")).toBeVisible();

  // The group sits between the status line and the people.
  const progress = page.getByRole("region", { name: "Progres Hari ini" });
  expect(await top(page, status(page))).toBeLessThan(await top(page, waiting));
  expect(await top(page, waiting)).toBeLessThan(await top(page, progress));

  // The late row opens Who did what.
  await waiting.getByTestId("late-line").click();
  await expect(page).toHaveURL(/workload=/);
});

test("an older home whose finished work is weeks back still gets its status line (Codex, PR #105)", async ({
  context,
  page,
}) => {
  // Nothing finished in what Today loads: today's chore is open, and the
  // finished one is a one-off from October, outside every read. Whether the
  // Set up card is past is useFirstRun's read, not the chores on screen.
  await installStub(context, {
    owner: { locale: "en" },
    firstRun: true,
    household: { hasPets: false, pets: false },
    staff: STAFF,
    chores: [
      mop(),
      chore({
        title: "Wash the curtains",
        due_date: "2026-10-05",
        status: "completed",
        completed_by: STAFF_ID,
        completed_at: "2026-10-05T03:00:00Z",
      }),
    ],
  });
  await at10(page);
  await page.goto("/dashboard");

  await expect(status(page)).toBeVisible({ timeout: 20_000 });
  await expect(status(page)).toContainText("All on track");
  await expect(status(page)).toContainText("0 of 1 done · nothing late");
  await expect(page.getByRole("region", { name: "Set up your home" })).toHaveCount(0);
});

test("a home that hasn't finished anything yet: the Set up card, no status line", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    firstRun: true,
    staff: STAFF,
    chores: [mop()],
  });
  await at10(page);
  await page.goto("/dashboard");

  await expect(page.getByRole("region", { name: "Set up your home" })).toBeVisible({ timeout: 20_000 });
  await expect(status(page)).toHaveCount(0);
});
