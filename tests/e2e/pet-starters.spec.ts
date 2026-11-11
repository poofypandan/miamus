import { expect, test, type Page } from "@playwright/test";
import { BENTO, MOCHI, schedule } from "../fixtures/household";
import { installStub } from "./stub-backend";

// Phase 173 PR B (docs/phase-173-pet-routines-plan.md, D8 and D9).
//
// Starter routines: after Add pet saves a pet, its usual routines are
// offered, ticked, with the household's own routines to join, unticked. One
// tap adds them; Skip adds nothing.
//
// Kakak: "lights off for both dogs at 21:30" through the real /api/kakak
// route in practice mode (scripted answers, no AI, playwright.config.ts),
// confirmed on the card and saved as one routine group, as the Add routine
// sheet saves it.

const LIGHTS = "00000000-0000-4000-8000-0000000173a1";
const lights = [MOCHI, BENTO].map((p) =>
  schedule(p, "Matikan lampu", ["21:30"], { kind: "lights", routine_group_id: LIGHTS, proof: "photo" })
);

async function addPet(page: Page, name: string, labels: { add: string; placeholder: string; save: string }) {
  await page.goto("/dashboard?module=pets");
  await page.getByRole("button", { name: labels.add }).last().click({ timeout: 20_000 });
  await page.getByPlaceholder(labels.placeholder).fill(name);
  await page.getByRole("button", { name: labels.save }).click();
}

const EN = { add: "Add Pet", placeholder: "e.g. Buddy", save: "Save pet" };
const ID = { add: "Tambah Hewan", placeholder: "mis. Buddy", save: "Simpan hewan" };

test("a new dog: the usual routines are ticked, a household routine can be joined, one tap adds them", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, schedules: lights as unknown as Record<string, unknown>[] });
  await addPet(page, "Coco", EN);

  const sheet = page.getByTestId("starter-routines-sheet");
  await expect(sheet.getByRole("heading", { name: "Usual routines for Coco" })).toBeVisible();
  await expect(sheet.getByRole("tab", { name: "Dog" })).toHaveAttribute("aria-selected", "true");
  const morning = sheet.getByRole("checkbox", { name: /^Morning walk/ });
  const evening = sheet.getByRole("checkbox", { name: /^Evening walk/ });
  const water = sheet.getByRole("checkbox", { name: /^Fresh water/ });
  const join = sheet.getByRole("checkbox", { name: /^Add Coco to Lights off/ });
  for (const box of [morning, evening, water]) await expect(box).toHaveAttribute("aria-checked", "true");
  await expect(join).toHaveAttribute("aria-checked", "false");
  await expect(sheet.getByText("with Mochi, Bento")).toBeVisible();

  // No evening walk; join lights off. Still one tap to add.
  await evening.click();
  await join.click();
  await sheet.getByRole("button", { name: "Add 3" }).click();
  await expect(page.getByText("3 routines added for Coco")).toBeVisible();
  await expect(sheet).toBeHidden();

  const coco = stub.entities.find((e) => e.name === "Coco")!;
  const mine = stub.schedules.filter((s) => s.entity_id === coco.id);
  expect(mine.map((s) => s.title).sort()).toEqual(["Ganti air minum", "Jalan pagi", "Matikan lampu"]);
  expect(mine.find((s) => s.title === "Jalan pagi")).toMatchObject({ kind: "walk", fixed_times: ["06:30"], proof: "three", expires_at: null });
  expect(mine.find((s) => s.title === "Ganti air minum")).toMatchObject({ kind: "water", fixed_times: ["08:00"], proof: "photo" });
  // Joined: the household's group, its time, and Mochi's and Bento's rows untouched.
  expect(mine.find((s) => s.title === "Matikan lampu")).toMatchObject({ kind: "lights", routine_group_id: LIGHTS, fixed_times: ["21:30"] });
  expect(stub.schedules.filter((s) => s.routine_group_id === LIGHTS)).toHaveLength(3);
  // Each starter is its own routine.
  const groups = new Set(mine.map((s) => s.routine_group_id));
  expect(groups.size).toBe(3);
});

