import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER, OWNER_PROFILE_ID, STAFF_ID, installStub } from "./stub-backend";

// Kakak sets what a staff member sees (Phase 178 follow-up). The card says
// what each switch will be; Save writes hidden_areas through the owner's
// own switches' path (a PATCH on staff_profiles), on top of the list as it
// is then; Undo takes back only what the card changed.

const SYAM = "00000000-0000-4000-8000-00000000c002";
const person = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  household_id: HOUSEHOLD_ID,
  name,
  has_pin: true,
  user_id: null,
  archived_at: null,
  hidden_areas: [] as string[],
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});

/** Kakak, as read before another owner turned Syam's pet routines off. */
const hideKitchenAndRepairs = {
  kind: "staff_areas",
  staffId: SYAM,
  staffName: "Syam",
  show: [],
  hide: ["kitchen", "repairs"],
  before: [],
  areas: ["home", "pets", "kitchen", "repairs"],
  nobody: [],
};

async function answerKakak(page: Page, item: Record<string, unknown>) {
  const outcomes: string[] = [];
  await page.route("**/api/kakak", (route) =>
    route.fulfill({
      json: {
        kind: "suggestions",
        text: "Of course. Syam will only see chores for anyone and pet routines.",
        items: [item],
        requestId: "00000000-0000-4000-8000-0000000000c1",
        history: { messages: [] },
      },
    }),
  );
  await page.route("**/api/kakak/outcome", (route) => {
    outcomes.push(route.request().postDataJSON().result);
    return route.fulfill({ json: { ok: true } });
  });
  return outcomes;
}

const patches = (stub: { writes: [string, string][] }) =>
  stub.writes.filter(([method, table]) => method === "PATCH" && table === "staff_profiles").length;

test("English: the card says what Syam will see, Save keeps another owner's change, and Undo takes back only its own", async ({
  context,
  page,
}) => {
  // Since Kakak read the household, another owner turned Syam's pet routines off.
  const staff = [person(STAFF_ID, "Ari"), person(SYAM, "Syam", { hidden_areas: ["pets"] }), person(OWNER_PROFILE_ID, "Moshe", { user_id: OWNER })];
  const stub = await installStub(context, {
    owner: { locale: "en" },
    kakak: { allowed: true, enabled: true },
    staff,
    household: { hasPets: true },
    features: { repairs: true },
  });
  const outcomes = await answerKakak(page, hideKitchenAndRepairs);
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Hide the kitchen and repairs from Syam");
  await page.getByRole("button", { name: "Send" }).click();

  // One row per switch, with what changes marked; the dialog's own line under it.
  await expect(page.getByText("What Syam sees")).toBeVisible({ timeout: 20_000 });
  const rows = page.locator("dl");
  await expect(rows).toContainText("Chores for anyoneOn");
  await expect(rows).toContainText("Pet routinesOn");
  await expect(rows).toContainText("KitchenOff (was on)");
  await expect(rows).toContainText("RepairsOff (was on)");
  await expect(page.getByText("Anything you give Syam by name always shows.")).toBeVisible();
  expect(patches(stub)).toBe(0); // nothing saved before Save

  await page.getByRole("button", { name: "Save", exact: true }).click();
  // On top of the list as it is now: the other owner's pets stays off.
  await expect.poll(() => staff.find((p) => p.id === SYAM)?.hidden_areas).toEqual(["pets", "kitchen", "repairs"]);
  expect(staff.find((p) => p.id === STAFF_ID)?.hidden_areas).toEqual([]);
  await expect(page.getByText("Saved — What Syam sees")).toBeVisible();
  await expect.poll(() => outcomes).toEqual(["confirmed"]);

  await page.getByRole("button", { name: "Undo" }).click();
  // Only what the card changed comes back: pets stays as the other owner left it.
  await expect.poll(() => staff.find((p) => p.id === SYAM)?.hidden_areas).toEqual(["pets"]);
  await expect(page.getByText("Undone.")).toBeVisible();
  await expect.poll(() => outcomes).toEqual(["confirmed", "undone"]);
  expect(patches(stub)).toBe(2);
  expect(stub.seen.realBackend).toEqual([]);
});

