import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER_PROFILE_ID, STAFF_ID, freshSession, installStub } from "./stub-backend";

// Bill payments (Phase 164 PR B, migrations/138): an owner marks a bill paid
// with an amount and a receipt, sees "Paid · Rp…", changes it, undoes it
// (the payment goes too), sees the history in the bill's form; a staff phone
// never asks for payments and never sees one.

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
  id: `00000000-0000-4000-8000-0000001382${String(++n).padStart(2, "0")}`,
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

async function receiptImage() {
  return sharp({ create: { width: 400, height: 600, channels: 3, background: { r: 240, g: 240, b: 235 } } })
    .jpeg()
    .toBuffer();
}

test("an owner marks a bill paid with an amount and a receipt, changes it, and undoes it", async ({ context, page }) => {
  const pln = chore({ title: "Electricity (PLN)" });
  // Last month's day of the same bill, paid Rp412.000.
  const lastMonth = chore({ title: "Electricity (PLN)", due_date: ymd(dateIn(-30)), status: "completed", parent_task_id: pln.id });
  const stub = await installStub(context, {
    owner: { locale: "en" },
    chores: [pln],
    billPayments: [
      {
        id: "00000000-0000-4000-8000-000000000401",
        household_id: HOUSEHOLD_ID,
        task_id: lastMonth.id,
        series_id: pln.id,
        amount_idr: 412000,
        receipt_url: null,
        paid_at: dateIn(-30).toISOString(),
        created_by: null,
        updated_at: dateIn(-30).toISOString(),
      },
    ],
  });
  // The photo compressor's worker comes from a CDN; refused here, it falls
  // back to compressing on the page, as on a weak signal.
  await context.route(/cdn\.jsdelivr\.net/, (route) => route.abort("blockedbyclient"));
  await page.goto("/dashboard");

  const card = page.getByRole("region", { name: "My tasks" });
  await expect(card).toContainText("Last time Rp412.000", { timeout: 20_000 });
  await expect(page.getByRole("region", { name: "New: mark a bill paid" })).toBeVisible();

  // Open it: amount and receipt, both optional, owners only.
  await card.getByRole("button", { name: /^Anytime Electricity \(PLN\)/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Only owners see amounts and receipts.")).toBeVisible();
  await expect(sheet.getByLabel("Amount (optional)")).toHaveAttribute("placeholder", "Last time Rp412.000");
  await sheet.getByLabel("Amount (optional)").fill("418.500");
  await expect(sheet.getByText("Rp418.500")).toBeVisible();
  await sheet.locator('input[type="file"]').setInputFiles({ name: "struk.jpg", mimeType: "image/jpeg", buffer: await receiptImage() });
  await expect(sheet.getByRole("button", { name: "Remove photo" })).toBeVisible({ timeout: 15_000 });
  await sheet.getByRole("button", { name: "Mark paid" }).click();

  await expect(page.getByText("Paid: Electricity (PLN)")).toBeVisible();
  // Its only task done, the card folds to one line; open it again.
  await page.getByRole("button", { name: "Your task is done" }).click();
  await expect(card).toContainText("Paid · Rp418.500");
  // The bill (a one-off, so its own row) is done, with no chore photos, and
  // its payment saved.
  const day = pln;
  expect(day).toMatchObject({ status: "completed", completed_by: OWNER_PROFILE_ID, before_photo_url: null });
  const saved = stub.billPayments.find((p) => p.task_id === day?.id);
  expect(saved).toMatchObject({ amount_idr: 418500, household_id: HOUSEHOLD_ID });
  expect(String(saved?.receipt_url)).toContain(`/owner-receipts/${HOUSEHOLD_ID}/bills/${pln.id}/`);
  expect(stub.uploads.some((u) => u.startsWith(`owner-receipts/${HOUSEHOLD_ID}/bills/${pln.id}/`))).toBe(true);

  // Change the amount afterwards from the paid row.
  await card.getByRole("button", { name: /Electricity \(PLN\)/ }).last().click();
  const payment = sheet.getByRole("region", { name: "Payment" });
  await expect(payment.getByText("Rp418.500")).toBeVisible();
  await payment.getByRole("button", { name: "Change" }).click();
  await sheet.getByLabel("Amount (optional)").fill("420000");
  await payment.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(stub.billPayments.find((p) => p.task_id === day?.id)).toMatchObject({ amount_idr: 420000 });

  // Mark not done: the payment and its receipt go too.
  await sheet.getByRole("button", { name: "Mark not done" }).click();
  await expect.poll(() => stub.billPayments.some((p) => p.task_id === day?.id)).toBe(false);
  await expect.poll(() => stub.removed.some((r) => r.includes(`/bills/${pln.id}/`))).toBe(true);
  await expect(card).toContainText("Last time Rp412.000");
  expect(stub.seen.realBackend).toEqual([]);
});

test("Bahasa Indonesia: the bill's form shows its payment history, owners only", async ({ context, page }) => {
  const pdam = chore({ title: "Air PDAM", recurrence: "monthly", due_date: ymd(dateIn(-60)) });
  const sep = chore({ title: "Air PDAM", due_date: ymd(dateIn(-60)), status: "completed", parent_task_id: pdam.id });
  const oct = chore({ title: "Air PDAM", due_date: ymd(dateIn(-30)), status: "completed", parent_task_id: pdam.id });
  const pay = (task: { id: string }, amount: number, days: number) => ({
    id: `00000000-0000-4000-8000-0000000004${String(10 + days).padStart(2, "0")}`,
    household_id: HOUSEHOLD_ID,
    task_id: task.id,
    series_id: pdam.id,
    amount_idr: amount,
    receipt_url: null,
    paid_at: dateIn(-days).toISOString(),
    created_by: null,
    updated_at: dateIn(-days).toISOString(),
  });
  await installStub(context, {
    owner: { locale: "id" },
    chores: [pdam],
    billPayments: [pay(sep, 175000, 60), pay(oct, 186000, 30)],
  });
  await page.goto("/dashboard?module=chores");
  await page.getByText("Air PDAM").first().click();
  const form = page.getByRole("dialog");
  const history = form.getByRole("region", { name: "Riwayat bayar" });
  await expect(history).toBeVisible({ timeout: 20_000 });
  await expect(history.getByText("Rp186.000")).toBeVisible();
  await expect(history.getByText("Rp175.000")).toBeVisible();
  // Newest first.
  await expect(history.getByRole("listitem").first()).toContainText("Rp186.000");

  await form.getByRole("button", { name: "Hapus…" }).click();
  await expect(
    form.getByText("Menghapus tagihan ini juga menghapus riwayat bayarnya. Hentikan pengulangan untuk menyimpannya.")
  ).toBeVisible();
});

test("a staff phone never asks for payments and never sees one", async ({ context, page }) => {
  const iuran = chore({ title: "Iuran RT/RW", assigned_to: STAFF_ID });
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    chores: [iuran],
    billPayments: [
      {
        id: "00000000-0000-4000-8000-000000000499",
        household_id: HOUSEHOLD_ID,
        task_id: iuran.id,
        series_id: iuran.id,
        amount_idr: 50000,
        receipt_url: null,
        paid_at: new Date().toISOString(),
        created_by: null,
        updated_at: new Date().toISOString(),
      },
    ],
  });
  await page.goto("/staff");
  await expect(page.getByText("Iuran RT/RW")).toBeVisible({ timeout: 20_000 });
  await page.getByText("Iuran RT/RW").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/50\.000/)).toHaveCount(0);
  expect(stub.billPaymentReads).toEqual([]);
});

