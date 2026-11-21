import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER, OWNER_PROFILE_ID, STAFF_ID, installStub } from "./stub-backend";

// Staff onboarding (docs/private/staff-onboarding-plan.md), step 1: the
// guide says how to add, explain to, remove and bring back a staff member,
// and removing someone no longer asks the owner to share a new house code
// (phones already signed in stay signed in). In English and in Bahasa
// Indonesia.
//
// Phone-size screenshots, when SHOTS_DIR is set:
//
//   SHOTS_DIR=<folder> CI=1 npx playwright test tests/e2e/staff-onboarding.spec.ts

const DIR = process.env.SHOTS_DIR;
test.use({ viewport: { width: 390, height: 844 } });

const SYAM = "00000000-0000-4000-8000-00000000c002";
const person = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  household_id: HOUSEHOLD_ID,
  name,
  has_pin: true,
  user_id: null,
  archived_at: null as string | null,
  hidden_areas: [] as string[],
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});
const roster = () => [person(STAFF_ID, "Ari"), person(SYAM, "Syam"), person(OWNER_PROFILE_ID, "Moshe", { user_id: OWNER })];

async function shot(page: Page, name: string) {
  if (!DIR) return;
  // Let the launch screen, sheets and dialogs finish moving first.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

const COPY = {
  en: {
    add: "Add staff",
    remove: "Remove Syam",
    confirm: "Remove",
    toast: "Syam removed. Other staff phones stay signed in.",
    signIn: "The code changes when you remove someone; phones already signed in stay signed in.",
    entry: "Adding a new staff member",
    entryBody: "their name, and what they do",
    leaves: "When someone leaves",
  },
  id: {
    add: "Tambah staf",
    remove: "Hapus Syam",
    confirm: "Hapus",
    toast: "Syam dihapus. HP staf lain tetap masuk.",
    signIn: "Kodenya berganti saat Anda menghapus staf; HP yang sudah masuk tetap masuk.",
    entry: "Menambah staf baru",
    entryBody: "namanya, dan apa yang dikerjakan",
    leaves: "Kalau staf berhenti",
  },
} as const;

for (const locale of ["en", "id"] as const) {
  const c = COPY[locale];

  test(`${locale}: removing someone says other phones stay signed in, not "share the new code"`, async ({ context, page }) => {
    const staff = roster();
    await installStub(context, { owner: { locale }, staff, household: { hasPets: true } });
    const archived: unknown[] = [];
    await page.route("**/rest/v1/rpc/archive_staff_profile*", async (route) => {
      const { p_staff_id } = route.request().postDataJSON() as { p_staff_id: string };
      archived.push(p_staff_id);
      const row = staff.find((p) => p.id === p_staff_id)!;
      row.archived_at = new Date().toISOString();
      row.has_pin = false;
      await route.fulfill({ json: null });
    });
    // The toast no longer reads the new code: nothing to share now.
    let codeReads = 0;
    await page.route("**/rest/v1/rpc/my_house_code*", async (route) => {
      codeReads += 1;
      await route.fulfill({ json: "K7PM2Q" });
    });

    await page.goto("/dashboard?module=access&page=staff");
    await expect(page.getByRole("button", { name: c.add })).toBeVisible({ timeout: 20_000 });
    await shot(page, `pr1-${locale}-1-staff`);
    await page.getByRole("button", { name: c.remove }).click();
    await page.getByRole("dialog").getByRole("button", { name: c.confirm, exact: true }).click();
    await expect(page.getByText(c.toast)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await shot(page, `pr1-${locale}-2-removed-toast`);
    expect(archived).toEqual([SYAM]);
    expect(codeReads).toBe(0);

    // The code is on Staff sign-in, where it is needed, with the same line.
    await page.goto("/dashboard?module=access&page=sign-in");
    await expect(page.getByText(c.signIn)).toBeVisible({ timeout: 20_000 });
    await shot(page, `pr1-${locale}-3-sign-in`);
  });

  test(`${locale}: the guide has the staff entries, with the screens' own names`, async ({ context, page }) => {
    await installStub(context, { owner: { locale }, staff: roster(), household: { hasPets: true } });
    await page.goto("/dashboard?module=access&page=how-miamus-works&entry=add-staff");
    await expect(page.getByText(c.entryBody)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: c.entry })).toBeVisible();
    await shot(page, `pr1-${locale}-4-guide-add-staff`);
    await page.goto("/dashboard?module=access&page=how-miamus-works");
    await expect(page.getByText(c.leaves)).toBeVisible({ timeout: 20_000 });
    await shot(page, `pr1-${locale}-5-guide-list`);
  });
}