test("Cancel saves nothing, and the card warns when nobody would see pet routines", async ({ context, page }) => {
  const staff = [person(STAFF_ID, "Ari", { hidden_areas: ["pets"] }), person(SYAM, "Syam"), person(OWNER_PROFILE_ID, "Moshe", { user_id: OWNER })];
  const stub = await installStub(context, {
    owner: { locale: "en" },
    kakak: { allowed: true, enabled: true },
    staff,
    household: { hasPets: true },
    features: { repairs: true },
  });
  const outcomes = await answerKakak(page, { ...hideKitchenAndRepairs, hide: ["pets"], nobody: ["pets"] });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Syam doesn't need the pet routines");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.locator("dl")).toContainText("Pet routinesOff (was on)", { timeout: 20_000 });
  await expect(page.getByText(/Nobody would see pet routines, so every staff member will see them\./)).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect.poll(() => outcomes).toEqual(["cancelled"]);
  expect(patches(stub)).toBe(0);
  expect(staff.find((p) => p.id === SYAM)?.hidden_areas).toEqual([]);
});

test("Bahasa Indonesia, practice mode: the real route reads the request, and Simpan saves Ari's areas", async ({ context, page }) => {
  // No page.route for /api/kakak: the test server runs it with
  // KAKAK_PRACTICE=true (playwright.config.ts), answered by server-stub.cjs.
  const staff = [person(STAFF_ID, "Ari"), person(OWNER_PROFILE_ID, "Moshe", { user_id: OWNER })];
  const stub = await installStub(context, {
    owner: { locale: "id" },
    kakak: { allowed: true, enabled: true },
    staff,
    household: { hasPets: true },
    features: { repairs: true },
  });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Bilang ke Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "Mau Kakak atur apa?" }).fill("Sembunyikan Dapur dan Perbaikan dari Ari");
  await page.getByRole("button", { name: "Kirim" }).click();

  await expect(page.getByText(/^Mode latihan:/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Yang dilihat Ari")).toBeVisible();
  const rows = page.locator("dl");
  await expect(rows).toContainText("Tugas untuk siapa sajaAktif");
  await expect(rows).toContainText("Rutinitas hewanAktif");
  await expect(rows).toContainText("DapurMati (sebelumnya aktif)");
  await expect(rows).toContainText("PerbaikanMati (sebelumnya aktif)");
  await expect(page.getByText("Tugas yang Anda berikan langsung ke Ari selalu terlihat.")).toBeVisible();

  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await expect.poll(() => staff.find((p) => p.id === STAFF_ID)?.hidden_areas).toEqual(["kitchen", "repairs"]);
  await expect(page.getByText("Tersimpan — Yang dilihat Ari")).toBeVisible();
  expect(patches(stub)).toBe(1);
  expect(stub.seen.realBackend).toEqual([]);
});

test("a page from before this card (v2) is asked to reopen Miamus, and nothing is saved", async ({ context, page }) => {
  const staff = [person(STAFF_ID, "Ari"), person(OWNER_PROFILE_ID, "Moshe", { user_id: OWNER })];
  const stub = await installStub(context, {
    owner: { locale: "en" },
    kakak: { allowed: true, enabled: true },
    staff,
    household: { hasPets: true },
    features: { repairs: true },
  });
  // The real route in practice mode, asked as a page loaded before the
  // staff-areas card existed would ask it.
  await page.route("**/api/kakak", (route) =>
    route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), v: 2 }) }),
  );
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  await page.getByRole("textbox", { name: "What should I set up?" }).fill("Hide the kitchen and repairs from Ari");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("I've just been updated. Please close Miamus, open it again, and tell me once more.")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("What Ari sees")).toHaveCount(0);
  expect(patches(stub)).toBe(0);
  expect(staff.find((p) => p.id === STAFF_ID)?.hidden_areas).toEqual([]);
});
