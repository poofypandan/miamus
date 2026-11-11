import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { BENTO, HOUSEHOLD_ID, MOCHI, schedule } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Phase 173 PR A (docs/phase-173-pet-routines-plan.md): the owner's two
// examples end to end. "Lights off for both dogs at 21:30" and "a daily walk
// for one dog" are made in the Add routine sheet, in a few taps with nothing
// typed; on a staff phone, one photo settles lights off for both dogs (with
// Batalkan), and the walk is three live-camera photos that survive closing
// the app, can be cancelled, and refuse an old file. Also: a Tick routine,
// and a walk step saved with no signal.

async function photo() {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 90, g: 120, b: 160 } } })
    .jpeg()
    .toBuffer();
}

/** A camera photo "just taken": the browser stamps a buffer upload with now. */
async function shoot(input: Locator) {
  await input.setInputFiles({ name: "IMG_0001.jpg", mimeType: "image/jpeg", buffer: await photo() });
}

const lights = (pet: typeof MOCHI) =>
  schedule(pet, "Matikan lampu", ["21:30"], {
    kind: "lights",
    routine_group_id: "00000000-0000-4000-8000-0000000173a1",
    note: "Lampu ruang tamu dan kamar anjing",
    proof: "photo",
  });
const walk = schedule(BENTO, "Jalan-jalan", ["07:00"], {
  kind: "walk",
  routine_group_id: "00000000-0000-4000-8000-0000000173b1",
  proof: "three",
  note: "Pakai tali",
});

// The compressor first tries a worker from a CDN; refused, it compresses on
// the page (as photo-fields.spec.ts does), so no test waits on the internet.
test.beforeEach(async ({ context }) => {
  await context.route(/cdn\.jsdelivr\.net/, (route) => route.abort("blockedbyclient"));
});

const card = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });

test("owner: lights off for both dogs at 21:30 in four taps, nothing typed", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=pets");

  // Tap 1 was the Pets tab. 2: Add routine (every pet ticked from here).
  await page.getByRole("button", { name: "Add routine" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-routine-sheet");
  await expect(sheet.getByRole("button", { name: "Mochi", pressed: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Bento", pressed: true })).toBeVisible();
  // 3: Lights off, which suggests 21:30, every day, no end, anyone, a photo.
  await sheet.getByRole("button", { name: "Lights off" }).click();
  await expect(sheet.getByLabel("Time 1")).toHaveValue("21:30");
  await expect(sheet.getByRole("tab", { name: "Every day" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByRole("tab", { name: "Photo" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByRole("button", { name: "Anyone", pressed: true })).toBeVisible();
  // 4: Add for 2 pets.
  await sheet.getByRole("button", { name: "Add for 2 pets" }).click();
  await expect(page.getByText("Lights off added")).toBeVisible();

  const made = stub.schedules.filter((s) => s.kind === "lights");
  expect(made).toHaveLength(2);
  expect(new Set(made.map((s) => s.entity_id))).toEqual(new Set([MOCHI.id, BENTO.id]));
  for (const row of made) {
    expect(row).toMatchObject({
      title: "Matikan lampu",
      fixed_times: ["21:30"],
      frequency_type: "fixed_time",
      expires_at: null,
      days_of_week: null,
      staff_id: null,
      note: null,
      proof: "photo",
    });
  }
  // One group: two rows, one routine.
  expect(made[0].routine_group_id).toBeTruthy();
  expect(made[1].routine_group_id).toBe(made[0].routine_group_id);
});

test("owner (Bahasa Indonesia): a daily walk for one dog at 07:00, three photos by default", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" } });
  await page.goto("/dashboard?module=pets");

  // Bento's page, then Tambah rutinitas beside Kelola Rutinitas (for Bento).
  await page.getByRole("button", { name: /Bento/ }).first().click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Tambah rutinitas" }).first().click();
  const sheet = page.getByTestId("add-routine-sheet");
  await expect(sheet.getByRole("button", { name: "Bento", pressed: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Mochi", pressed: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Jalan-jalan" }).click();
  await expect(sheet.getByLabel("Jam 1")).toHaveValue("06:30");
  await sheet.getByLabel("Jam 1").fill("07:00");
  await expect(sheet.getByRole("tab", { name: "3 foto" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByText("Tiga foto dari kamera", { exact: false })).toBeVisible();
  await sheet.getByRole("button", { name: "Tambah untuk Bento" }).click();
  await expect(page.getByText("Jalan-jalan ditambahkan")).toBeVisible();

  const made = stub.schedules.filter((s) => s.kind === "walk");
  expect(made).toEqual([
    expect.objectContaining({ entity_id: BENTO.id, title: "Jalan-jalan", fixed_times: ["07:00"], proof: "three", expires_at: null }),
  ]);
});

test("owner: a walk for two pets falls back to one photo (3 photos is for one pet)", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=pets");
  await page.getByRole("button", { name: "Add routine" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-routine-sheet");
  await sheet.getByRole("button", { name: "Walk" }).click();
  await expect(sheet.getByRole("tab", { name: "3 photos" })).toHaveCount(0);
  await expect(sheet.getByRole("tab", { name: "Photo" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.getByText("3 photos is for one pet at a time.", { exact: false })).toBeVisible();
  // One pet again: 3 photos is back, and chosen.
  await sheet.getByRole("button", { name: "Bento" }).click();
  await expect(sheet.getByRole("tab", { name: "3 photos" })).toHaveAttribute("aria-selected", "true");
  await sheet.getByRole("button", { name: "Bento" }).click();
  await sheet.getByRole("button", { name: "Add for 2 pets" }).click();
  await expect(page.getByText("Walk added")).toBeVisible();
  const made = stub.schedules.filter((s) => s.kind === "walk");
  expect(made).toHaveLength(2);
  expect(made.every((s) => s.proof === "photo")).toBe(true);
});

test("owner: Others is now Other routines, and a routine opens the same sheet to edit", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, schedules: [lights(MOCHI), lights(BENTO)] });
  await page.goto("/dashboard?module=pets");
  await page.getByRole("button", { name: /Mochi/ }).first().click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Manage Routines" }).click();
  await expect(page.getByText("Other routines")).toBeVisible();
  await page.getByRole("button", { name: /Lights off/ }).click();
  const sheet = page.getByTestId("add-routine-sheet");
  await expect(sheet.getByRole("heading", { name: "Edit routine" })).toBeVisible();
  // Moving the time moves both dogs' rows in place.
  await sheet.getByLabel("Time 1").fill("22:00");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Routine saved")).toBeVisible();
  const rows = stub.schedules.filter((s) => s.kind === "lights");
  expect(rows).toHaveLength(2);
  expect(rows.map((r) => r.fixed_times)).toEqual([["22:00"], ["22:00"]]);
});

test("owner: taking pets off a routine ends a row with history and deletes one without", async ({ context, page }) => {
  const mochi = lights(MOCHI);
  const bento = lights(BENTO);
  const stub = await installStub(context, {
    owner: { locale: "en" },
    schedules: [mochi, bento],
    // Bento's lights were done last night; Mochi's never.
    logs: [{ id: "00000000-0000-4000-8000-0000000173f1", schedule_id: bento.id, entity_id: BENTO.id, module: "pet", photo_url: null, notes: null, completed_at: new Date(Date.now() - 86_400_000).toISOString(), sub_type: "complete" }],
  });
  await page.goto("/dashboard?module=pets");
  await page.getByRole("button", { name: /Mochi/ }).first().click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Manage Routines" }).click();
  await page.getByRole("button", { name: /Lights off/ }).click();
  const sheet = page.getByTestId("add-routine-sheet");
  await sheet.getByRole("button", { name: "Remove routine" }).click();
  await page.getByRole("dialog", { name: "Remove this routine?" }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Routine removed")).toBeVisible();

  // Mochi's row had no history: gone. Bento's had: it ends yesterday and
  // leaves the group, so its log keeps its title and it never comes back.
  expect(stub.schedules.find((s) => s.id === mochi.id)).toBeUndefined();
  const ended = stub.schedules.find((s) => s.id === bento.id)!;
  expect(ended.routine_group_id).toBeNull();
  expect(String(ended.expires_at) < new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())).toBe(true);
});

test("staff: one photo settles lights off for both dogs, with Batalkan", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, schedules: [lights(MOCHI), lights(BENTO)] });
  await page.goto("/staff");

  const row = card(page, "21.30 Matikan lampu");
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("Lampu ruang tamu dan kamar anjing");
  // The card's own camera: no sheet, no pet picking.
  await shoot(page.getByLabel("Foto Matikan lampu").locator('input[type="file"]'));
  await expect(page.getByText("Bento, Mochi · Matikan lampu selesai")).toBeVisible({ timeout: 15_000 });

  await expect.poll(() => stub.logs.length).toBe(2);
  const [a, b] = stub.logs;
  expect(new Set([a.entity_id, b.entity_id])).toEqual(new Set([MOCHI.id, BENTO.id]));
  expect(a.photo_url).toBeTruthy();
  expect(b.photo_url).toBe(a.photo_url);
  expect(a.sub_type).toBe("complete");

  // Batalkan, within the toast: both logs go.
  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect(page.getByText("Dibatalkan")).toBeVisible();
  await expect.poll(() => stub.logs.length).toBe(0);
  await expect(page.getByLabel("Foto Matikan lampu")).toBeVisible();
});

test("staff: a walk in three photos, after closing the app, refusing an old file", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, schedules: [walk] });
  await page.goto("/staff");

  const step = (label: string) => page.getByLabel(`${label} · Jalan-jalan`);
  await expect(step("Mulai")).toBeVisible({ timeout: 20_000 });
  await shoot(step("Mulai").locator('input[type="file"]'));
  await expect(page.getByTestId("walk-line")).toContainText("Sedang jalan · mulai");
  await expect(step("Sudah sampai")).toBeVisible();

  // Closing the app at the park loses nothing: the step comes from the logs.
  await page.reload();
  await expect(step("Sudah sampai")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("walk-line")).toContainText("Sedang jalan · mulai");

  // A photo from the gallery (a file an hour old) is refused.
  const dir = mkdtempSync(join(tmpdir(), "walk-"));
  const old = join(dir, "IMG_0002.jpg");
  writeFileSync(old, await photo());
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  utimesSync(old, anHourAgo, anHourAgo);
  await step("Sudah sampai").locator('input[type="file"]').setInputFiles(old);
  await expect(page.getByText("Ambil foto langsung dari kamera.")).toBeVisible();
  expect(stub.logs.map((l) => l.sub_type)).toEqual(["check_in"]);

  await shoot(step("Sudah sampai").locator('input[type="file"]'));
  await expect(page.getByTestId("walk-line")).toContainText("Sudah sampai");
  await shoot(step("Sudah pulang").locator('input[type="file"]'));
  await expect(page.getByText("Bento · Jalan-jalan selesai")).toBeVisible({ timeout: 15_000 });
  // Done at the end photo: the card moves into Selesai, with the walk's span.
  await page.getByRole("button", { name: /^Selesai · 1/ }).click();
  await expect(page.getByTestId("walk-line")).toContainText("menit");
  await expect(page.getByTestId("walk-line")).toContainText("sampai");

  await expect.poll(() => stub.logs.map((l) => l.sub_type)).toEqual(["check_in", "arrived", "check_out"]);
  expect(new Set(stub.logs.map((l) => l.photo_url)).size).toBe(3);
  expect(stub.logs.every((l) => l.schedule_id === walk.id && l.entity_id === BENTO.id)).toBe(true);

  // Within 5 minutes of the end photo, the card's sheet still takes the
  // whole walk back, after the toast has gone.
  await card(page, "07.00 Jalan-jalan").click();
  await page.getByRole("button", { name: "Batalkan jalan-jalan" }).click();
  await page.getByRole("dialog", { name: "Batalkan jalan-jalan?" }).getByRole("button", { name: "Batalkan" }).click();
  await expect(page.getByText("Jalan-jalan dibatalkan")).toBeVisible();
  await expect.poll(() => stub.logs.length).toBe(0);
});

test("staff: Batalkan jalan-jalan takes a walk in progress back to Mulai", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, schedules: [walk] });
  await page.goto("/staff");
  const start = page.getByLabel("Mulai · Jalan-jalan");
  await expect(start).toBeVisible({ timeout: 20_000 });
  await shoot(start.locator('input[type="file"]'));
  await expect(page.getByLabel("Sudah sampai · Jalan-jalan")).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => stub.logs.length).toBe(1);

  await card(page, "07.00 Jalan-jalan").click();
  await expect(page.getByTestId("walk-steps")).toContainText("belum");
  // While walking, the sheet offers the cancel, not "Tidak bisa dikerjakan".
  await expect(page.getByRole("button", { name: "Tidak bisa dikerjakan" })).toHaveCount(0);
  await page.getByRole("button", { name: "Batalkan jalan-jalan" }).click();
  await page.getByRole("dialog", { name: "Batalkan jalan-jalan?" }).getByRole("button", { name: "Batalkan" }).click();
  await expect(page.getByText("Jalan-jalan dibatalkan")).toBeVisible();
  await expect.poll(() => stub.logs.length).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Mulai · Jalan-jalan")).toBeVisible();
});