// Step 2: the Add staff sheet. A name, what they do (chips that set what
// they see), the kitchen's usual chores when Kitchen is picked, one save
// (apply_household_setup), then the WhatsApp message.

const NEW_ID = "00000000-0000-4000-8000-00000000c0aa";
const FLOOR = "00000000-0000-4000-8000-0000000000f1";
const KITCHEN = "00000000-0000-4000-8000-0000000000a1";
const DISHES = "00000000-0000-4000-8000-0000000000d1";

async function stubApply(page: Page, staff: Record<string, unknown>[]) {
  const sent: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/rpc/apply_household_setup*", async (route) => {
    const { p_draft } = route.request().postDataJSON() as { p_draft: Record<string, unknown> & { staff: { name: string }[]; chores: unknown[] } };
    sent.push(p_draft);
    staff.push(person(NEW_ID, p_draft.staff[0].name, { has_pin: false, created_at: new Date().toISOString() }));
    await route.fulfill({
      json: { rooms_added: 0, chores_added: p_draft.chores.length, bills_added: 0, staff_added: 1, skipped: 0, staff: { "s:new": NEW_ID } },
    });
  });
  return sent;
}

test("en: Add staff with Kitchen: her areas, the kitchen's chores by name, one of Ari's moved, then the message", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, {
    owner: { locale: "en" },
    staff,
    household: { hasPets: true },
    features: { repairs: true },
    rooms: [
      { id: FLOOR, household_id: HOUSEHOLD_ID, name: "LT1", kind: "floor", parent_id: null, created_at: "2026-10-01T00:00:00Z" },
      { id: KITCHEN, household_id: HOUSEHOLD_ID, name: "Dapur", kind: "room", parent_id: FLOOR, created_at: "2026-10-01T00:00:00Z" },
    ],
    chores: [
      {
        id: DISHES,
        household_id: HOUSEHOLD_ID,
        title: "Cuci piring",
        category: "cleaning",
        status: "pending",
        due_date: "2026-11-01",
        recurrence: "daily",
        recurrence_interval: 1,
        recurrence_until: null,
        parent_task_id: null,
        assigned_to: STAFF_ID,
        location_id: KITCHEN,
      },
    ],
  });
  const sent = await stubApply(page, staff);
  const moved: unknown[] = [];
  await page.route("**/rest/v1/household_tasks*", async (route) => {
    if (route.request().method() === "PATCH") moved.push([new URL(route.request().url()).searchParams.get("id"), route.request().postDataJSON()]);
    await route.fallback();
  });

  await page.goto("/dashboard?module=access&page=staff");
  await page.getByRole("button", { name: "Add staff" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-staff-sheet");
  await sheet.getByLabel("Name").fill("Sri");
  const add = sheet.getByRole("button", { name: "Add Sri" });
  // One chip first: what she does decides what she sees (decision 2).
  await expect(add).toBeDisabled();
  await sheet.getByRole("button", { name: "Kitchen" }).click();
  await expect(sheet.getByText("Kitchen chores for Sri")).toBeVisible();
  const dishes = sheet.getByRole("checkbox", { name: /Wash the dishes/ });
  await expect(dishes).toContainText("now Ari's, move to Sri?");
  await expect(dishes).toHaveAttribute("aria-checked", "false");
  await expect(sheet.getByRole("checkbox", { name: /Clean the kitchen and stove/ })).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByRole("checkbox", { name: /Clean the freezer/ })).toHaveAttribute("aria-checked", "false");
  await dishes.click();
  await shot(page, "pr2-en-1-add-staff-sheet");
  await add.click();

  await expect(sheet.getByText("Sri is added")).toBeVisible();
  await expect(sheet.getByText("3 chores are Sri's from today.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Send one WhatsApp message" })).toBeVisible();
  await shot(page, "pr2-en-2-added");

  expect(sent).toHaveLength(1);
  const draft = sent[0] as { staff: unknown; chores: { title: string; assignee: unknown; place: string | null }[]; floors: unknown[]; rooms: { name: string }[] };
  expect(draft.staff).toEqual([{ key: "s:new", name: "Sri" }]);
  expect(draft.chores.map((c) => c.title)).toEqual(["Bersihkan dapur dan kompor", "Bersihkan kulkas"]);
  expect(draft.chores.every((c) => JSON.stringify(c.assignee) === '{"staff":"s:new"}' && c.place)).toBe(true);
  expect(draft.rooms.map((r) => r.name)).toEqual(["Dapur"]);
  await expect.poll(() => staff.find((p) => p.id === NEW_ID)?.hidden_areas).toEqual(["home", "pets", "repairs"]);
  await expect.poll(() => moved).toEqual([[`eq.${DISHES}`, { assigned_to: NEW_ID }]]);

  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Sri", { exact: true })).toBeVisible();
});

