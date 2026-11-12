import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Phase 174 PR A (docs/phase-174-repairs-walkin-plan.md): a staff phone logs
// a repair person at the gate (Ada tukang datang: what, who, a live-camera
// before photo) and closes it with Selesai; a visit left open overnight
// asks again and comes back the next day with its name ready (D6); the
// person supervising sees the strip and hands over (D11); a chore missed
// while supervising explains itself on the staff phone and on the owners'
// Today (D10). Everything is answered by the stub.

const SYAM = "00000000-0000-4000-8000-00000000c002";
const person = (id: string, name: string) => ({
  id,
  household_id: HOUSEHOLD_ID,
  name,
  has_pin: true,
  user_id: null,
  archived_at: null,
  created_at: "2026-10-01T00:00:00Z",
});
const STAFF = [person(STAFF_ID, "Ari"), person(SYAM, "Syam")];

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());

const REPAIR_ID = "00000000-0000-4000-8000-000000174001";
const repair = (over: Record<string, unknown> = {}) => ({
  id: REPAIR_ID,
  household_id: HOUSEHOLD_ID,
  location_id: null,
  spot: null,
  title: "Keran bocor",
  details: null,
  photo_url: null,
  urgent: false,
  status: "open",
  reported_by_staff: null,
  created_by: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
  decided_by: null,
  decided_at: null,
  dismiss_reason: null,
  fixed_by_name: null,
  closed_at: null,
  ...over,
});
const VISIT_ID = "00000000-0000-4000-8000-000000174a01";
const walkIn = (arrivedAt: string, over: Record<string, unknown> = {}) => ({
  id: VISIT_ID,
  household_id: HOUSEHOLD_ID,
  repair_id: REPAIR_ID,
  worker_name: "Pak Budi",
  logged_by_staff: STAFF_ID,
  created_by: null,
  arrived_at: arrivedAt,
  arrived_phone_at: arrivedAt,
  before_photo_url: `http://supabase.test/storage/v1/object/public/household-logs/${HOUSEHOLD_ID}/repairs/${REPAIR_ID}/b.webp`,
  left_at: null,
  left_phone_at: null,
  after_photo_url: null,
  outcome: null,
  note: null,
  ...over,
});
const stretch = (startedAt: string, staffId = STAFF_ID) => ({
  id: "00000000-0000-4000-8000-000000174b01",
  household_id: HOUSEHOLD_ID,
  visit_id: VISIT_ID,
  staff_id: staffId,
  user_id: null,
  started_at: startedAt,
  ended_at: null,
});

async function photo() {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 120, g: 110, b: 90 } } })
    .jpeg()
    .toBuffer();
}

/** A camera photo "just taken": the browser stamps a buffer upload with now. */
async function shoot(input: Locator) {
  await input.setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: await photo() });
}

