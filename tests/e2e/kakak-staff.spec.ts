import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER, OWNER_PROFILE_ID, STAFF_ID, installStub } from "./stub-backend";

// Staff onboarding step 5: Kakak's add_staff and remove_staff cards. The add
// card opens the Add staff sheet filled in, which saves at once (the card was
// the confirmation) and shows the welcome; the remove card archives with
// give_to, as the remove card does by hand. A name that matches someone who
// left is brought back instead. English and Bahasa Indonesia.
//
// Phone-size screenshots when SHOTS_DIR is set.

const DIR = process.env.SHOTS_DIR;
test.use({ viewport: { width: 390, height: 844 } });

const SYAM = "00000000-0000-4000-8000-00000000c002";
const YANTI = "00000000-0000-4000-8000-00000000c0b2";
const NEW_ID = "00000000-0000-4000-8000-00000000c0aa";
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
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

async function answerKakak(page: Page, text: string, item: Record<string, unknown>) {
  const outcomes: string[] = [];
  await page.route("**/api/kakak", (route) =>
    route.fulfill({
      json: { kind: "suggestions", text, items: [item], requestId: "00000000-0000-4000-8000-0000000000c5", history: { messages: [] } },
    }),
  );
  await page.route("**/api/kakak/outcome", (route) => {
    outcomes.push(route.request().postDataJSON().result);
    return route.fulfill({ json: { ok: true } });
  });
  return outcomes;
}

async function stubStaffWrites(page: Page, staff: Record<string, unknown>[]) {
  const calls: [string, unknown][] = [];
  const find = (id: string) => staff.find((p) => p.id === id)!;
  await page.route("**/rest/v1/rpc/apply_household_setup*", async (route) => {
    const { p_draft } = route.request().postDataJSON() as { p_draft: { staff: { name: string }[]; chores: unknown[] } };
    calls.push(["apply", p_draft]);
    // Bringing someone back sends their chores with no new person.
    if (p_draft.staff.length > 0) staff.push(person(NEW_ID, p_draft.staff[0].name, { has_pin: false, created_at: new Date().toISOString() }));
    await route.fulfill({
      json: {
        rooms_added: 0,
        chores_added: p_draft.chores.length,
        bills_added: 0,
        staff_added: p_draft.staff.length,
        skipped: 0,
        staff: p_draft.staff.length > 0 ? { "s:new": NEW_ID } : {},
      },
    });
  });
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
  await page.route("**/rest/v1/rpc/my_house_code*", (route) => route.fulfill({ json: "K7PM2Q" }));
  await page.route("**/rest/v1/rpc/staff_claim_link*", (route) => route.fulfill({ json: "ABCDEFGHJK" }));
  return calls;
}

async function tellKakak(page: Page, locale: "en" | "id", words: string) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: locale === "id" ? "Bilang ke Kakak" : "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: locale === "id" ? "Mau Kakak atur apa?" : "What should I set up?" }).fill(words);
  await page.getByRole("button", { name: locale === "id" ? "Kirim" : "Send" }).click();
}

test("en: Add a new cook, Sri: the card, one tap adds Sri with Kitchen only, and the welcome is ready", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true }, staff, household: { hasPets: true } });
  const outcomes = await answerKakak(page, "Of course. I'll add Sri for the kitchen.", {
    kind: "add_staff",
    name: "Sri",
    areas: ["kitchen"],
    starterChores: true,
    trialDays: 0,
  });
  const calls = await stubStaffWrites(page, staff);
  await tellKakak(page, "en", "Add a new cook, Sri");

  await expect(page.getByText("New staff: Sri")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("dl")).toContainText("DoesKitchen");
  await expect(page.locator("dl")).toContainText("The kitchen's usual chores, ticked");
  await shot(page, "pr5-en-1-kakak-add-card");
  expect(calls).toEqual([]); // nothing saved before the tap

  await page.getByRole("button", { name: "Add Sri" }).click();
  const sheet = page.getByTestId("add-staff-sheet");
  await expect(sheet.getByText("Sri is added")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Send welcome on WhatsApp" })).toBeEnabled();
  await shot(page, "pr5-en-2-kakak-added");
  const [kind, draft] = calls[0] as [string, { staff: unknown; chores: { title: string }[] }];
  expect(kind).toBe("apply");
  expect(draft.staff).toEqual([{ key: "s:new", name: "Sri" }]);
  expect(draft.chores.map((c) => c.title)).toEqual(["Cuci piring", "Bersihkan dapur dan kompor", "Bersihkan kulkas"]);
  await expect.poll(() => staff.find((p) => p.id === NEW_ID)?.hidden_areas).toEqual(["home", "pets", "repairs"]);
  await expect.poll(() => outcomes).toEqual(["confirmed"]);

  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("New staff: Sri")).toHaveCount(0);
});

test("id: Syam sudah tidak kerja di sini: the card, and Hapus Syam gives his work to Ari", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true }, staff, household: { hasPets: true } });
  const outcomes = await answerKakak(page, "Baik. Tugas Syam Kakak berikan ke Ari.", {
    kind: "remove_staff",
    staffId: SYAM,
    staffName: "Syam",
    giveTo: { staffId: STAFF_ID, name: "Ari" },
  });
  const calls = await stubStaffWrites(page, staff);
  await tellKakak(page, "id", "Syam sudah tidak kerja di sini");

  await expect(page.getByText("Syam berhenti hari ini")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("dl")).toContainText("Tugasnya diberikan keAri");
  await expect(page.getByText("Bisa dikembalikan nanti di Pengaturan → Staf.")).toBeVisible();
  await shot(page, "pr5-id-1-kakak-remove-card");
  expect(calls).toEqual([]);

  await page.getByRole("button", { name: "Hapus Syam" }).click();
  await expect(page.getByText("Syam dihapus. Tugasnya sekarang milik Ari. HP staf lain tetap masuk.")).toBeVisible();
  expect(calls).toEqual([["archive", { p_staff_id: SYAM, p_give_to: STAFF_ID }]]);
  await expect.poll(() => outcomes).toEqual(["confirmed"]);
});

