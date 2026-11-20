import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID, MOCHI, SCHEDULES } from "../fixtures/household";
import { OWNER, OWNER_PROFILE_ID, STAFF_ID, STUB_URL, freshSession, installStub } from "./stub-backend";

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
    confirm: "Remove Syam",
    anything: "Anything of Syam's still open goes to:",
    toast: "Syam removed. Other staff phones stay signed in.",
    signIn: "The code changes when you remove someone; phones already signed in stay signed in.",
    entry: "Adding a new staff member",
    entryBody: "their name, and what they do",
    leaves: "When someone leaves",
  },
  id: {
    add: "Tambah staf",
    remove: "Hapus Syam",
    confirm: "Hapus Syam",
    anything: "Tugas Syam yang masih terbuka diberikan ke:",
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
    // Nothing of Syam's is counted, but who takes anything still open is
    // asked anyway (code review, PR #172): Ari, the one other person here.
    await expect(page.getByRole("dialog").getByText(c.anything)).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("button", { name: "Ari" })).toHaveAttribute("aria-pressed", "true");
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
  await expect(sheet.getByRole("button", { name: "Send welcome on WhatsApp" })).toBeVisible();
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
  await expect(sheet.getByRole("button", { name: "Kirim sambutan lewat WhatsApp" })).toBeVisible();
  await shot(page, "pr2-id-2-added");
  expect((sent[0] as { chores: unknown[] }).chores).toEqual([]);
  await expect.poll(() => staff.find((p) => p.id === NEW_ID)?.hidden_areas).toEqual(["kitchen", "repairs"]);
});

// Step 3: the personal welcome. Her name in the message, her roster id in
// the link's fragment so the names step asks "Anda Sri?", the privacy line
// (decision 10), and the same link as a QR code drawn on the owner's phone.

async function stubCodes(page: Page) {
  await page.route("**/rest/v1/rpc/my_house_code*", (route) => route.fulfill({ json: "K7PM2Q" }));
  await page.route("**/rest/v1/rpc/staff_claim_link*", (route) => route.fulfill({ json: "ABCDEFGHJK" }));
  // WhatsApp opens in a new window: keep the address instead.
  await page.addInitScript(() => {
    (window as unknown as { opened: string[] }).opened = [];
    window.open = ((url: string) => {
      (window as unknown as { opened: string[] }).opened.push(url);
      return null;
    }) as typeof window.open;
  });
}
const opened = (page: Page) => page.evaluate(() => (window as unknown as { opened: string[] }).opened);

test("en: after Add, Sri's own welcome: her name, her link, the privacy line, and a QR code", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, { owner: { locale: "en" }, staff, household: { hasPets: true } });
  await stubApply(page, staff);
  await stubCodes(page);

  await page.goto("/dashboard?module=access&page=staff");
  await page.getByRole("button", { name: "Add staff" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-staff-sheet");
  await sheet.getByLabel("Name").fill("Sri");
  await sheet.getByRole("button", { name: "Chores" }).click();
  await sheet.getByRole("button", { name: "Add Sri" }).click();
  await expect(sheet.getByText("Sri is added")).toBeVisible();

  await sheet.getByRole("button", { name: "Show QR code" }).click();
  await expect(sheet.getByRole("img", { name: "QR code for Sri" })).toBeVisible();
  await shot(page, "pr3-en-1-welcome-qr");

  await sheet.getByRole("button", { name: "Send welcome on WhatsApp" }).click();
  const [url] = await opened(page);
  const text = new URL(url).searchParams.get("text") ?? "";
  const origin = new URL(page.url()).origin;
  expect(text).toBe(
    `Halo Sri, selamat datang. Ini Miamus, aplikasi rumah kita. Buka link ini lalu buat PIN 4 angka: ${origin}/join/code#c=K7P-M2Q&k=ABCDEFGHJK&s=${NEW_ID}\n` +
      `Miamus mencatat tugas, foto, dan cuti Anda. Info: ${origin}/privasi`
  );
});