async function openPerbaikan(page: Page) {
  await page.goto("/staff");
  await page.getByRole("tab", { name: "Perbaikan" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/view=perbaikan/);
}

test("a staff phone logs a walk-in at the gate and closes it with Selesai", async ({ context, page }) => {
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    staff: STAFF,
    chores: [],
    repairs: [repair()],
  });
  await openPerbaikan(page);

  await page.getByRole("button", { name: /Ada tukang datang/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ada tukang datang" });
  // Only "what" and the photo are required: Simpan waits for both.
  const save = sheet.getByRole("button", { name: "Simpan" });
  await expect(save).toBeDisabled();
  await sheet.getByRole("radio", { name: /Keran bocor/ }).click();
  await sheet.getByRole("button", { name: "Tim developer" }).click();
  await shoot(sheet.getByTestId("walkin-before-input"));
  await expect(save).toBeEnabled();
  await save.click();

  await expect(page.getByText("Tersimpan. Pemilik rumah bisa melihatnya.")).toBeVisible();
  await expect.poll(() => stub.walkIns.length).toBe(1);
  expect(stub.walkIns[0]).toMatchObject({
    repair_id: REPAIR_ID,
    worker_name: "Tim developer",
    logged_by_staff: STAFF_ID,
  });
  // The before photo went up first, into the repair's folder.
  expect(String(stub.walkIns[0].before_photo_url)).toContain(`/${HOUSEHOLD_ID}/repairs/${REPAIR_ID}/`);
  expect(stub.uploads.some((u) => u.includes(`/repairs/${REPAIR_ID}/`))).toBe(true);
  // Ari supervises it from now on.
  expect(stub.supervision).toHaveLength(1);
  expect(stub.supervision[0]).toMatchObject({ staff_id: STAFF_ID, ended_at: null });

  const card = page.getByTestId("walkin-open-card");
  await expect(card.getByText("Keran bocor")).toBeVisible();
  await expect(card.getByText(/Tim developer · diawasi Ari · sejak/)).toBeVisible();

  // The strip on Tugas Hari Ini, for Ari only.
  await page.getByRole("tab", { name: "Tugas Hari Ini" }).click();
  const strip = page.getByTestId("supervising-strip");
  await expect(strip.getByText("Sedang mengawasi perbaikan")).toBeVisible();
  await expect(strip.getByText(/Keran bocor · sejak \d\d\.\d\d/)).toBeVisible();

  // Selesai, from the strip: after photo and a chip.
  await strip.getByRole("button", { name: "Selesai" }).click();
  const done = page.getByRole("dialog", { name: "Selesai" });
  await expect(done.getByRole("button", { name: "Simpan" })).toBeDisabled();
  await shoot(done.getByTestId("walkin-after-input"));
  await done.getByRole("button", { name: "Sudah beres" }).click();
  await done.getByRole("button", { name: "Simpan" }).click();

  await expect.poll(() => stub.walkIns[0].after_photo_url).toBeTruthy();
  expect(stub.walkIns[0]).toMatchObject({ outcome: "fixed" });
  expect(stub.supervision[0].ended_at).toBeTruthy();
  await expect(page.getByTestId("supervising-strip")).toHaveCount(0);

  // Before and after side by side under Sudah diperbaiki.
  await page.getByRole("tab", { name: "Perbaikan" }).click();
  const fixed = page.getByRole("region", { name: "Sudah diperbaiki" });
  await expect(fixed.getByText("Keran bocor")).toBeVisible();
  await expect(fixed.getByText(/Sudah beres · Tim developer · \d\d\.\d\d–\d\d\.\d\d/)).toBeVisible();
  await expect(page.getByTestId("walkin-open-card")).toHaveCount(0);
});

test("a visit left open overnight asks again, and comes back the next day with its name ready (D6)", async ({ context, page }) => {
  const yesterday = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    staff: STAFF,
    chores: [],
    repairs: [repair()],
    walkIns: [walkIn(yesterday)],
    supervision: [stretch(yesterday)],
  });
  await openPerbaikan(page);

  const card = page.getByTestId("walkin-open-card");
  await expect(card.getByText("Belum ditutup sejak kemarin")).toBeVisible();
  // Nothing closes on its own.
  expect(stub.walkIns[0].left_at).toBeNull();

  await card.getByRole("button", { name: "Selesai" }).click();
  const done = page.getByRole("dialog", { name: "Selesai" });
  await shoot(done.getByTestId("walkin-after-input"));
  await done.getByRole("button", { name: "Belum selesai, datang lagi" }).click();
  await done.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(() => stub.walkIns[0].outcome).toBe("come_back");

  // The repair is still broken; the tukang is coming back.
  await expect(page.getByRole("region", { name: "Masih rusak" }).getByText("Keran bocor")).toBeVisible();

  // Next visit: picking the repair chooses its last name already.
  await page.getByRole("button", { name: /Ada tukang datang/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ada tukang datang" });
  await sheet.getByRole("radio", { name: /Keran bocor/ }).click();
  await expect(sheet.getByRole("button", { name: "Pak Budi" })).toHaveAttribute("aria-pressed", "true");
  await shoot(sheet.getByTestId("walkin-before-input"));
  await sheet.getByRole("button", { name: "Simpan" }).click();
  await expect.poll(() => stub.walkIns.length).toBe(2);
  expect(stub.walkIns[1]).toMatchObject({ worker_name: "Pak Budi", repair_id: REPAIR_ID });
});

test("Ganti yang mengawasi hands the walk-in to Syam", async ({ context, page }) => {
  const started = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    staff: STAFF,
    chores: [],
    repairs: [repair()],
    walkIns: [walkIn(started)],
    supervision: [stretch(started)],
  });
  await page.goto("/staff");
  const strip = page.getByTestId("supervising-strip");
  await expect(strip.getByText("Sedang mengawasi perbaikan")).toBeVisible({ timeout: 20_000 });
  await strip.getByRole("button", { name: "Selesai" }).click();
  await page.getByRole("dialog", { name: "Selesai" }).getByRole("button", { name: "Ganti yang mengawasi" }).click();

  const hand = page.getByRole("dialog", { name: "Ganti yang mengawasi" });
  // Ari holds it now, so only Syam is offered.
  await expect(hand.getByRole("button", { name: "Ari" })).toHaveCount(0);
  await hand.getByRole("button", { name: "Syam" }).click();
  await hand.getByRole("button", { name: "Simpan" }).click();

  await expect.poll(() => stub.supervision.length).toBe(2);
  expect(stub.supervision[0].ended_at).toBeTruthy();
  expect(stub.supervision[1]).toMatchObject({ staff_id: SYAM, ended_at: null, visit_id: VISIT_ID });
  await expect(page.getByTestId("supervising-strip")).toHaveCount(0);
  // The walk-in itself is still open.
  expect(stub.walkIns[0].after_photo_url).toBeNull();
});

