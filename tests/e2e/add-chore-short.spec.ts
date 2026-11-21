import { expect, test } from "@playwright/test";
import { installStub } from "./stub-backend";

// Add Chore, short by default (21 Nov; Fable's 07, section 10): What, Who,
// When and the button; When reads back in words and opens the date, time
// and repeat; everything else is behind More. Nothing is required that
// wasn't before, and nothing is taken away.

test("Add Chore starts short: What, Who, When, More, and the button", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "en" }, chores: [] });
  await page.goto("/dashboard?module=chores&chores=today");
  await page.getByRole("button", { name: "Add Chore" }).first().click({ timeout: 20_000 });
  const form = page.getByRole("dialog", { name: "Add Chore" });

  await expect(form.getByText("What", { exact: true })).toBeVisible();
  await expect(form.getByText("Who", { exact: true })).toBeVisible();
  const when = form.getByRole("button", { name: /^When/ });
  await expect(when).toHaveText(/Today, once/);
  await expect(when).toHaveAttribute("aria-expanded", "false");
  // Behind More and When until asked for.
  await expect(form.getByRole("button", { name: "Cleaning" })).toHaveCount(0);
  await expect(form.getByRole("combobox", { name: "Room" })).toHaveCount(0);
  await expect(form.locator('input[type="date"]')).toHaveCount(0);
  await expect(form.getByRole("button", { name: "Add Chore" })).toBeInViewport();

  // When opens the choices, and reads back what was chosen.
  await when.click();
  await form.getByRole("button", { name: "Daily", exact: true }).click();
  await form.locator('input[type="time"]').fill("09:00");
  await expect(when).toHaveText(/Every day at 09:00/);

  await form.getByRole("button", { name: "More", exact: true }).click();
  await expect(form.getByRole("button", { name: "Cleaning" })).toBeVisible();
  await expect(form.getByRole("combobox", { name: "Room" })).toBeVisible();

  await form.getByRole("textbox").first().fill("Pel teras");
  await form.getByRole("button", { name: "Add Chore" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Pel teras", recurrence: "daily" });
  expect(String(stub.tasks[0].due_time)).toMatch(/^09:00/);
});

test("in Bahasa Indonesia, and a typed title alone is enough", async ({ context, page }) => {
  const stub = await installStub(context, { owner: { locale: "id" }, chores: [] });
  await page.goto("/dashboard?module=chores&chores=today");
  await page.getByRole("button", { name: "Tambah Tugas" }).first().click({ timeout: 20_000 });
  const form = page.getByRole("dialog", { name: "Tambah Tugas" });
  await expect(form.getByText("Apa", { exact: true })).toBeVisible();
  await expect(form.getByText("Siapa", { exact: true })).toBeVisible();
  await expect(form.getByRole("button", { name: /^Kapan/ })).toHaveText(/Hari ini, sekali/);
  await expect(form.getByRole("button", { name: "Lainnya", exact: true })).toBeVisible();
  await form.getByRole("textbox").first().fill("Siram tanaman");
  await form.getByRole("button", { name: "Tambah Tugas" }).click();
  await expect.poll(() => stub.tasks.length).toBe(1);
  expect(stub.tasks[0]).toMatchObject({ title: "Siram tanaman", recurrence: "none", category: "cleaning" });
});

test("with the keyboard up, Add Chore stays in reach (Fable's look, #194)", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, chores: [] });
  await page.goto("/dashboard?module=chores&chores=today");
  await page.getByRole("button", { name: "Add Chore" }).first().click({ timeout: 20_000 });
  const form = page.getByRole("dialog", { name: "Add Chore" });
  await form.getByRole("textbox").first().focus();
  // A phone with its keyboard up leaves about 420 px of the screen.
  await page.setViewportSize({ width: 390, height: 420 });
  await expect(form.getByRole("button", { name: "Add Chore" })).toBeInViewport();
  // Who reads "Anyone", as everywhere an unowned chore is named.
  await expect(form.getByRole("combobox")).toHaveText(/Anyone/);
});