test("id: a person added this week who hasn't signed in has Kirim sambutan on their row", async ({ context, page }) => {
  const staff = [...roster(), person(NEW_ID, "Sri", { has_pin: false, created_at: new Date().toISOString() })];
  await installStub(context, { owner: { locale: "id" }, staff, household: { hasPets: true } });
  await stubCodes(page);
  await page.goto("/dashboard?module=access&page=staff");
  // Only Sri: Ari and Syam have PINs.
  await expect(page.getByRole("button", { name: "Kirim sambutan" })).toHaveCount(1, { timeout: 20_000 });
  await page.getByRole("button", { name: "Kirim sambutan" }).click();
  const dialog = page.getByRole("dialog", { name: "Sambut Sri" });
  await expect(dialog.getByRole("button", { name: "Kirim sambutan lewat WhatsApp" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Tampilkan kode QR" }).click();
  await expect(dialog.getByRole("img", { name: "Kode QR untuk Sri" })).toBeVisible();
  await shot(page, "pr3-id-1-row-welcome-qr");
});

test("staff: her own link asks Anda Sri?; Ya goes to Buat PIN for her, Bukan shows everyone", async ({ context, page }) => {
  const SRI = "00000000-0000-4000-8000-00000000c102";
  await installStub(context, { stored: freshSession() });
  const claims: Record<string, unknown>[] = [];
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (name === "house_code_roster") {
      return route.fulfill({
        json: [
          { id: "00000000-0000-4000-8000-00000000c101", name: "Ari", has_pin: true, claimable: false },
          { id: SRI, name: "Sri", has_pin: false, claimable: true },
          { id: "00000000-0000-4000-8000-00000000c103", name: "Sari", has_pin: false, claimable: true },
        ],
      });
    }
    if (name === "claim_staff_with_house_code") {
      claims.push(route.request().postDataJSON());
      return route.fulfill({ json: { status: "ok", household_id: HOUSEHOLD_ID } });
    }
    return route.fallback();
  });

  await page.goto(`/join/code#c=K7P-M2Q&k=ABCDEFGHJK&s=${SRI}`);
  await expect(page.getByRole("heading", { name: "Anda Sri?" })).toBeVisible({ timeout: 20_000 });
  expect(new URL(page.url()).hash).toBe("");
  await shot(page, "pr3-staff-id-1-anda-sri");
  await page.getByRole("button", { name: "Bukan" }).click();
  await expect(page.getByRole("heading", { name: "Siapa yang bertugas?" })).toBeVisible();
  await shot(page, "pr3-staff-id-2-bukan-names");

  // A fresh load (the same address with a new hash would not reload).
  await page.goto("about:blank");
  await page.goto(`/join/code#c=K7P-M2Q&k=ABCDEFGHJK&s=${SRI}`);
  await page.getByRole("button", { name: "Ya" }).click({ timeout: 20_000 });
  await expect(page.getByText("Buat PIN", { exact: true })).toBeVisible();
  await shot(page, "pr3-staff-id-3-buat-pin");
  for (const d of "2468") await page.getByRole("button", { name: d, exact: true }).click();
  await expect(page.getByText("Ulangi PIN")).toBeVisible();
  const linked = page.waitForURL(/\/staff/);
  for (const d of "2468") await page.getByRole("button", { name: d, exact: true }).click();
  await linked;
  expect(claims).toEqual([{ p_code: "K7P-M2Q", p_staff_id: SRI, p_new_pin: "2468", p_claim: "ABCDEFGHJK" }]);
  // Her first day starts on this phone (step 8).
  expect(JSON.parse((await page.evaluate(() => window.localStorage.getItem("miamus:first-day"))) ?? "{}").staffId).toBe(SRI);
});

test("staff: a link naming someone not on the list just shows the names", async ({ context, page }) => {
  await installStub(context, { stored: freshSession() });
  await context.route(`${STUB_URL}/rest/v1/rpc/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (name === "house_code_roster") {
      return route.fulfill({ json: [{ id: "00000000-0000-4000-8000-00000000c103", name: "Sari", has_pin: false, claimable: true }] });
    }
    return route.fallback();
  });
  await page.goto("/join/code#c=K7P-M2Q&k=ABCDEFGHJK&s=00000000-0000-4000-8000-00000000c999");
  await expect(page.getByRole("heading", { name: "Siapa yang bertugas?" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /^Anda / })).toHaveCount(0);
});

// Step 4: the remove card with "give to" (decision 7), bringing someone back
// with a fresh welcome link, and Remove for good (decision 5).

const WATI = "00000000-0000-4000-8000-00000000c0b1";
const YANTI = "00000000-0000-4000-8000-00000000c0b2";
const GINA = "00000000-0000-4000-8000-00000000c0b3";

async function stubStaffRpcs(page: Page, staff: Record<string, unknown>[]) {
  const calls: [string, unknown][] = [];
  const find = (id: string) => staff.find((p) => p.id === id)!;
  await page.route("**/rest/v1/rpc/archive_staff_profile*", async (route) => {
    const body = route.request().postDataJSON() as { p_staff_id: string };
    calls.push(["archive", body]);
    Object.assign(find(body.p_staff_id), { archived_at: new Date().toISOString(), has_pin: false });
    await route.fulfill({ json: find(body.p_staff_id) });
  });
  await page.route("**/rest/v1/rpc/restore_staff_profile*", async (route) => {
    const body = route.request().postDataJSON() as { p_staff_id: string };
    calls.push(["restore", body]);
    Object.assign(find(body.p_staff_id), { archived_at: null, claimable_from: new Date().toISOString() });
    await route.fulfill({ json: find(body.p_staff_id) });
  });
  await page.route("**/rest/v1/rpc/forget_staff_profile*", async (route) => {
    const body = route.request().postDataJSON() as { p_staff_id: string };
    calls.push(["forget", body]);
    Object.assign(find(body.p_staff_id), { name: "Mantan staf", forgotten_at: new Date().toISOString() });
    await route.fulfill({ json: null });
  });
  return calls;
}

test("en: removing Sri suggests Wati, who also has Kitchen, and her chore goes to Wati", async ({ context, page }) => {
  const staff = [
    person(STAFF_ID, "Ari", { hidden_areas: ["kitchen"] }),
    person(NEW_ID, "Sri", { hidden_areas: ["home", "pets", "repairs"] }),
    person(WATI, "Wati", { hidden_areas: ["home", "pets", "repairs"] }),
    person(OWNER_PROFILE_ID, "Moshe", { user_id: OWNER }),
  ];
  await installStub(context, {
    owner: { locale: "en" },
    staff,
    household: { hasPets: true },
    chores: [
      {
        id: DISHES, household_id: HOUSEHOLD_ID, title: "Cuci piring", category: "cleaning", status: "pending",
        due_date: "2026-11-01", recurrence: "daily", recurrence_interval: 1, recurrence_until: null,
        parent_task_id: null, assigned_to: NEW_ID, location_id: null,
      },
    ],
  });
  const calls = await stubStaffRpcs(page, staff);
  await page.goto("/dashboard?module=access&page=staff");
  await page.getByRole("button", { name: "Remove Sri" }).click({ timeout: 20_000 });
  const card = page.getByRole("dialog", { name: "Sri leaves today" });
  await expect(card.getByText("Sri's 1 chore goes to:")).toBeVisible();
  await expect(card.getByRole("button", { name: "Wati" })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("button", { name: "Anyone" })).toHaveAttribute("aria-pressed", "false");
  await expect(card.getByRole("button", { name: "Moshe" })).toHaveCount(0);
  await shot(page, "pr4-en-1-remove-card");
  await card.getByRole("button", { name: "Remove Sri" }).click();
  await expect(page.getByText("Sri removed. Their task is Wati's now. Other staff phones stay signed in.")).toBeVisible();
  expect(calls).toEqual([["archive", { p_staff_id: NEW_ID, p_give_to: WATI }]]);
});

test("en: Anyone sends the one-argument call older databases know", async ({ context, page }) => {
  const staff = [person(STAFF_ID, "Ari"), person(NEW_ID, "Sri"), person(OWNER_PROFILE_ID, "Moshe", { user_id: OWNER })];
  await installStub(context, {
    owner: { locale: "en" },
    staff,
    household: { hasPets: true },
    chores: [
      {
        id: DISHES, household_id: HOUSEHOLD_ID, title: "Cuci piring", category: "cleaning", status: "pending",
        due_date: "2026-11-01", recurrence: "daily", recurrence_interval: 1, recurrence_until: null,
        parent_task_id: null, assigned_to: NEW_ID, location_id: null,
      },
    ],
  });
  const calls = await stubStaffRpcs(page, staff);
  await page.goto("/dashboard?module=access&page=staff");
  await page.getByRole("button", { name: "Remove Sri" }).click({ timeout: 20_000 });
  const card = page.getByRole("dialog", { name: "Sri leaves today" });
  await card.getByRole("button", { name: "Anyone" }).click();
  await card.getByRole("button", { name: "Remove Sri" }).click();
  await expect(page.getByText("Sri removed. Their task is for anyone now. Other staff phones stay signed in.")).toBeVisible();
  expect(calls).toEqual([["archive", { p_staff_id: NEW_ID }]]);
});

test("id: Kembalikan opens Yanti's welcome straight away; Hapus permanen takes two taps", async ({ context, page }) => {
  const staff = [
    ...roster(),
    person(YANTI, "Yanti", { has_pin: false, archived_at: "2026-09-01T00:00:00Z", created_at: "2026-03-01T00:00:00Z" }),
    person(GINA, "Gina", { has_pin: false, archived_at: "2026-08-01T00:00:00Z", created_at: "2026-02-01T00:00:00Z" }),
  ];
  await installStub(context, { owner: { locale: "id" }, staff, household: { hasPets: true } });
  const calls = await stubStaffRpcs(page, staff);
  await stubCodes(page);
  await page.goto("/dashboard?module=access&page=staff");
  await expect(page.getByText("Namanya tetap tercatat pada pekerjaan sebelumnya selama 12 bulan", { exact: false })).toBeVisible({ timeout: 20_000 });
  await shot(page, "pr4-id-1-no-longer-here");

  // Gina: the first tap only arms it.
  await page.getByRole("button", { name: "Hapus permanen" }).last().click();
  await expect(page.getByRole("button", { name: "Ketuk lagi untuk menghapus permanen" })).toBeVisible();
  expect(calls).toEqual([]);
  await page.getByRole("button", { name: "Ketuk lagi untuk menghapus permanen" }).click();
  await expect(page.getByText("Nama Gina sudah dihapus.", { exact: false })).toBeVisible();
  await expect(page.getByText("Gina", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Kembalikan" }).click();
  const welcome = page.getByRole("dialog", { name: "Sambut Yanti" });
  await expect(welcome.getByRole("button", { name: "Kirim sambutan lewat WhatsApp" })).toBeEnabled();
  await expect(page.getByText("Yanti kembali. Kirim sambutan supaya dia bisa membuat PIN baru.")).toBeVisible();
  await shot(page, "pr4-id-2-back-welcome");
  expect(calls).toEqual([
    ["forget", { p_staff_id: GINA }],
    ["restore", { p_staff_id: YANTI }],
  ]);
  // Her row offers the welcome again: the claim window counts from today.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Kirim sambutan" })).toHaveCount(1);
});

test("en: typing the name of someone who left offers to bring them back", async ({ context, page }) => {
  const staff = [...roster(), person(YANTI, "Yanti", { has_pin: false, archived_at: "2026-09-01T00:00:00Z", created_at: "2026-03-01T00:00:00Z" })];
  await installStub(context, { owner: { locale: "en" }, staff, household: { hasPets: true } });
  const calls = await stubStaffRpcs(page, staff);
  await stubCodes(page);
  await page.goto("/dashboard?module=access&page=staff");
  await page.getByRole("button", { name: "Add staff" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-staff-sheet");
  await sheet.getByLabel("Name").fill("yanti");
  await expect(sheet.getByText("Yanti used to work here.", { exact: false })).toBeVisible();
  await shot(page, "pr4-en-2-add-former");
  await sheet.getByRole("button", { name: "Bring Yanti back" }).click();
  await expect(sheet.getByText("Yanti is back")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Send welcome on WhatsApp" })).toBeEnabled();
  expect(calls).toEqual([["restore", { p_staff_id: YANTI }]]);
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

test("en: a trial for someone who does Chores: chores that fail to load say so, with Try again (Codex, PR #173)", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, { owner: { locale: "en" }, staff, household: { hasPets: true }, chores: [] });
  let fail = true;
  await page.route("**/rest/v1/household_tasks*", async (route) => {
    if (fail && route.request().method() === "GET") return route.fulfill({ status: 500, json: { message: "down" } });
    await route.fallback();
  });
  await page.goto("/dashboard?module=access&page=staff");
  await page.getByRole("button", { name: "Add staff" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-staff-sheet");
  await sheet.getByLabel("Name").fill("Wati");
  await sheet.getByRole("button", { name: "Chores" }).click();
  await sheet.getByRole("button", { name: "2 weeks" }).click();
  await expect(sheet.getByText("Couldn't load your chores.")).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByRole("button", { name: "Add Wati" })).toBeDisabled();
  fail = false;
  await sheet.getByRole("button", { name: "Try again" }).click();
  await expect(sheet.getByRole("button", { name: "Add Wati" })).toBeEnabled();

// Step 6: the trial reminder's two answers on Today (decision 3), and step 8:
// the first-day line on Tugas Hari Ini (decision 4).

const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const WATI_ID = "00000000-0000-4000-8000-00000000c0b1";
const trialTask = (title: string) => ({
  id: "00000000-0000-4000-8000-0000000006a1",
  household_id: HOUSEHOLD_ID,
  title,
  category: "errand",
  assigned_to: OWNER_PROFILE_ID,
  due_date: localDay(),
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
  remind_days_before: 0,
});

test("en: Decide on Wati's trial: Keep Wati marks it done", async ({ context, page }) => {
  const staff = [...roster(), person(WATI_ID, "Wati")];
  const stub = await installStub(context, { owner: { locale: "en" }, staff, household: { hasPets: true }, chores: [trialTask("Decide on Wati's trial")] });
  await page.goto("/dashboard");
  const mine = page.getByRole("region", { name: "My tasks" });
  await expect(mine.getByText("Decide on Wati's trial")).toBeVisible({ timeout: 20_000 });
  await expect(mine.getByRole("button", { name: "Wati is leaving" })).toBeVisible();
  await shot(page, "pr6-en-1-trial-reminder");
  await mine.getByRole("button", { name: "Keep Wati" }).click();
  await expect.poll(() => stub.writes.some(([m, t]) => m === "PATCH" && t === "household_tasks")).toBe(true);
});

test("id: Putuskan masa percobaan Wati: Wati berhenti opens the remove card, then the reminder is done", async ({ context, page }) => {
  const staff = [...roster(), person(WATI_ID, "Wati")];
  const stub = await installStub(context, { owner: { locale: "id" }, staff, household: { hasPets: true }, chores: [trialTask("Putuskan masa percobaan Wati")] });
  const archived: unknown[] = [];
  await page.route("**/rest/v1/rpc/archive_staff_profile*", async (route) => {
    const body = route.request().postDataJSON() as { p_staff_id: string };
    archived.push(body);
    Object.assign(staff.find((p) => p.id === body.p_staff_id)!, { archived_at: new Date().toISOString() });
    await route.fulfill({ json: null });
  });
  await page.goto("/dashboard");
  const mine = page.getByRole("region", { name: "Tugas saya" });
  await mine.getByRole("button", { name: "Wati berhenti" }).click({ timeout: 20_000 });
  const card = page.getByRole("dialog", { name: "Wati berhenti hari ini" });
  await expect(card).toBeVisible();
  await shot(page, "pr6-id-1-trial-leaving");
  await card.getByRole("button", { name: "Siapa saja" }).click();
  await card.getByRole("button", { name: "Hapus Wati" }).click();
  await expect(page.getByText("Wati dihapus. Tugasnya sekarang untuk siapa saja.")).toBeVisible();
  expect(archived).toEqual([{ p_staff_id: WATI_ID }]);
  await expect.poll(() => stub.writes.some(([m, t]) => m === "PATCH" && t === "household_tasks")).toBe(true);
});

test("staff: the first-day line, the day they joined only, gone once tapped", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.addInitScript(
    ([staffId, day]) => window.localStorage.setItem("miamus:first-day", JSON.stringify({ staffId, day })),
    [STAFF_ID, localDay()]
  );
  await page.goto("/staff");
  const line = page.getByTestId("first-day-line");
  await expect(line).toHaveText("Ini tugas Anda hari ini. Foto Sebelum, foto Sesudah, lalu ketuk Selesai.", { timeout: 20_000 });
  await shot(page, "pr8-staff-id-1-first-day");
  await line.click();
  await expect(line).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Ini tugas Anda hari ini.", { exact: false })).toHaveCount(0);
});

test("staff: no first-day line on another day", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.addInitScript(
    ([staffId]) => window.localStorage.setItem("miamus:first-day", JSON.stringify({ staffId, day: "2026-01-01" })),
    [STAFF_ID]
  );
  await page.goto("/staff");
  await expect(page.getByText("Tugas Hari Ini", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("first-day-line")).toHaveCount(0);
});

test("staff: a pet routine done today also ends the first-day line (Codex, PR #174)", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    logs: [
      {
        id: "00000000-0000-4000-8000-0000000174f1",
        schedule_id: SCHEDULES[0].id,
        entity_id: MOCHI.id,
        module: "pet",
        photo_url: null,
        notes: null,
        staff_id: STAFF_ID,
        completed_at: new Date().toISOString(),
        sub_type: "complete",
      },
    ],
  });
  await page.addInitScript(
    ([staffId, day]) => window.localStorage.setItem("miamus:first-day", JSON.stringify({ staffId, day })),
    [STAFF_ID, localDay()]
  );
  await page.goto("/staff");
  await expect(page.getByText("Tugas Hari Ini", { exact: false }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("first-day-line")).toHaveCount(0);
  // And the record on the phone is gone, not just hidden.
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("miamus:first-day"))).toBeNull();
});