test("staff: a walk step with no signal waits on the phone and still moves the card on", async ({ context, page }) => {
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, schedules: [walk] });
  await page.goto("/staff");
  const start = page.getByLabel("Mulai · Jalan-jalan");
  await expect(start).toBeVisible({ timeout: 20_000 });

  await context.setOffline(true);
  await shoot(start.locator('input[type="file"]'));
  await expect(page.getByLabel("Sudah sampai · Jalan-jalan")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("walk-line")).toContainText("Sedang jalan · mulai");
  expect(stub.logs).toHaveLength(0);

  await context.setOffline(false);
  await expect.poll(() => stub.logs.map((l) => l.sub_type), { timeout: 30_000 }).toEqual(["check_in"]);
  await expect(page.getByLabel("Sudah sampai · Jalan-jalan")).toBeVisible();
});

test("staff: a Tick routine is one tap for every pet, with no photo", async ({ context, page }) => {
  const teeth = (pet: typeof MOCHI) =>
    schedule(pet, "Sikat gigi", ["19:00"], { kind: "teeth", routine_group_id: "00000000-0000-4000-8000-0000000173c1", proof: "tick" });
  const stub = await installStub(context, { stored: freshSession(), staffPhone: true, schedules: [teeth(MOCHI), teeth(BENTO)] });
  await page.goto("/staff");
  await page.getByRole("button", { name: "Centang Sikat gigi" }).click({ timeout: 20_000 });
  await expect(page.getByText("Bento, Mochi · Sikat gigi selesai")).toBeVisible();
  await expect.poll(() => stub.logs.length).toBe(2);
  expect(stub.logs.every((l) => l.photo_url === null && l.sub_type === "complete")).toBe(true);

  // After the toast, the sheet takes the ticks back for 5 minutes (the done
  // card is in Selesai)...
  await page.getByRole("button", { name: /^Selesai · 1/ }).click();
  await card(page, "19.00 Sikat gigi").click();
  await page.getByRole("button", { name: "Batalkan centang" }).click();
  await expect.poll(() => stub.logs.length).toBe(0);
  // ...and ticks one pet on its own, when only one was done. (Undone, the card
  // leaves Selesai, so it is opened again.)
  await page.keyboard.press("Escape");
  await card(page, "19.00 Sikat gigi").click();
  await page.getByRole("button", { name: "Centang Mochi" }).click();
  await expect.poll(() => stub.logs.map((l) => l.entity_id)).toEqual([MOCHI.id]);
});