test("id: Tambah staf: a name already on the list is said, Tugas rumah and Hewan set what Wati sees", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, { owner: { locale: "id" }, staff, household: { hasPets: true }, features: { repairs: true } });
  const sent = await stubApply(page, staff);

  await page.goto("/dashboard?module=access&page=staff");
  await page.getByRole("button", { name: "Tambah staf" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-staff-sheet");
  await sheet.getByLabel("Nama").fill(" ari ");
  await sheet.getByRole("button", { name: "Tugas rumah" }).click();
  await expect(sheet.getByText("Ari sudah ada di daftar staf.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Tambah ari" })).toBeDisabled();

  await sheet.getByLabel("Nama").fill("Wati");
  await sheet.getByRole("button", { name: "Hewan" }).click();
  await expect(sheet.getByText("Tugas untuk siapa saja juga tampil untuk Wati.", { exact: false })).toBeVisible();
  // No kitchen list without Dapur.
  await expect(sheet.getByText("Tugas dapur untuk Wati")).toHaveCount(0);
  await shot(page, "pr2-id-1-add-staff-sheet");
  await sheet.getByRole("button", { name: "Tambah Wati" }).click();
  await expect(sheet.getByText("Wati sudah ditambahkan")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Kirim satu pesan WhatsApp" })).toBeVisible();
  await shot(page, "pr2-id-2-added");
  expect((sent[0] as { chores: unknown[] }).chores).toEqual([]);
  await expect.poll(() => staff.find((p) => p.id === NEW_ID)?.hidden_areas).toEqual(["kitchen", "repairs"]);
});

test("en: rooms that fail to load offer Try again, instead of a spinner that never ends (Codex, PR #170)", async ({ context, page }) => {
  const staff = roster();
  const roomsFail = { on: true };
  await installStub(context, { owner: { locale: "en" }, staff, household: { hasPets: true }, rooms: [], roomsFail });
  await page.goto("/dashboard?module=access&page=staff");
  await page.getByRole("button", { name: "Add staff" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-staff-sheet");
  await sheet.getByLabel("Name").fill("Sri");
  await sheet.getByRole("button", { name: "Kitchen" }).click();
  await expect(sheet.getByText("Couldn't load your rooms.")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Add Sri" })).toBeDisabled();
  roomsFail.on = false;
  await sheet.getByRole("button", { name: "Try again" }).click();
  await expect(sheet.getByRole("checkbox", { name: /Wash the dishes/ })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Add Sri" })).toBeEnabled();
});