test("Skip adds nothing; a cat gets a cat's list and is remembered as a cat", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" } });
  const before = stub.schedules.length;
  await addPet(page, "Kiki", ID);

  const sheet = page.getByTestId("starter-routines-sheet");
  await expect(sheet.getByRole("heading", { name: "Rutinitas biasa untuk Kiki" })).toBeVisible();
  await sheet.getByRole("button", { name: "Lewati" }).click();
  await expect(sheet).toBeHidden();
  expect(stub.schedules).toHaveLength(before);

  await addPet(page, "Mimi", ID);
  await expect(sheet.getByRole("heading", { name: "Rutinitas biasa untuk Mimi" })).toBeVisible();
  await sheet.getByRole("tab", { name: "Kucing" }).click();
  await expect(sheet.getByRole("checkbox")).toHaveCount(2);
  await expect(sheet.getByRole("checkbox", { name: /^Ganti air minum/ })).toHaveAttribute("aria-checked", "true");
  await expect(sheet.getByRole("checkbox", { name: /^Bersihkan pasir kucing/ })).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("button", { name: "Tambah 2" }).click();
  await expect(page.getByText("2 rutinitas ditambahkan untuk Mimi")).toBeVisible();

  const mimi = stub.entities.find((e) => e.name === "Mimi")!;
  expect(stub.schedules.filter((s) => s.entity_id === mimi.id).map((s) => [s.title, s.kind])).toEqual([
    ["Ganti air minum", "water"],
    ["Bersihkan pasir kucing", "other"],
  ]);
  await expect.poll(() => (mimi.metadata as { species?: string }).species).toBe("cat");
  // Kiki, skipped, has nothing and is no cat.
  const kiki = stub.entities.find((e) => e.name === "Kiki")!;
  expect(stub.schedules.filter((s) => s.entity_id === kiki.id)).toEqual([]);
  expect((kiki.metadata as { species?: string }).species).toBeUndefined();
});

test("Kakak: lights off for both dogs is one card, confirmed, saved as one routine", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard");

  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  // With two pets, the example is the owner's own sentence.
  await page.getByRole("button", { name: "Lights off for Mochi and Bento every day at 9:30 pm" }).click();
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/^Practice mode:/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Routine · Mochi & Bento")).toBeVisible();
  await expect(page.locator("dd").getByText("Lights off (Matikan lampu)", { exact: true })).toBeVisible();
  await expect(page.locator("dd").getByText("21:30", { exact: true })).toBeVisible();
  await expect(page.locator("dd").getByText("Every day", { exact: true })).toBeVisible();
  await expect(page.locator("dd").getByText("A photo", { exact: true })).toBeVisible();
  // Nothing is saved before the owner confirms.
  expect(stub.schedules.filter((s) => s.kind === "lights")).toEqual([]);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Kakak's Done: the benefit, then the routine as it now sits in the list.
  const done = page.getByTestId("kakak-saved");
  await expect(done.getByText("Done. Staff see it on Today at 21:30; a photo comes back each time.")).toBeVisible();
  await expect(done.getByText("Matikan lampu · 21:30")).toBeVisible();
  await expect(done.getByText("Mochi & Bento · Every day")).toBeVisible();
  await expect.poll(() => stub.schedules.filter((s) => s.kind === "lights").length).toBe(2);
  const made = stub.schedules.filter((s) => s.kind === "lights");
  expect(new Set(made.map((s) => s.entity_id))).toEqual(new Set([MOCHI.id, BENTO.id]));
  expect(new Set(made.map((s) => s.routine_group_id)).size).toBe(1);
  for (const row of made) {
    expect(row).toMatchObject({ title: "Matikan lampu", fixed_times: ["21:30"], proof: "photo", days_of_week: null, expires_at: null, staff_id: null });
  }
  expect(stub.seen.realBackend).toEqual([]);
  await done.getByRole("button", { name: "Done" }).click();
  await expect(done).toBeHidden();
});