test("staff: a Tick routine someone said couldn't be done can still be finished from its sheet", async ({ context, page }) => {
  const teeth = (pet: typeof MOCHI) =>
    schedule(pet, "Sikat gigi", ["19:00"], { kind: "teeth", routine_group_id: "00000000-0000-4000-8000-0000000173d1", proof: "tick" });
  const rows = [teeth(MOCHI), teeth(BENTO)];
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const said = (row: (typeof rows)[number], n: number) => ({
    id: `00000000-0000-4000-8000-0000001739${n}0`,
    household_id: HOUSEHOLD_ID,
    chore_id: null,
    schedule_id: row.id,
    entity_id: row.entity_id,
    occurs_on: today,
    slot_time: "19:00",
    reason: "out_of_stock",
    note: null,
    photo_url: null,
    inventory_item_id: null,
    staff_id: STAFF_ID,
    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  });
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    schedules: rows,
    exceptions: [said(rows[0], 1), said(rows[1], 2)],
  });
  await page.goto("/staff");
  // Both pets explained: the card has no one-tap button, but its sheet still finishes it.
  await expect(card(page, "19.00 Sikat gigi")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Centang Sikat gigi" })).toHaveCount(0);
  await card(page, "19.00 Sikat gigi").click();
  await page.getByRole("button", { name: "Centang 2 hewan" }).click();
  await expect.poll(() => stub.logs.length).toBe(2);
});

