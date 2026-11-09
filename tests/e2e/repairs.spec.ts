import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Repairs (Phase 159 PR A): an owner reviews a staff report, schedules a
// visit through the chore form and reports a problem; a staff phone reports
// one and sees it waiting. Everything is answered by the stub.

const id = (n: number) => `00000000-0000-4000-8000-0000000008${String(n).padStart(2, "0")}`;
const place = (n: number, name: string, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  household_id: HOUSEHOLD_ID,
  name,
  created_at: "2026-10-01T00:00:00Z",
  kind: "room",
  parent_id: null,
  sort_order: 0,
  ...extra,
});
const LT3 = place(1, "LT3", { kind: "floor" });
const MUSIC = place(2, "Music Room", { parent_id: LT3.id });

const staffReport = (over: Record<string, unknown> = {}) => ({
  id: id(50),
  household_id: HOUSEHOLD_ID,
  location_id: MUSIC.id,
  spot: "Dinding",
  title: "Dinding retak",
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
  ...over,
});

test("an owner reviews a staff report, schedules a visit, and reports a problem", async ({ context, page }) => {
  const repairs = [staffReport()];
  const stub = await installStub(context, { owner: { locale: "en" }, rooms: [LT3, MUSIC], chores: [], repairs });
  await context.addInitScript(() => {
    for (const card of ["rooms-2026-11", "floors-2026-11", "room-picker-2026-11", "repairs-2026-11"]) {
      localStorage.setItem(`miamus.whats-new.${card}`, "seen");
    }
  });

  // Today says there's a report to review, and goes to Repairs.
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "1 repair to review" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/chores=repairs/);
  await expect(page.getByRole("tab", { name: "Repairs" })).toHaveAttribute("aria-selected", "true");

  const review = page.getByRole("region", { name: "To review" });
  await expect(review.getByText("Dinding retak")).toBeVisible();
  await expect(review.getByText("LT3 · Music Room · Dinding")).toBeVisible();
  await review.getByText("Dinding retak").click();

  let sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Reported by Ari", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => repairs[0].status).toBe("open");
  await expect(sheet.getByText("Not scheduled")).toBeVisible();

  // Schedule a visit: the chore form, filled in and linked to the repair.
  await sheet.getByRole("button", { name: "Schedule a visit" }).click();
  const editor = page.getByRole("dialog", { name: "Add Chore" });
  await expect(editor.getByRole("textbox").first()).toHaveValue("Perbaiki: Dinding retak");
  await expect(editor.getByText("LT3 · Music Room")).toBeVisible();
  await expect(editor.getByRole("button", { name: "Dinding" })).toHaveAttribute("aria-pressed", "true");
  await expect(editor.getByRole("button", { name: "More rooms" })).toHaveCount(0);
  await editor.getByRole("button", { name: "Add Chore" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({
    title: "Perbaiki: Dinding retak",
    category: "maintenance",
    location_id: MUSIC.id,
    spot: "Dinding",
    repair_id: id(50),
  });
  sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("region", { name: "Visits" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("region", { name: "Open" }).getByText("Dinding retak")).toBeVisible();

  // Report a problem: an owner's goes straight on the list.
  await page.getByRole("button", { name: "Report a problem" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Room").selectOption({ label: "LT3 · Music Room" });
  await form.getByLabel("What's wrong?").fill("Lampu berkedip");
  await form.getByText("Urgent").click();
  await form.getByRole("button", { name: "Report", exact: true }).click();
  await expect.poll(() => repairs.length).toBe(2);
  expect(repairs[1]).toMatchObject({ title: "Lampu berkedip", status: "open", urgent: true, location_id: MUSIC.id });
  // Urgent first in Open.
  await expect(page.getByRole("region", { name: "Open" }).getByRole("button").first()).toContainText("Lampu berkedip");
});

test("a staff phone reports a problem and sees it waiting for the owners", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, rooms: [LT3, MUSIC], chores: [] });
  await page.goto("/staff");

  // The one-time tip, in Indonesian.
  await expect(page.getByRole("region", { name: "Baru: Lapor kerusakan" })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /^Lapor/ }).click();
  await page.getByRole("button", { name: /Lapor kerusakan/ }).click();
  const form = page.getByRole("dialog");
  await expect(form.getByRole("heading", { name: "Lapor kerusakan" })).toBeVisible();
  await form.getByLabel("Ruangan").selectOption({ label: "LT3 · Music Room" });
  await expect(form.getByText("Bagian (boleh dikosongkan)")).toBeVisible();
  await form.getByLabel("Apa yang rusak?").fill("Lampu mati");
  await form.getByRole("button", { name: "Kirim" }).click();
  await expect.poll(() => stub.repairs.length).toBe(1);
  expect(stub.repairs[0]).toMatchObject({
    title: "Lampu mati",
    status: "reported",
    reported_by_staff: STAFF_ID,
    location_id: MUSIC.id,
  });
  await expect(page.getByText("Terkirim ke pemilik rumah")).toBeVisible();

  // Their report, with where it stands, and a way to take it back.
  await page.getByRole("button", { name: /^Lapor/ }).click();
  const mine = page.getByRole("region", { name: "Laporan kerusakan saya" });
  await expect(mine.getByText("Lampu mati")).toBeVisible();
  await expect(mine.getByText("Menunggu dicek")).toBeVisible();
  await mine.getByRole("button", { name: "Batalkan" }).click();
  await expect.poll(() => stub.repairs.length).toBe(0);
});
