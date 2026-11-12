import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, STUB_URL, freshSession, installStub } from "./stub-backend";

// Audit batch B1 (docs/product-audit-2026-11-09.md): the owner's first-run
// checklist on Today (item 3), and a calmer staff Today (item 5).
// Phase 175 S2 made the checklist the first page a new household sees
// (docs/phase-175-tabs-and-today-plan.md, section 4): how Miamus works in
// three lines, one Set up row with the starter list, the WhatsApp message on
// the card, and Turn on notifications before the last step.

// Any 65-byte P-256 point, base64url: only shown to the browser, never used
// to subscribe in these tests.
const PUSH_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

/** Notifications not chosen yet on this phone, so the card's row asks. */
async function pushOff(context: BrowserContext) {
  await context.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "default" });
  });
}

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

test("a new household sees the first page, and its steps tick off from real data to the first finished task", async ({
  context,
  page,
}) => {
  await pushOff(context);
  const staff: Record<string, unknown>[] = [];
  const linkedPhones: Record<string, unknown>[] = [];
  const chores: Record<string, unknown>[] = [];
  const stub = await installStub(context, {
    owner: { locale: "en" },
    firstRun: true,
    installTip: true,
    pushKey: PUSH_KEY,
    household: { hasPets: false, pets: false },
    staff,
    linkedPhones,
    chores,
  });
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (name === "my_house_code") return route.fulfill({ json: "K7PM2Q" });
    if (name === "staff_claim_link") return route.fulfill({ json: "ABCDEFGHJK" });
    return route.fallback();
  });
  await context.route("https://wa.me/**", (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await page.goto("/dashboard");

  // Brand new: how Miamus works, then only the name is done, and Set up is
  // open with its buttons.
  const card = checklist(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("1 of 5");
  await expect(card).toContainText("Tell it once.");
  await expect(card).toContainText("Staff do it, with a photo.");
  await expect(card).toContainText("You only hear about what didn't happen.");
  await expect(step(page, "home")).toHaveAttribute("data-done", "true");
  await expect(step(page, "home")).toContainText("Rumah Uji");
  await expect(step(page, "setup")).toContainText("Add your staff and chores");
  await expect(step(page, "setup").getByRole("button", { name: "Use the starter list" })).toBeVisible();
  // Nothing depends on Kakak: she isn't on in this home, so no button for her.
  await expect(card.getByRole("button", { name: "Or tell Kakak" })).toHaveCount(0);
  // The welcome's own Add buttons step aside while the checklist shows.
  await expect(page.getByText("Nothing on this day yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Chore" })).toHaveCount(0);

  // Add a person goes to Household, Staff.
  await card.getByRole("link", { name: "Add a person" }).click();
  await expect(page).toHaveURL(/module=access&page=staff/);
  await expect(page.getByRole("button", { name: "Add Person" })).toBeVisible();

  // Sari is on the roster: Set up stays open until there is a first task,
  // and now offers that instead.
  staff.push(SARI);
  await page.goto("/dashboard");
  await expect(card).toContainText("1 of 5", { timeout: 20_000 });
  await expect(step(page, "setup")).toHaveAttribute("data-done", "false");
  await expect(card.getByRole("link", { name: "Add a person" })).toHaveCount(0);

  // Add a task opens the chore form with Sari already chosen.
  await card.getByRole("button", { name: "Add a task" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox").filter({ hasText: "Sari" })).toBeVisible();
  await dialog.getByRole("textbox").first().fill("Sweep the terrace");
  await dialog.getByRole("button", { name: "Add Chore" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Sweep the terrace", assigned_to: STAFF_ID, due_date: today() });
  await expect(card).toContainText("2 of 5");
  await expect(step(page, "setup")).toContainText("Sari");

  // The link goes from the card itself, in one WhatsApp message.
  const phone = step(page, "phone");
  await expect(phone).toContainText("Send your staff the link");
  await expect(phone).toContainText("0 of 1 phone linked");
  const send = phone.getByRole("button", { name: "Send one WhatsApp message" });
  await expect(send).toBeEnabled();
  const popup = page.waitForEvent("popup");
  await send.click();
  const wa = await popup;
  const text = new URL(wa.url()).searchParams.get("text") ?? "";
  await wa.close();
  expect(text).toMatch(/\/join\/code#c=K7P-M2Q&k=ABCDEFGHJK$/);
  // While the card shows, its own row asks for notifications: neither
  // prompt above Today does.
  await expect(page.getByRole("region", { name: "Turn on notifications" })).toHaveCount(0);
  await expect(page.getByText("Add Miamus to your Home Screen for notifications.")).toHaveCount(0);

  // Sari's phone opened the link: notifications are next, with one tap.
  linkedPhones.push({ id: "device-1", linked_at: "2026-11-10T01:00:00Z", last_seen_at: "2026-11-10T01:00:00Z" });
  await page.goto("/dashboard");
  await expect(card).toContainText("3 of 5", { timeout: 20_000 });
  await expect(step(page, "phone")).toContainText("1 phone");
  await expect(step(page, "notify")).toContainText("Turn on notifications");
  await expect(step(page, "notify").getByRole("button", { name: "Turn on" })).toBeEnabled();
  await expect(card).toContainText("See the first task done");

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

test("Bahasa Indonesia: the three lines, the starter list, and Nanti saja hides it for good", async ({ context, page }) => {
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
  await expect(card).toContainText("Bilang sekali.");
  await expect(card).toContainText("Staf mengerjakan, dengan foto.");
  await expect(card).toContainText("Anda hanya dikabari kalau ada yang belum.");
  await expect(step(page, "setup")).toContainText("Siapkan rumah");
  await expect(card).toContainText("Kirim link ke staf Anda");
  await expect(card).toContainText("Lihat tugas pertama selesai");
  await expect(card.getByRole("link", { name: "Tambah Orang" })).toBeVisible();

  // The starter list opens from the card, as on Chores.
  await card.getByRole("button", { name: "Pakai daftar awal" }).click();
  const sheet = page.getByRole("dialog", { name: "Daftar awal" });
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // Tapped by mistake: the toast's Batalkan brings it back. It names the
  // tab by its new name (Phase 175 S1).
  await card.getByRole("button", { name: "Nanti saja" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByText("Disembunyikan. Staf dan undangan ada di tab Pengaturan.")).toBeVisible();
  await page.getByRole("button", { name: "Batalkan" }).click();
  await expect(card).toBeVisible();

  await card.getByRole("button", { name: "Nanti saja" }).click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tambah Tugas" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Tambah Tugas" })).toBeVisible({ timeout: 20_000 });
  await expect(card).toHaveCount(0);
});

test("with Kakak on, Or tell Kakak opens her sheet, which stays open for Saved and Undo when the row ticks", async ({
  context,
  page,
}) => {
  // Codex, #107: a save that finishes the Set up row must not close the
  // sheet before its saved note and Undo.
  const stub = await installStub(context, {
    owner: { locale: "en" },
    firstRun: true,
    kakak: { allowed: true, enabled: true },
    household: { hasPets: false, pets: false },
    staff: [SARI],
    linkedPhones: [],
    chores: [],
  });
  await page.route("**/api/kakak", (route) =>
    route.fulfill({
      json: {
        kind: "suggestions",
        text: "Here's what I'll add:",
        items: [
          {
            kind: "chore",
            title: "Sapu teras",
            titleEn: "Sweep the terrace",
            category: "cleaning",
            assignedTo: STAFF_ID,
            assignToSelf: false,
            assigneeName: "Sari",
            dueDate: today(),
            dueTime: null,
            recurrence: "daily",
            recurrenceUntil: null,
            requiresSupervision: false,
            locationId: null,
            roomName: null,
            newRoomName: null,
            newRoomFloorId: null,
            newRoomFloorName: null,
            notes: null,
          },
        ],
        requestId: "00000000-0000-4000-8000-0000000000c1",
        history: { messages: [] },
      },
    })
  );
  await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/dashboard");

  const card = checklist(page);
  await expect(card).toBeVisible({ timeout: 20_000 });
  // Sari is there; the first task is what's missing.
  await expect(step(page, "setup").getByRole("button", { name: "Use the starter list" })).toBeVisible();
  await expect(step(page, "setup").getByRole("button", { name: "Add a task" })).toBeVisible();
  await step(page, "setup").getByRole("button", { name: "Or tell Kakak" }).click();

  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "What should I set up?" }).fill("Sari sweeps the terrace every day");
  await sheet.getByRole("button", { name: "Send" }).click();
  await sheet.getByRole("button", { name: "Looks right" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);

  // The row ticks behind the sheet, and the sheet stays open with Saved and
  // Undo (before the fix, the tick unmounted it).
  await expect(step(page, "setup")).toHaveAttribute("data-done", "true");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Nothing is saved until you confirm.")).toBeVisible();
  await expect(page.getByText("Saved — Sweep the terrace, Sari")).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("on an iPhone in the browser, the notifications step says Add to Home Screen first", async ({ context, page }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    });
  });
  await installStub(context, {
    owner: { locale: "id" },
    firstRun: true,
    pushKey: PUSH_KEY,
    household: { hasPets: false, pets: false },
    staff: [SARI],
    linkedPhones: [{ id: "device-1", linked_at: "2026-11-10T01:00:00Z", last_seen_at: "2026-11-10T01:00:00Z" }],
    chores: [
      {
        id: "00000000-0000-4000-8000-0000000b1201",
        household_id: HOUSEHOLD_ID,
        title: "Sapu teras",
        notes: null,
        category: "cleaning",
        assigned_to: STAFF_ID,
        due_date: today(),
        due_time: null,
        status: "pending",
        completed_by: null,
        completed_at: null,
        photo_url: null,
        created_at: "2026-11-10T00:00:00Z",
        recurrence: "none",
        recurrence_until: null,
        parent_task_id: null,
        requires_supervision: false,
        before_photo_url: null,
        after_photo_url: null,
        location_id: null,
        spot: null,
      },
    ],
  });
  await page.goto("/dashboard");

  const card = checklist(page, "Siapkan rumah Anda");
  await expect(card).toContainText("3 dari 5", { timeout: 20_000 });
  const notify = step(page, "notify");
  await expect(notify).toContainText("Aktifkan notifikasi");
  await expect(notify).toContainText("Ketuk Bagikan, lalu Tambahkan ke Layar Utama.");
  // No button that can't work here: iPhone allows it only from the Home Screen.
  await expect(notify.getByRole("button", { name: "Aktifkan" })).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(checklist(page)).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Your home is set up" })).toHaveCount(0);
});

test("an older household whose only finished work is a one-off chore from weeks ago never sees it", async ({
  context,
  page,
}) => {
  const chore = (over: Record<string, unknown>) => ({
    household_id: HOUSEHOLD_ID,
    notes: null,
    category: "cleaning",
    assigned_to: STAFF_ID,
    due_time: null,
    photo_url: null,
    created_at: "2026-10-01T00:00:00Z",
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
  // Nothing finished in what Today loads: today's chore is still open, and
  // the finished one is a one-off from October, outside every read.
  const chores = [
    chore({ id: "00000000-0000-4000-8000-0000000b1101", title: "Siram tanaman", due_date: today(), status: "pending", completed_by: null, completed_at: null }),
    chore({ id: "00000000-0000-4000-8000-0000000b1102", title: "Cuci gorden", due_date: "2026-10-05", status: "completed", completed_by: STAFF_ID, completed_at: "2026-10-05T03:00:00Z" }),
  ];
  await installStub(context, {
    owner: { locale: "en" },
    firstRun: true,
    household: { hasPets: false, pets: false },
    staff: [SARI],
    linkedPhones: [{ id: "device-1", linked_at: "2026-10-01T01:00:00Z", last_seen_at: "2026-11-10T01:00:00Z" }],
    chores,
  });
  await page.goto("/dashboard");
  await expect(page.getByText("Siram tanaman")).toBeVisible({ timeout: 20_000 });
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

test("a staff phone left open overnight gets its next tip after midnight, without a reload", async ({ context, page }) => {
  // Codex, #62: the "one tip a day" rest used to be read only on mount.
  await page.clock.install();
  await installStub(context, { stored: freshSession(), staffPhone: true, chores: [] });
  await page.goto("/staff");

  const tips = page.getByRole("region", { name: /^Baru:/ });
  await expect(page.getByRole("region", { name: "Baru: Kirim masukan" })).toBeVisible({ timeout: 20_000 });
  await tips.getByRole("button", { name: "Tutup" }).click();
  await expect(tips).toHaveCount(0);

  // Past local midnight, same page: the next newest tip appears.
  const toMidnight = await page.evaluate(() => {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime() - now.getTime();
  });
  await page.clock.fastForward(toMidnight + 5_000);
  await expect(page.getByRole("region", { name: "Baru: aman saat sinyal lemah" })).toBeVisible({ timeout: 10_000 });
  await expect(tips).toHaveCount(1);
});
