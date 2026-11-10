import { expect, test, type BrowserContext } from "@playwright/test";
import { STUB_URL, installStub } from "./stub-backend";

// The north star in numbers (Phase 172 PR 0, migrations/142): platform
// admins reach it from Household requests and read S1–S5 with their targets
// and a card per sign-up week; anyone else gets "Not available". The
// database decides who may read it (platform_north_star() raises 42501);
// answered here, after the stub, since Playwright tries the most recently
// added route first.

const report = {
  as_of: "2026-11-10",
  weeks_requested: 8,
  targets: { s1_setup_minutes: 10, s2_typed_fields: 10, s3_share: 0.9, s4_share: 0.7, s5_share: 0.5 },
  summary: {
    households: 3,
    first_finish_minutes: 135,
    same_day: 2,
    same_day_of: 3,
    signup_minutes: 1440,
    setup_households: 0,
    setup_minutes: null,
    typed_fields: null,
    hand_items_14d: 64,
    hand_items_14d_of: 1,
    s3_due: 200,
    s3_closed: 170,
    s4_active: 1,
    s4_of: 1,
    s5_repeat: 0,
    s5_of: 0,
  },
  weeks: [
    {
      week_start: "2026-11-09",
      households: 1,
      same_day: 1,
      same_day_of: 1,
      first_finish_minutes: 45,
      paths: { template: 0, kakak: 0, manual: 0, mixed: 0 },
      s3_due: 30,
      s3_closed: 27,
    },
    {
      week_start: "2026-11-02",
      households: 2,
      same_day: 1,
      same_day_of: 2,
      first_finish_minutes: 225,
      signup_minutes: 1440,
      paths: { template: 0, kakak: 0, manual: 0, mixed: 0 },
      s3_due: 170,
      s3_closed: 143,
    },
  ],
};

interface Asked {
  body: Record<string, unknown>;
}

async function answerNorthStar(
  context: BrowserContext,
  answer: { status: number; json: unknown }
): Promise<Asked[]> {
  const asked: Asked[] = [];
  await context.route(`${STUB_URL}/rest/v1/rpc/platform_north_star*`, (route) => {
    asked.push({ body: route.request().postDataJSON() ?? {} });
    return route.fulfill(answer);
  });
  return asked;
}

test("a platform admin reads the north star from Household requests", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  const asked = await answerNorthStar(context, { status: 200, json: report });

  await page.goto("/dashboard/approvals");
  await page.getByRole("link", { name: "North star numbers" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/dashboard\/north-star$/);
  await expect(page.getByRole("heading", { name: "North star", exact: true })).toBeVisible();
  expect(asked[0].body).toEqual({ p_weeks: 8 });

  await expect(page.getByText("Numbers only, from every household, as of 10 Nov. No names.")).toBeVisible();
  // S1: two of three households had a staff member finish on day one.
  await expect(page.getByTestId("signal-s1")).toHaveText("67%");
  await expect(page.getByText("Median to the first staff finish: 2 h 15 min")).toBeVisible();
  await expect(page.getByText("Owner's setup time: counted once the new setup ships")).toBeVisible();
  await expect(page.getByText("Median wait for approval: 1 d")).toBeVisible();
  // S2 waits for the setup screens; the "before" is already there.
  await expect(page.getByTestId("signal-s2")).toHaveText("–");
  await expect(page.getByText("Before: 64 things added by hand in the first 14 days (median of 1 household)")).toBeVisible();
  // S3 is under its 90% target.
  await expect(page.getByTestId("signal-s3")).toHaveText("85%");
  await expect(page.getByText("Last 7 days: 170 of 200")).toBeVisible();
  await expect(page.getByText("Below target")).toHaveCount(1);
  await expect(page.getByTestId("signal-s4")).toHaveText("100%");
  await expect(page.getByText("1 of 1 household at least 4 weeks old")).toBeVisible();
  await expect(page.getByTestId("signal-s5")).toHaveText("–");
  await expect(page.getByText("No data yet")).toHaveCount(2);

  const weeks = page.getByTestId("north-star-week");
  await expect(weeks).toHaveCount(2);
  await expect(weeks.first().getByRole("heading", { name: "Week of 9 Nov" })).toBeVisible();
  await expect(weeks.first().getByText("27 / 30 · 90%")).toBeVisible();
  await expect(weeks.nth(1).getByText("3 h 45 min")).toBeVisible();

  // Phone width, no sideways scrolling.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole("link", { name: "Household requests" }).click();
  await expect(page).toHaveURL(/\/dashboard\/approvals$/);
});

test("an Indonesian-speaking platform admin reads it in Indonesian", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" } });
  await answerNorthStar(context, { status: 200, json: report });

  await page.goto("/dashboard/north-star");
  await expect(page.getByRole("heading", { name: "Ukuran utama" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Staf menyelesaikan tugas pertama di hari yang sama")).toBeVisible();
  await expect(page.getByText("7 hari terakhir: 170 dari 200")).toBeVisible();
  await expect(page.getByText("Di bawah target")).toHaveCount(1);
  await expect(page.getByText("Belum ada data")).toHaveCount(2);
  await expect(page.getByText("Median sampai tugas staf pertama selesai: 2 j 15 mnt")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Per minggu pendaftaran" })).toBeVisible();
});

test("anyone who isn't a platform admin sees nothing", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  await answerNorthStar(context, {
    status: 403,
    json: { code: "42501", message: "platform_admins_only", details: null, hint: null },
  });

  await page.goto("/dashboard/north-star");
  await expect(page.getByText("Not available.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("signal-s1")).toHaveCount(0);
  await expect(page.getByTestId("north-star-week")).toHaveCount(0);
});

test("a failed load offers to try again", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  let fail = true;
  await context.route(`${STUB_URL}/rest/v1/rpc/platform_north_star*`, (route) =>
    fail
      ? route.fulfill({ status: 500, json: { code: "XX000", message: "boom", details: null, hint: null } })
      : route.fulfill({ status: 200, json: report })
  );

  await page.goto("/dashboard/north-star");
  await expect(page.getByText("Couldn't load the numbers.")).toBeVisible({ timeout: 20_000 });
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByTestId("signal-s3")).toHaveText("85%");
});
