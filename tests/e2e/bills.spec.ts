import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER_PROFILE_ID, STAFF_ID, installStub } from "./stub-backend";

// Bills and upkeep (Phase 164, PR A; migrations/137): the checklist on
// Chores → Today makes owner bills with a reminder, upkeep for anyone in
// Indonesian, and supplies for gas; Today's Coming up line shows a reminder
// inside its window; the chore form offers the longer repeats and Remind me.

function dateIn(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000164${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  notes: null,
  category: "bill",
  assigned_to: OWNER_PROFILE_ID,
  due_date: ymd(dateIn(0)),
  due_time: null,
  status: "pending",
  completed_by: null,
  completed_at: null,
  photo_url: null,
  created_at: "2026-11-01T00:00:00Z",
  recurrence: "none",
  recurrence_until: null,
  recurrence_interval: 1,
  remind_days_before: null,
  parent_task_id: null,
  requires_supervision: false,
  before_photo_url: null,
  after_photo_url: null,
  location_id: null,
  spot: null,
  ...over,
});

test("the checklist adds bills for me, upkeep for anyone in Indonesian, and gas to supplies", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [] });
  await page.goto("/dashboard?module=chores");

  await page.getByRole("button", { name: "Bills and upkeep" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Bills and upkeep" })).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByText("Monthly · 20th").first()).toBeVisible();

  await sheet.getByRole("checkbox", { name: "Electricity (PLN)" }).click();
  await sheet.getByRole("checkbox", { name: "Water (PDAM)" }).click();
  await sheet.getByRole("checkbox", { name: "AC service" }).click();
  await sheet.getByRole("checkbox", { name: "Gas (LPG)" }).click();

  // Vehicle tax needs its date: ticking it opens it, and Add waits.
  await sheet.getByRole("checkbox", { name: "Vehicle tax (STNK)" }).click();
  await expect(sheet.getByText("Pick the date for Vehicle tax (STNK).")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Add 5" })).toBeDisabled();
  await sheet.getByRole("checkbox", { name: "Vehicle tax (STNK)" }).click();

  // PBB, opened: the region's deadline hint and its reminder.
  await sheet.getByRole("button", { name: /^PBB \(land and building tax\)/ }).click();
  await expect(sheet.getByText("Deadlines differ by region: check your SPPT.")).toBeVisible();

  await sheet.getByRole("button", { name: "Add 4" }).click();
  await expect(page.getByText("Added 4")).toBeVisible();

  const byTitle = (title: string) => stub.tasks.find((t) => t.title === title);
  expect(byTitle("Electricity (PLN)")).toMatchObject({
    category: "bill",
    assigned_to: OWNER_PROFILE_ID,
    recurrence: "monthly",
    recurrence_interval: 1,
    remind_days_before: 3,
  });
  expect(String(byTitle("Electricity (PLN)")?.due_date)).toMatch(/-20$/);
  expect(byTitle("Water (PDAM)")).toMatchObject({ category: "bill", remind_days_before: 3 });
  // Anyone may do it, so it's saved in Indonesian for staff to read.
  expect(byTitle("Servis AC")).toMatchObject({
    category: "maintenance",
    assigned_to: null,
    recurrence: "monthly",
    recurrence_interval: 3,
    remind_days_before: 1,
  });
  expect(stub.tasks).toHaveLength(3);
  expect(stub.supplies).toEqual([
    expect.objectContaining({ scope: "home", name: "Gas LPG", category: "household_supplies" }),
  ]);

  // Opened again: what was added says so.
  await page.getByRole("button", { name: "Bills and upkeep" }).click();
  await expect(sheet.getByRole("checkbox", { name: "Electricity (PLN)" })).toHaveCount(0);
  await expect(sheet.getByText("In Supplies at home")).toBeVisible();
  await expect(sheet.getByRole("checkbox", { name: "Internet" })).toBeVisible();
  expect(stub.seen.realBackend).toEqual([]);
});

test("Bahasa Indonesia: Coming up on Today, the tutorial, and a yearly bill's form", async ({ context, page }) => {
  const pbb = chore({ title: "PBB", due_date: ymd(dateIn(2)), remind_days_before: 3 });
  const stnk = chore({
    title: "Pajak kendaraan (STNK)",
    recurrence: "monthly",
    recurrence_interval: 12,
    due_date: ymd(dateIn(30)),
    remind_days_before: 7,
  });
  // One What's new card a week (Phase 172): this test is about this one.
  const stub = await installStub(context, { owner: { locale: "id" }, chores: [pbb, stnk], whatsNewWeek: "bills-2026-11" });
  await page.goto("/dashboard");

  // Two days out, inside its 3-day window; the yearly one isn't yet.
  const line = page.getByRole("button", { name: /^Segera: PBB · / });
  await expect(line).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /^Segera:.*STNK/ })).toHaveCount(0);
  await line.click();
  await expect(page.getByText("PBB").first()).toBeVisible();

  // The tutorial; Lihat opens the checklist on Tugas.
  const card = page.getByRole("region", { name: "Baru: tagihan dan perawatan" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Lihat" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Tagihan dan perawatan" })).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByText("Setiap bulan · tgl 20").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // The yearly bill in the chore form: Setiap tahun, reminded a week before.
  await page.goto("/dashboard?module=chores");
  await page.getByRole("button", { name: "Tambah Tugas" }).first().click();
  const form = page.getByRole("dialog");
  await expect(form.getByRole("button", { name: "Setiap 3 bulan" })).toBeVisible({ timeout: 20_000 });
  await expect(form.getByRole("button", { name: "Setiap tahun" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Mati" })).toHaveAttribute("aria-pressed", "true");

  // A new chore every 6 months, reminded the day before.
  await form.getByPlaceholder("mis. Pel teras").fill("Kuras toren");
  await form.getByRole("button", { name: "Setiap 6 bulan" }).click();
  await form.getByRole("button", { name: "1 hari sebelumnya" }).click();
  await expect(form.getByText(/Notifikasi pukul 07\.00/)).toBeVisible();
  await form.getByRole("button", { name: "Tambah Tugas" }).click();
  await expect(page.getByText('"Kuras toren" ditambahkan')).toBeVisible();
  expect(stub.tasks.find((t) => t.title === "Kuras toren")).toMatchObject({
    recurrence: "monthly",
    recurrence_interval: 6,
    remind_days_before: 1,
  });
  expect(stub.seen.realBackend).toEqual([]);
});

test("electricity on token: its own date and reminder are the ones saved (Codex, PR #60)", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [] });
  await page.goto("/dashboard?module=chores");
  await page.getByRole("button", { name: "Bills and upkeep" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("checkbox", { name: "Electricity (PLN)" }).click();
  await sheet.getByRole("button", { name: /^Electricity \(PLN\)/ }).click();
  await sheet.getByRole("button", { name: "Token" }).click();
  await expect(sheet.getByText("A monthly nudge to check the meter")).toBeVisible();

  await sheet.locator('input[type="date"]').fill(ymd(dateIn(5)));
  await sheet.getByRole("combobox").last().click();
  await page.getByRole("option", { name: "1 day before" }).click();
  await sheet.getByRole("button", { name: "Add 1" }).click();
  await expect(page.getByText("Added 1")).toBeVisible();

  expect(stub.tasks).toEqual([
    expect.objectContaining({
      title: "Electricity token (PLN)",
      due_date: ymd(dateIn(5)),
      remind_days_before: 1,
      assigned_to: OWNER_PROFILE_ID,
    }),
  ]);
});