test("staff: a three-photo walk is one card per pet, so a pet left out walks later on its own", async ({ context, page }) => {
  const group = "00000000-0000-4000-8000-0000000173e1";
  const bentoWalk = schedule(BENTO, "Jalan-jalan", ["07:00"], { kind: "walk", routine_group_id: group, proof: "three" });
  const mochiWalk = schedule(MOCHI, "Jalan-jalan", ["07:00"], { kind: "walk", routine_group_id: group, proof: "three" });
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  // Bento walked this morning; Mochi was said to be unable to go.
  const steps = (["check_in", "arrived", "check_out"] as const).map((sub, i) => ({
    id: `00000000-0000-4000-8000-0000001739e${i}`,
    schedule_id: bentoWalk.id,
    entity_id: BENTO.id,
    module: "pet",
    photo_url: null,
    notes: null,
    completed_at: `${today}T07:0${i * 2 + 1}:00+07:00`,
    received_at: `${today}T07:0${i * 2 + 1}:00+07:00`,
    sub_type: sub,
  }));
  const stub = await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    schedules: [bentoWalk, mochiWalk],
    logs: steps,
    exceptions: [
      {
        id: "00000000-0000-4000-8000-0000001739f1",
        household_id: HOUSEHOLD_ID,
        chore_id: null,
        schedule_id: mochiWalk.id,
        entity_id: MOCHI.id,
        occurs_on: today,
        slot_time: "07:00",
        reason: "other",
        note: null,
        photo_url: null,
        inventory_item_id: null,
        staff_id: STAFF_ID,
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ],
  });
  await page.goto("/staff");
  await card(page, "07.00 Jalan-jalan").click({ timeout: 20_000 });
  // Mochi can go after all: the sheet starts Mochi's own walk.
  await shoot(page.getByRole("dialog").locator("label", { hasText: "Mulai" }).locator('input[type="file"]'));
  await expect.poll(() => stub.logs.filter((l) => l.entity_id === MOCHI.id).map((l) => l.sub_type)).toEqual(["check_in"]);
  expect(stub.logs.filter((l) => l.entity_id === BENTO.id)).toHaveLength(3);
});