test.describe("a chore missed while supervising explains itself (D10)", () => {
  // The clock fixed at 13.00 Jakarta: Ari has supervised since 10.00; the
  // terrace was due at 10.30 and isn't done.
  const at = (hhmm: string) => new Date(`${today()}T${hhmm}:00+07:00`).toISOString();
  const mop = {
    id: "00000000-0000-4000-8000-000000174c01",
    household_id: HOUSEHOLD_ID,
    title: "Pel teras",
    notes: null,
    category: "cleaning",
    assigned_to: STAFF_ID,
    due_date: today(),
    due_time: "10:30:00",
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
  };
  const setup = () => ({
    staff: STAFF,
    chores: [mop],
    repairs: [repair()],
    walkIns: [walkIn(at("10:00"))],
    supervision: [stretch(at("10:00"))],
  });

  test("on the staff phone: a quiet label, nothing to fill in", async ({ context, page }) => {
    await page.clock.setFixedTime(new Date(at("13:00")));
    await installStub(context, { stored: freshSession(), staffPhone: true, ...setup() });
    await page.goto("/staff");
    await expect(page.getByTestId("supervising-strip").getByText(/sejak 10\.00 · 3 jam/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("supervising-line")).toHaveText("Mengawasi perbaikan");
  });

  test("on the owners' Today: the row says why, the progress row says what Ari is doing, and who is here", async ({ context, page }) => {
    await page.clock.setFixedTime(new Date(at("13:00")));
    await installStub(context, { owner: { locale: "en" }, ...setup() });
    await context.addInitScript(() => {
      localStorage.setItem("miamus.whats-new.walkins-2026-11", "seen");
    });
    await page.goto("/dashboard");
    await expect(page.getByTestId("staff-progress-line").first()).toHaveText("Supervising a repair since 10:00 AM", {
      timeout: 20_000,
    });
    await expect(page.getByTestId("walkin-today-line")).toHaveText(/Pak Budi is here · Keran bocor/);
    await expect(page.getByTestId("supervising-line")).toHaveText("Ari has been supervising a repair since 10:00 AM");
  });

  // Phase 174 PR B: the evening summary sheet says it too, as the push does.
  test("in the evening summary: the not-done row says Ari was supervising", async ({ context, page }) => {
    await page.clock.setFixedTime(new Date(at("19:30")));
    const base = setup();
    await installStub(context, {
      owner: { locale: "id" },
      ...base,
      walkIns: [walkIn(at("10:00"), { left_at: at("13:30"), left_phone_at: at("13:30"), after_photo_url: "a" })],
      supervision: [{ ...stretch(at("10:00")), ended_at: at("13:30") }],
    });
    await context.addInitScript(() => {
      localStorage.setItem("miamus.whats-new.walkins-2026-11", "seen");
    });
    await page.goto(`/dashboard?module=agenda&summary=${today()}`);
    const sheet = page.getByRole("dialog", { name: "Belum selesai hari ini" });
    const row = sheet.getByRole("button", { name: /Pel teras/ });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByTestId("summary-supervising")).toHaveText("Ari mengawasi perbaikan 10.00–13.30");
  });
});

test("owners switch walk-in repair pushes in Settings → Notifications (D4)", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=access&page=notifications");
  const arrives = page.getByRole("switch", { name: "When a repair person arrives" });
  const finished = page.getByRole("switch", { name: "When a repair is finished" });
  await expect(arrives).toBeChecked({ timeout: 20_000 });
  await expect(finished).toBeChecked();
  await arrives.click();
  await expect.poll(() => stub.repairPushPrefs.repair_arrival_pushes).toBe(false);
  expect(stub.repairPushPrefs.repair_done_pushes).toBe(true);
  await expect(arrives).not.toBeChecked();
});

test("with Repairs off, Notifications has no repair switches", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { repairs: false } });
  await page.goto("/dashboard?module=access&page=notifications");
  await expect(page.getByRole("switch", { name: "Staff requests" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("repair-push-choices")).toHaveCount(0);
});

test("with Repairs switched off there is no Perbaikan pill", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, features: { repairs: false }, chores: [] });
  await page.goto("/staff?view=perbaikan");
  await expect(page.getByRole("tab", { name: "Tugas Hari Ini" })).toHaveAttribute("aria-selected", "true", { timeout: 20_000 });
  await expect(page.getByRole("tab", { name: "Perbaikan" })).toHaveCount(0);
});
