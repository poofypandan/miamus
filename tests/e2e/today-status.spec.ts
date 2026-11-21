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
  await page.goto("/dashboard?day=all");

  await expect(status(page)).toBeVisible({ timeout: 20_000 });
  await expect(status(page)).toHaveAttribute("data-state", "ok");
  await expect(status(page)).toContainText("All on track");
  // Nothing is late at 10.00: the mop has the whole day.
  await expect(status(page)).toHaveAttribute("aria-label", /1\ of\ 2\ done\ ·\ nothing\ late/);

  // Nothing waits, so the whole group is gone.
  await expect(page.getByTestId("waiting-for-you")).toBeHidden();
  await expect(page.getByText("Waiting for you")).toHaveCount(0);

  // The order: status, then each person, then the day (Today v3: Day | Week
  // lives in the date pill's sheet, not under See all).
  const progress = page.getByRole("region", { name: "Today's progress" });
  const day = page.getByRole("heading", { name: "Today", exact: true });
  await expect(progress).toBeVisible();
  expect(await top(page, status(page))).toBeLessThan(await top(page, progress));
  expect(await top(page, progress)).toBeLessThan(await top(page, day));

  // A tap on the status line opens Latest: what has been finished (Today v3).
  await status(page).click();
  await expect(page.getByRole("dialog", { name: "Latest" })).toBeVisible();
  await expect(page.getByTestId("latest-list")).toBeVisible();
  // Back closes Latest and stays on Today (Codex, PR #181).
  await page.goBack();
  await expect(page.getByRole("dialog", { name: "Latest" })).toBeHidden();
  await expect(status(page)).toBeVisible();

  // Week from the date pill's sheet keeps its pill on top; back on Day the
  // status returns.
  await page.getByTestId("date-pill").click();
  await page.getByRole("dialog").getByRole("tab", { name: "Week" }).click();
  await expect(status(page)).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Agenda range" }).first()).toBeVisible();
  await page.getByRole("tablist", { name: "Agenda range" }).first().getByRole("tab", { name: "Day" }).click();
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
  await page.goto("/dashboard?day=all");

  await expect(status(page)).toBeVisible({ timeout: 20_000 });
  await expect(status(page)).toHaveAttribute("data-state", "waiting");
  // Two rows: what is late, and the repair report.
  await expect(status(page)).toContainText("2 menunggu Anda");
  await expect(status(page)).toHaveAttribute("aria-label", /1\ dari\ 3\ selesai\ ·\ 1\ terlambat/);

  const waiting = page.getByTestId("waiting-for-you");
  await expect(waiting).toBeVisible();
  await expect(waiting.getByRole("heading")).toHaveText("Menunggu Anda (2)");
  await expect(waiting.getByTestId("late-line")).toHaveText("1 terlambat");
  await expect(waiting.getByText("1 laporan kerusakan perlu dicek")).toBeVisible();

  // The group sits between the status line and the people.
  const progress = page.getByRole("region", { name: "Progres Hari ini" });
  expect(await top(page, status(page))).toBeLessThan(await top(page, waiting));
  expect(await top(page, waiting)).toBeLessThan(await top(page, progress));

  // The late row opens the work it counts (Codex, PR #105): it is all
  // Sari's, so her day, where the late chore is listed.
  await waiting.getByTestId("late-line").click();
  await expect(page).toHaveURL(new RegExp(`workload=today&person=${STAFF_ID}`));
  const day = page.getByRole("dialog", { name: "Sari" }).getByTestId("staff-person-day");
  await expect(day.getByTestId("staff-person-task").filter({ hasText: "Cuci mobil" })).toBeVisible();
});

test("late work spread over several people: the late row goes to the progress card", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    household: { hasPets: false },
    staff: STAFF,
    chores: [
      sweep(),
      chore({ title: "Wash the car", due_time: "08:00:00" }),
      chore({ title: "Clean the pool", assigned_to: BUDI, due_time: "08:30:00" }),
    ],
  });
  await at10(page);
  await page.goto("/dashboard");

  const line = page.getByTestId("late-line");
  await expect(line).toHaveText("2 late", { timeout: 20_000 });
  await line.click();
  // No sheet: each person with something late is one tap away on the card.
  await expect(page).not.toHaveURL(/workload=/);
  await expect(page.getByRole("region", { name: "Today's progress" })).toBeInViewport();
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
  await expect(status(page)).toHaveAttribute("aria-label", /0\ of\ 1\ done\ ·\ nothing\ late/);
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

test("the date pill sits above Kakak's band and takes its own taps (Codex, PR #181)", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  // Kakak's band arrives once her status loads, which on a phone is after
  // the pill: hold her status back so the band's portal is added second, and
  // the pill still has to be the one that receives the tap.
  await page.route(/\/rpc\/kakak_status/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route.fallback();
  });
  await page.goto("/dashboard?module=agenda");
  await expect(page.getByTestId("date-pill")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("kakak-band")).toBeVisible({ timeout: 20_000 });
  const pill = page.getByTestId("date-pill");
  // Polled: the launch cover is still fading over everything at first.
  await expect
    .poll(
      async () => {
        const box = await pill.boundingBox();
        if (!box) return false;
        return page.evaluate(
          ([x, y]) => document.elementFromPoint(x, y)?.closest('[data-testid="date-pill"]') != null,
          [box.x + box.width / 2, box.y + box.height / 2]
        );
      },
      { timeout: 10_000 }
    )
    .toBe(true);
  await pill.click();
  await expect(page.getByRole("dialog", { name: "Choose a day" })).toBeVisible();
  // One room under the page, the band's: the pill adds none of its own.
  await expect(page.locator("main [aria-hidden=true].h-24")).toHaveCount(1);
});

test("on a 360 px phone in Indonesian, Hari ini stands above the date pill, clear of Kakak (Codex, PR #181)", async ({ context, page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard?module=agenda");
  const kakak = page.getByRole("button", { name: "Bilang ke Kakak" });
  await expect(kakak).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("date-pill").click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await page
    .getByRole("dialog")
    .getByRole("button")
    .filter({ hasText: new RegExp(`^\\D*${tomorrow.getDate()}$`) })
    .first()
    .click();
  const back = page.getByRole("button", { name: "Hari ini", exact: true });
  await expect(back).toBeVisible();
  await expect(page.locator("[data-stacked]")).toHaveCount(1);
  const [a, b, pill] = await Promise.all([back.boundingBox(), kakak.boundingBox(), page.getByTestId("date-pill").boundingBox()]);
  if (!a || !b || !pill) throw new Error("missing a box");
  // Not over Kakak's button, and above the date pill rather than beside it.
  expect(a.x + a.width <= b.x || a.y + a.height <= b.y).toBe(true);
  expect(a.y + a.height).toBeLessThanOrEqual(pill.y);
  await back.click();
  await expect(back).toHaveCount(0);
});

test("Week from the date pill's sheet leaves no dead Back press (Codex, PR #181)", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=chores");
  await expect(page.getByRole("navigation").first()).toBeVisible({ timeout: 20_000 });
  await page.goto("/dashboard?module=agenda");
  await page.getByTestId("date-pill").click();
  await page.getByRole("dialog").getByRole("tab", { name: "Week" }).click();
  await expect(page).toHaveURL(/range=week/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goBack();
  await expect(page).not.toHaveURL(/range=week/);
  await expect(page).toHaveURL(/module=agenda/);
  await page.goBack();
  await expect(page).toHaveURL(/module=chores/);
});
