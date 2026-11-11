import { expect, test } from "@playwright/test";
import { BENTO, MOCHI, schedule } from "../fixtures/household";
import { installStub } from "./stub-backend";

// Phase 173 PR C (docs/phase-173-pet-routines-plan.md, D7 and D15): the two
// switches in the owner's Add routine sheet. Off by default, saved on every
// row of the routine, read back for editing, and greyed for a time they
// can't use. What is sent is migrations/150's job (supabase/tests/150_*).

const lightsWithSwitches = (pet: typeof MOCHI) =>
  schedule(pet, "Matikan lampu", ["21:30"], {
    kind: "lights",
    routine_group_id: "00000000-0000-4000-8000-0000000173c1",
    proof: "photo",
    remind_staff: true,
    alert_owners: true,
  });

test("owner: lights off at 21:30 with a staff reminder and a not-done alert", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=pets");
  await page.getByRole("button", { name: "Add routine" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-routine-sheet");
  await sheet.getByRole("button", { name: "Lights off" }).click();

  const remind = sheet.getByRole("switch", { name: "Remind staff at this time" });
  const alert = sheet.getByRole("switch", { name: "Tell us if it's not done" });
  await expect(remind).toHaveAttribute("aria-checked", "false");
  await expect(alert).toHaveAttribute("aria-checked", "false");
  await expect(sheet.getByText("Only if it isn't done yet, on every staff phone with notifications on.")).toBeVisible();

  await remind.click();
  await alert.click();
  await expect(remind).toHaveAttribute("aria-checked", "true");
  await expect(alert).toHaveAttribute("aria-checked", "true");
  await sheet.getByRole("button", { name: "Add for 2 pets" }).click();
  await expect(page.getByText("Lights off added")).toBeVisible();

  const made = stub.schedules.filter((s) => s.kind === "lights");
  expect(made).toHaveLength(2);
  expect(made.every((s) => s.remind_staff === true && s.alert_owners === true)).toBe(true);
});

test("owner: a routine saved without touching the switches keeps both off", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=pets");
  await page.getByRole("button", { name: "Add routine" }).click({ timeout: 20_000 });
  const sheet = page.getByTestId("add-routine-sheet");
  await sheet.getByRole("button", { name: "Fresh water" }).click();
  await sheet.getByRole("button", { name: "Add for 2 pets" }).click();
  await expect(page.getByText("Fresh water added")).toBeVisible();
  const made = stub.schedules.filter((s) => s.kind === "water");
  expect(made).toHaveLength(2);
  expect(made.every((s) => s.remind_staff === false && s.alert_owners === false)).toBe(true);
});

test("owner (Bahasa Indonesia): the switches read back, grey out after 22.00, and turn off", async ({ context, page }) => {
  const stub = await installStub(context, {
    owner: { locale: "id" },
    schedules: [lightsWithSwitches(MOCHI), lightsWithSwitches(BENTO)],
  });
  await page.goto("/dashboard?module=pets");
  await page.getByRole("button", { name: /Mochi/ }).first().click({ timeout: 20_000 });
  await page.getByRole("button", { name: "Kelola Rutinitas" }).click();
  await expect(page.getByRole("img", { name: "Pengingat atau kabar aktif" })).toBeVisible();
  await page.getByRole("button", { name: /Matikan lampu/ }).click();
  const sheet = page.getByTestId("add-routine-sheet");

  const remind = sheet.getByRole("switch", { name: "Ingatkan staf di jam ini" });
  const alert = sheet.getByRole("switch", { name: "Kabari kami jika belum dikerjakan" });
  await expect(remind).toHaveAttribute("aria-checked", "true");
  await expect(alert).toHaveAttribute("aria-checked", "true");

  // 22.30 is too late for both: greyed, shown off, and saved off.
  await sheet.getByLabel("Jam 1").fill("22:30");
  await expect(remind).toBeDisabled();
  await expect(alert).toBeDisabled();
  await expect(remind).toHaveAttribute("aria-checked", "false");
  await expect(sheet.getByText("Terlalu malam untuk pengingat.", { exact: false })).toBeVisible();
  await expect(sheet.getByText("Terlalu malam untuk kabar.", { exact: false })).toBeVisible();

  // 22.00: no reminder, but the alert (at 22.30) still works.
  await sheet.getByLabel("Jam 1").fill("22:00");
  await expect(remind).toBeDisabled();
  await expect(alert).toBeEnabled();

  // Back to 21.30, the reminder off: saved on both pets' rows.
  await sheet.getByLabel("Jam 1").fill("21:30");
  await remind.click();
  await expect(remind).toHaveAttribute("aria-checked", "false");
  await sheet.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Rutinitas disimpan")).toBeVisible();
  const rows = stub.schedules.filter((s) => s.kind === "lights");
  expect(rows).toHaveLength(2);
  expect(rows.every((s) => s.remind_staff === false && s.alert_owners === true)).toBe(true);
});