test("en: Yanti is back: the phone knows she left, and the card brings her back", async ({ context, page }) => {
  const staff = [...roster(), person(YANTI, "Yanti", { has_pin: false, archived_at: "2026-09-01T00:00:00Z", created_at: "2026-03-01T00:00:00Z" })];
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true }, staff, household: { hasPets: true } });
  await answerKakak(page, "Welcome back, Yanti. I'll set her up for the house.", {
    kind: "add_staff",
    name: "Yanti",
    areas: ["home"],
    starterChores: false,
    trialDays: 0,
  });
  const calls = await stubStaffWrites(page, staff);
  await tellKakak(page, "en", "Yanti is back from tomorrow");

  await page.getByRole("button", { name: "Bring Yanti back" }).click({ timeout: 20_000 });
  await expect(page.getByTestId("add-staff-sheet").getByText("Yanti is back")).toBeVisible();
  expect(calls).toEqual([["restore", { p_staff_id: YANTI }]]);
  // The confirmed card applies on the way back (Codex, PR #173): she sees the house only.
  await expect.poll(() => staff.find((p) => p.id === YANTI)?.hidden_areas).toEqual(["pets", "kitchen", "repairs"]);
});

test("en: on a two-week trial: Sri is added and My tasks gets the owner's reminder to decide, in the same save", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true }, staff, household: { hasPets: true } });
  await answerKakak(page, "Of course. Sri for the kitchen, on a two-week trial.", {
    kind: "add_staff",
    name: "Sri",
    areas: ["kitchen"],
    starterChores: false,
    trialDays: 14,
  });
  const calls = await stubStaffWrites(page, staff);
  await tellKakak(page, "en", "Add a new cook, Sri, on a two-week trial");
  await expect(page.locator("dl")).toContainText("Trial2 weeks, then a reminder to decide", { timeout: 20_000 });
  await page.getByRole("button", { name: "Add Sri" }).click();
  const sheet = page.getByTestId("add-staff-sheet");
  await expect(sheet.getByText("Sri is added")).toBeVisible();
  await expect(sheet.getByText("My tasks reminds you to decide on Sri's trial.", { exact: false })).toBeVisible();
  const [, draft] = calls[0] as [string, { chores: Record<string, unknown>[] }];
  // No starter chores (Kakak said none), only the owner's reminder, 14 days on, with a push on the day.
  expect(draft.chores).toEqual([
    expect.objectContaining({ title: "Decide on Sri's trial", assignee: { me: true }, remind: 0, recurrence: "none", category: "errand" }),
  ]);
});

test("id: someone named on the remove card left meanwhile: nothing is removed, and the owner is asked again (Codex, PR #173)", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, { owner: { locale: "id" }, kakak: { allowed: true, enabled: true }, staff, household: { hasPets: true } });
  await answerKakak(page, "Baik. Tugas Syam Kakak berikan ke Ari.", {
    kind: "remove_staff",
    staffId: SYAM,
    staffName: "Syam",
    giveTo: { staffId: STAFF_ID, name: "Ari" },
  });
  const calls = await stubStaffWrites(page, staff);
  await tellKakak(page, "id", "Syam sudah tidak kerja di sini");
  await expect(page.getByText("Syam berhenti hari ini")).toBeVisible({ timeout: 20_000 });
  // Another owner removed Ari after Kakak prepared the card.
  staff.find((p) => p.id === STAFF_ID)!.archived_at = new Date().toISOString();
  await page.getByRole("button", { name: "Hapus Syam" }).click();
  await expect(page.getByText("Ari sudah tidak ada di daftar staf. Bilang ke Kakak siapa yang mengambil tugasnya.")).toBeVisible();
  expect(calls).toEqual([]);
});

test("en: Yanti is back for the kitchen: her kitchen chores come with her, once they are read (Codex, PR #173)", async ({ context, page }) => {
  const staff = [...roster(), person(YANTI, "Yanti", { has_pin: false, archived_at: "2026-09-01T00:00:00Z", created_at: "2026-03-01T00:00:00Z" })];
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true }, staff, household: { hasPets: true }, chores: [] });
  // The household's chores answer slowly: the card must wait for them.
  await page.route("**/rest/v1/household_tasks*", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.fallback();
  });
  await answerKakak(page, "Welcome back, Yanti. Kitchen it is.", {
    kind: "add_staff",
    name: "Yanti",
    areas: ["kitchen"],
    starterChores: true,
    trialDays: 0,
  });
  const calls = await stubStaffWrites(page, staff);
  await tellKakak(page, "en", "Yanti is back, she cooks for us");
  await page.getByRole("button", { name: "Bring Yanti back" }).click({ timeout: 20_000 });
  await expect(page.getByTestId("add-staff-sheet").getByText("Yanti is back")).toBeVisible({ timeout: 20_000 });
  expect(calls.map(([kind]) => kind)).toEqual(["restore", "apply"]);
  const [, draft] = calls[1] as [string, { staff: unknown[]; chores: { title: string; assignee: unknown }[] }];
  expect(draft.staff).toEqual([]);
  expect(draft.chores.map((c) => c.title)).toEqual(["Cuci piring", "Bersihkan dapur dan kompor", "Bersihkan kulkas"]);
  expect(draft.chores.every((c) => JSON.stringify(c.assignee) === JSON.stringify({ profile: YANTI }))).toBe(true);
});