test("Coming up leaves out a day ahead that's already done (Codex, PR #60)", async ({ context, page }) => {
  const due = ymd(dateIn(2));
  const internet = chore({ title: "Internet", recurrence: "weekly", due_date: ymd(dateIn(-5)), remind_days_before: 3 });
  const water = chore({ title: "Water (PDAM)", due_date: due, remind_days_before: 3 });
  // Internet's day two days out, paid early.
  const paidEarly = chore({
    title: "Internet",
    parent_task_id: internet.id,
    due_date: due,
    status: "completed",
    completed_by: OWNER_PROFILE_ID,
  });
  await installStub(context, { owner: { locale: "en" }, chores: [internet, water, paidEarly] });
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: /^Coming up: Water \(PDAM\) · / })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /^Coming up:.*Internet/ })).toHaveCount(0);
});

test("a failed supply after saved chores: the retry sends only the rest (Codex, PR #60)", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [] });
  await page.goto("/dashboard?module=chores");
  await page.getByRole("button", { name: "Bills and upkeep" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("checkbox", { name: "Water (PDAM)" }).click();
  await sheet.getByRole("checkbox", { name: "Gas (LPG)" }).click();

  stub.trouble.inventory_items = { drop: 1 };
  await sheet.getByRole("button", { name: "Add 2" }).click();
  await expect(page.getByText("Added 1, but not the rest. Try again.")).toBeVisible();
  await sheet.getByRole("button", { name: "Add 1" }).click();
  await expect(page.getByText("Added 1", { exact: true })).toBeVisible();

  expect(stub.tasks.filter((t) => t.title === "Water (PDAM)")).toHaveLength(1);
  expect(stub.supplies.filter((s) => s.name === "Gas LPG")).toHaveLength(1);
});

test("editing one written day of a repeat changes the repeat's reminder (Codex, PR #60)", async ({ context, page }) => {
  const ac = chore({
    title: "Servis AC",
    category: "maintenance",
    recurrence: "weekly",
    due_date: ymd(dateIn(-7)),
    remind_days_before: 3,
    assigned_to: STAFF_ID,
  });
  const claimed = chore({ title: "Servis AC", category: "maintenance", parent_task_id: ac.id, assigned_to: STAFF_ID });
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [ac, claimed] });
  await page.goto("/dashboard?module=chores");
  await page.getByText("Servis AC").first().click();
  const form = page.getByRole("dialog");
  await expect(form.getByText("(for the whole repeat)")).toBeVisible({ timeout: 20_000 });
  await expect(form.getByRole("button", { name: "3 days before" })).toHaveAttribute("aria-pressed", "true");
  await form.getByRole("button", { name: "Off" }).click();
  await form.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByText('Saved "Servis AC"')).toBeVisible();
  expect(ac.remind_days_before).toBeNull();
  expect(claimed.remind_days_before).toBeNull();
  expect(stub.seen.realBackend).toEqual([]);
});

test("a bill set up for later, outside the week on screen, shows as added (Codex, PR #60)", async ({ context, page }) => {
  const pbb = chore({ title: "PBB", due_date: ymd(dateIn(40)), remind_days_before: 7 });
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [pbb] });
  await page.goto("/dashboard?module=chores");
  await page.getByRole("button", { name: "Bills and upkeep" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("button", { name: /^PBB \(land and building tax\) Added/ })).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByRole("checkbox", { name: "PBB (land and building tax)" })).toHaveCount(0);
  await expect(sheet.getByText("Checking what's already set up…")).toHaveCount(0);
  await sheet.getByRole("checkbox", { name: "Internet" }).click();
  await sheet.getByRole("button", { name: "Add 1" }).click();
  await expect(page.getByText("Added 1")).toBeVisible();
  expect(stub.tasks.map((t) => t.title)).toEqual(["Internet"]);
});
