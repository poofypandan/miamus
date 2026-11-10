import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Audit batch B1 (docs/product-audit-2026-11-09.md): the owner's first-run
// checklist on Today (item 3), and a calmer staff Today (item 5).
// Mockup: docs/mockups/b1-first-run-calmer-staff.html.

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const SARI = {
  id: STAFF_ID,
  household_id: HOUSEHOLD_ID,
  name: "Sari",
  has_pin: false,
  user_id: null,
  archived_at: null,
  created_at: "2026-11-10T00:00:00Z",
};

const checklist = (page: Page, name = "Set up your home") => page.getByRole("region", { name });
const step = (page: Page, id: string) => page.locator(`li[data-step="${id}"]`);

test("a new household sees the checklist, and its steps tick off from real data to the first finished task", async ({
  context,
  page,
}) => {
  const staff: Record<string, unknown>[] = [];
  const linkedPhones: Record<string, unknown>[] = [];
  const chores: Record<string, unknown>[] = [];
  const stub = await installStub(context, {
    owner: { locale: "en" },
    firstRun: true,
    household: { hasPets: false, pets: false },
    staff,
    linkedPhones,
    chores,
  });
  await page.goto("/dashboard");

  // Brand new: only the name is done, and the next step is open with its button.
  const card = checklist(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("1 of 5");
  await expect(step(page, "home")).toHaveAttribute("data-done", "true");
  await expect(step(page, "home")).toContainText("Rumah Uji");
  await expect(card).toContainText("Add each person by name.");
  // The welcome's own Add buttons step aside while the checklist shows.
  await expect(page.getByText("Nothing on this day yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Chore" })).toHaveCount(0);

  // Add a person goes to Household, Staff.
  await card.getByRole("link", { name: "Add a person" }).click();
  await expect(page).toHaveURL(/module=access&page=staff/);
  await expect(page.getByRole("button", { name: "Add Person" })).toBeVisible();

  // Sari is on the roster and her phone opened the link.
  staff.push(SARI);
  linkedPhones.push({ id: "device-1", linked_at: "2026-11-10T01:00:00Z", last_seen_at: "2026-11-10T01:00:00Z" });
  await page.goto("/dashboard");
  await expect(card).toContainText("3 of 5", { timeout: 20_000 });
  await expect(step(page, "staff")).toContainText("Sari");
  await expect(step(page, "phone")).toContainText("1 phone");

  // Add a task opens the chore form with Sari already chosen.
  await card.getByRole("button", { name: "Add a task" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox").filter({ hasText: "Sari" })).toBeVisible();
  await dialog.getByRole("textbox").first().fill("Sweep the terrace");
  await dialog.getByRole("button", { name: "Add Chore" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Sweep the terrace", assigned_to: STAFF_ID, due_date: today() });
  await expect(card).toContainText("4 of 5");
  await expect(card).toContainText("This ticks itself when the task is finished");

  // Sari finishes it on her phone: the note, once.
  Object.assign(stub.tasks[0], { status: "completed", completed_by: STAFF_ID, completed_at: new Date().toISOString() });
  await page.reload();
  const note = page.getByRole("region", { name: "Your home is set up" });
  await expect(note).toBeVisible({ timeout: 20_000 });
  await expect(card).toHaveCount(0);
  await note.getByRole("button", { name: "Done" }).click();
  await expect(note).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Sweep the terrace")).toBeVisible({ timeout: 20_000 });
  await expect(note).toHaveCount(0);
  await expect(card).toHaveCount(0);
  expect(stub.seen.realBackend).toEqual([]);
});

test("Bahasa Indonesia: Nanti saja hides the checklist for good, and the welcome comes back", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "id" },
    firstRun: true,
    household: { hasPets: false, pets: false },
    staff: [],
    chores: [],
  });
  await page.goto("/dashboard");

  const card = checklist(page, "Siapkan rumah Anda");
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("1 dari 5");
  await expect(card).toContainText("Tambah staf");
  await expect(card.getByRole("link", { name: "Tambah Orang" })).toBeVisible();

  await card.getByRole("button", { name: "Nanti saja" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("Disembunyikan. Staf dan undangan ada di tab Rumah.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tambah Tugas" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Tambah Tugas" })).toBeVisible({ timeout: 20_000 });
  await expect(card).toHaveCount(0);
});

test("a household already past setup never sees it", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    firstRun: true,
    chores: [],
    logs: [
      {
        id: "00000000-0000-4000-8000-000000000b01",
        household_id: HOUSEHOLD_ID,
        entity_id: null,
        schedule_id: null,
        sub_type: "complete",
        completed_at: "2026-11-01T01:00:00Z",
        staff_id: STAFF_ID,
        photo_url: null,
        notes: null,
      },
    ],
  });
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 20_000 });
  await expect(checklist(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your home is set up" })).toHaveCount(0);
});

test("staff Today shows one tip at a time, and readable notes", async ({ context, page }) => {
  const chores = [
    {
      id: "00000000-0000-4000-8000-0000000b1001",
      household_id: HOUSEHOLD_ID,
      title: "Pel lantai",
      notes: "Pakai pembersih yang biru, jangan yang hijau.\nKeringkan pakai lap kering.",
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
    },
  ];
  await installStub(context, { stored: freshSession(), staffPhone: true, chores });
  await page.goto("/staff");

  // One tip, the newest: not a stack of five.
  const tips = page.getByRole("region", { name: /^Baru:/ });
  await expect(page.getByRole("region", { name: "Baru: Kirim masukan" })).toBeVisible({ timeout: 20_000 });
  await expect(tips).toHaveCount(1);

  // The note, whole, under its label.
  const card = page.getByRole("button", { name: /Pel lantai/ });
  await expect(card.getByText("Catatan")).toBeVisible();
  await expect(card).toContainText("Keringkan pakai lap kering.");

  // Closed: no other tip takes its place today.
  await tips.getByRole("button", { name: "Tutup" }).click();
  await expect(tips).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Pel lantai")).toBeVisible({ timeout: 20_000 });
  await expect(tips).toHaveCount(0);

  // The next day, the next newest.
  await page.evaluate(() => localStorage.setItem("miamus.staff-tip.closed-on", "2000-01-01"));
  await page.reload();
  await expect(page.getByRole("region", { name: "Baru: aman saat sinyal lemah" })).toBeVisible({ timeout: 20_000 });
  await expect(tips).toHaveCount(1);
});