test("Undo right after Mark paid removes the payment too (Codex, PR #65)", async ({ context, page }) => {
  const water = chore({ title: "Water (PDAM)" });
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [water] });
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "My tasks" });
  await card.getByRole("button", { name: /^Anytime Water \(PDAM\)/ }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Amount (optional)").fill("186000");
  await sheet.getByRole("button", { name: "Mark paid" }).click();
  // The payment is saved before Undo is offered.
  await expect(page.getByText("Paid: Water (PDAM)")).toBeVisible();
  expect(stub.billPayments.find((p) => p.task_id === water.id)).toMatchObject({ amount_idr: 186000 });
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(() => water.status).toBe("pending");
  await expect.poll(() => stub.billPayments.some((p) => p.task_id === water.id)).toBe(false);
});

test("a bill covered for someone on leave on its first day still asks for both photos (Codex, PR #65)", async ({
  context,
  page,
}) => {
  const today = ymd(dateIn(0));
  const iuran = chore({ title: "Iuran RT/RW", assigned_to: STAFF_ID, recurrence: "monthly" });
  const leave = {
    id: "00000000-0000-4000-8000-000000013890",
    household_id: HOUSEHOLD_ID,
    staff_id: STAFF_ID,
    start_date: today,
    end_date: today,
    status: "approved",
    fallback_action: "reassign",
    fallback_assignee_id: OWNER_PROFILE_ID,
    ended_on: null,
    created_at: "2026-11-01T00:00:00Z",
  };
  await installStub(context, { owner: { locale: "en" }, chores: [iuran], leaves: [leave] });
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "My tasks" });
  await card.getByRole("button", { name: "Mark paid: Iuran RT/RW" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("You're covering this for someone on leave, so it needs both photos.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Take photo" })).toHaveCount(2);
  await expect(sheet.getByLabel("Amount (optional)")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Mark paid" })).toBeDisabled();
});

test("if removing the payment fails, the bill stays paid with its payment (Codex, PR #65)", async ({ context, page }) => {
  const pbb = chore({ title: "PBB", status: "completed", completed_by: OWNER_PROFILE_ID, completed_at: new Date().toISOString() });
  const stub = await installStub(context, {
    owner: { locale: "en" },
    chores: [pbb],
    billPayments: [
      {
        id: "00000000-0000-4000-8000-000000000477",
        household_id: HOUSEHOLD_ID,
        task_id: pbb.id,
        series_id: pbb.id,
        amount_idr: 1200000,
        receipt_url: null,
        paid_at: new Date().toISOString(),
        created_by: null,
        updated_at: new Date().toISOString(),
      },
    ],
  });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Your task is done" }).click({ timeout: 20_000 });
  const card = page.getByRole("region", { name: "My tasks" });
  await expect(card).toContainText("Paid · Rp1.200.000");
  await card.getByRole("button", { name: /PBB/ }).last().click();
  const sheet = page.getByRole("dialog");

  stub.trouble.bill_payments = { drop: 1 };
  await sheet.getByRole("button", { name: "Mark not done" }).click();
  await expect(page.getByText("No connection. Try again in a moment.")).toBeVisible();
  // Nothing half-done: still paid, payment kept.
  expect(pbb).toMatchObject({ status: "completed" });
  expect(stub.billPayments).toHaveLength(1);

  // Tried again with a signal: both go.
  await sheet.getByRole("button", { name: "Mark not done" }).click();
  await expect.poll(() => pbb.status).toBe("pending");
  await expect.poll(() => stub.billPayments.length).toBe(0);
});
