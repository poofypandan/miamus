import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID, MOCHI, SCHEDULES } from "../fixtures/household";
import { OWNER_PROFILE_ID, STAFF_ID, freshSession, installStub } from "./stub-backend";

// "Tidak bisa dikerjakan" and the evening summary (Phase 165,
// migrations/139): staff say why a task couldn't be done and can take it
// back for 5 minutes; owners see it in amber with what was said, get an
// evening summary sheet, and set their two notification switches.

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const today = () => ymd(new Date());

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000165${String(++n).padStart(2, "0")}`,
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

const exception = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000001650${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  chore_id: null,
  schedule_id: null,
  entity_id: null,
  occurs_on: today(),
  slot_time: null,
  reason: "out_of_stock",
  note: null,
  photo_url: null,
  inventory_item_id: null,
  staff_id: STAFF_ID,
  created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  ...over,
});

test("staff say a chore couldn't be done, take it back with Batalkan, and say it again", async ({ context, page }) => {
  const laundry = chore({ title: "Cuci baju" });
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, chores: [laundry], couldntTip: true });
  await page.goto("/staff");
  // Its one-time tip, on top.
  await expect(page.getByRole("region", { name: "Baru: Tidak bisa dikerjakan" })).toBeVisible({ timeout: 20_000 });

  await page.getByText("Cuci baju").first().click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: "Tidak bisa dikerjakan" }).click();

  // The reasons, in Indonesian; a chore has no "pet refused".
  const reasons = page.getByRole("dialog", { name: "Kenapa tidak bisa?" });
  await expect(reasons).toBeVisible();
  await expect(reasons.getByRole("button", { name: /Barang habis/ })).toBeVisible();
  await expect(reasons.getByRole("button", { name: /Sudah dikerjakan orang lain/ })).toBeVisible();
  await expect(reasons.getByRole("button", { name: /Hewan tidak mau/ })).toHaveCount(0);

  // Out of stock: something not on the list, onto the list, with a note.
  await reasons.getByRole("button", { name: /Barang habis/ }).click();
  const details = page.getByRole("dialog", { name: "Barang habis" });
  await details.getByRole("button", { name: "Barang lain" }).click();
  await details.getByLabel("Nama barang").fill("Deterjen");
  await expect(details.getByLabel("Masukkan ke daftar belanja")).toBeChecked();
  await details.getByLabel(/Catatan/).fill("Tinggal sedikit");
  await details.getByRole("button", { name: "Kirim" }).click();

  await expect(page.getByText("Terkirim. Admin bisa melihatnya.")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => stub.exceptions.length).toBe(1);
  expect(stub.exceptions[0]).toMatchObject({
    chore_id: laundry.id,
    occurs_on: today(),
    reason: "out_of_stock",
    note: "Deterjen — Tinggal sedikit",
    staff_id: STAFF_ID,
  });
  // On the shopping list as a note.
  await expect.poll(() => stub.writes.some(([method, table]) => method === "POST" && table === "inventory_alerts")).toBe(true);
  // The card turns amber with the reason and the time.
  await expect(page.getByTestId("couldnt-line")).toContainText(/Tidak bisa · Barang habis · \d{2}\.\d{2}/);

  // Batalkan takes it back.
  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect(page.getByText("Dibatalkan.")).toBeVisible();
  expect(stub.exceptions).toHaveLength(0);
  await expect(page.getByTestId("couldnt-line")).toHaveCount(0);

  // Said again, another way; the sheet then shows it, and the task can still be finished.
  await page.getByText("Cuci baju").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Tidak bisa dikerjakan" }).click();
  await page.getByRole("dialog", { name: "Kenapa tidak bisa?" }).getByRole("button", { name: /Sudah dikerjakan orang lain/ }).click();
  await page.getByRole("dialog", { name: "Sudah dikerjakan orang lain" }).getByRole("button", { name: "Kirim" }).click();
  await expect.poll(() => stub.exceptions.length).toBe(1);
  expect(stub.exceptions[0]).toMatchObject({ reason: "done_by_other", note: null });
  await page.getByText("Cuci baju").first().click();
  const again = page.getByRole("dialog");
  await expect(again.getByTestId("couldnt-do-note")).toContainText("Tidak bisa dikerjakan: sudah dikerjakan orang lain");
  await expect(again.getByText("Ternyata sudah bisa? Selesaikan seperti biasa.")).toBeVisible();
  await expect(again.getByRole("button", { name: "Tidak bisa dikerjakan" })).toHaveCount(0);
});

test("staff say a pet wouldn't take its medicine", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");

  await page.getByRole("button", { name: /Obat Uji/ }).first().click({ timeout: 20_000 });
  await page.getByRole("dialog").getByRole("button", { name: "Tidak bisa dikerjakan" }).click();
  const reasons = page.getByRole("dialog", { name: "Kenapa tidak bisa?" });
  await expect(reasons.getByText("Admin langsung diberi tahu.")).toBeVisible();
  await reasons.getByRole("button", { name: /Hewan tidak mau minum obat/ }).click();
  // One pet on the card: already picked.
  await page.getByRole("dialog", { name: "Hewan tidak mau minum obat" }).getByRole("button", { name: "Kirim" }).click();

  await expect.poll(() => stub.exceptions.length).toBe(1);
  const medicine = SCHEDULES.find((s) => s.title === "Medication: Obat Uji")!;
  expect(stub.exceptions[0]).toMatchObject({
    schedule_id: medicine.id,
    entity_id: MOCHI.id,
    slot_time: "08:00",
    reason: "pet_refused",
    chore_id: null,
  });
  await expect(page.getByTestId("couldnt-line").first()).toContainText("Hewan tidak mau minum obat");
});

test("owners see a couldn't-do chore in amber, open what was said, and reach the editor", async ({ context, page }) => {
  const laundry = chore({ title: "Laundry", due_time: "09:00" });
  const bill = chore({ title: "Pay the water bill", assigned_to: OWNER_PROFILE_ID });
  await installStub(context, {
    owner: { locale: "en" },
    chores: [laundry, bill],
    exceptions: [
      exception({ chore_id: laundry.id, note: "Only a little left" }),
      exception({ chore_id: bill.id, reason: "other", note: "Office closed today" }),
    ],
  });
  await page.goto("/dashboard");

  // My tasks counts it.
  const card = page.getByRole("region", { name: "My tasks" });
  await expect(card).toContainText("0 of 1 done · 1 couldn't", { timeout: 20_000 });
  await expect(card.getByTestId("couldnt-line")).toContainText("Couldn't: other · Ari");

  // The day's row: amber, with the reason.
  const row = page.getByRole("button", { name: /Laundry/ }).first();
  await expect(row.getByTestId("couldnt-line")).toContainText(/Couldn't: out of stock · Ari · \d{1,2}:\d{2}/);
  await row.click();
  const sheet = page.getByRole("dialog", { name: "Laundry" });
  await expect(sheet.getByTestId("couldnt-do-note")).toContainText("Couldn't be done: out of stock");
  await expect(sheet.getByTestId("couldnt-do-note")).toContainText("“Only a little left”");
  await sheet.getByRole("button", { name: "Edit chore" }).click();
  await expect(page.getByRole("dialog").getByRole("textbox").first()).toHaveValue("Laundry");
});

test("the evening summary sheet, from its link, in Bahasa Indonesia", async ({ context, page }) => {
  const laundry = chore({ title: "Cuci baju", due_time: "09:00" });
  const mop = chore({ title: "Pel teras" });
  const leave = {
    id: "00000000-0000-4000-8000-000000016591",
    household_id: HOUSEHOLD_ID,
    staff_id: STAFF_ID,
    start_date: "2099-01-05",
    end_date: "2099-01-06",
    status: "pending",
    fallback_action: null,
    fallback_assignee_id: null,
    ended_on: null,
    created_at: "2026-11-01T00:00:00Z",
  };
  await installStub(context, {
    owner: { locale: "id" },
    chores: [laundry, mop],
    leaves: [leave],
    exceptions: [exception({ chore_id: laundry.id })],
  });
  await page.goto(`/dashboard?module=agenda&summary=${today()}`);

  const sheet = page.getByRole("dialog", { name: "Belum selesai hari ini" });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  const summary = sheet.getByTestId("evening-summary");
  await expect(summary.getByText("Tidak bisa dikerjakan")).toBeVisible();
  await expect(summary.getByRole("button", { name: /Cuci baju/ })).toContainText("Barang habis · Ari");
  await expect(summary.getByText("Belum dikerjakan")).toBeVisible();
  await expect(summary.getByRole("button", { name: /Pel teras/ })).toBeVisible();
  await expect(summary.getByText("Menunggu Anda")).toBeVisible();
  await expect(summary.getByRole("link", { name: /Cuti Ari/ })).toBeVisible();

  // A couldn't-do row opens what was said.
  await summary.getByRole("button", { name: /Cuci baju/ }).click();
  await expect(page.getByRole("dialog", { name: "Cuci baju" }).getByTestId("couldnt-do-note")).toContainText(
    "Tidak bisa dikerjakan: barang habis"
  );
  // Closed, the link leaves the address bar.
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/summary=/);
});

test("the quiet line on Today after the summary hour opens the sheet", async ({ context, page }) => {
  const mop = chore({ title: "Mop the terrace" });
  await installStub(context, { owner: { locale: "en" }, chores: [mop], notificationPrefs: { evening_summary_hour: 18, staff_request_pushes: true } });
  await page.clock.setFixedTime(new Date(`${today()}T20:30:00`));
  await page.goto("/dashboard");

  // The chore and the fixture's pet routines due by 20.30.
  await page.getByRole("button", { name: /^\d+ not done today$/ }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/summary=/);
  await expect(page.getByRole("dialog", { name: "Not done today" }).getByRole("button", { name: /Mop the terrace/ })).toBeVisible();
});

test("owners set the evening summary and staff requests in Household → Notifications", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=access&page=notifications");

  const summary = page.getByRole("switch", { name: "Evening summary" });
  await expect(summary).toBeChecked({ timeout: 20_000 });
  await page.getByLabel("Evening summary time").selectOption("20");
  await expect.poll(() => stub.notificationPrefs.evening_summary_hour).toBe(20);

  await page.getByRole("switch", { name: "Staff requests" }).click();
  await expect.poll(() => stub.notificationPrefs.staff_request_pushes).toBe(false);

  await summary.click();
  await expect.poll(() => stub.notificationPrefs.evening_summary_hour).toBe(null);
  await expect(page.getByLabel("Evening summary time")).toHaveCount(0);
});
