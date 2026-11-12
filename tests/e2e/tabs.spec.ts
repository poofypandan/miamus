import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { installStub } from "./stub-backend";

// Phase 175, Sunday slice S1 and S4: the owner's tabs read Today · Home ·
// Pets · Kitchen · Settings in both languages, no URL key changed, Home →
// Rooms opens the rooms editor, and Kakak's button is on every area tab but
// Settings.

const tabs = (page: import("@playwright/test").Page, name = "Sections") => page.getByRole("navigation", { name });

const room = (n: number, name: string, extra: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000009${String(n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  name,
  created_at: "2026-10-01T00:00:00Z",
  ...extra,
});

test("the tabs, in order, in English and in Bahasa Indonesia", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard");
  const links = tabs(page).getByRole("link");
  await expect(links).toHaveText(["Today", "Home", "Pets", "Kitchen", "Settings"], { timeout: 20_000 });
  await expect(links.first()).toHaveAttribute("aria-current", "page");

  await page.goto("/dashboard?module=chores");
  const pills = page.getByRole("tablist", { name: "Home" });
  await expect(pills.getByRole("tab")).toHaveText(["Chores", "Rooms", "Repairs"], { timeout: 20_000 });
});

test("the tabs in Bahasa Indonesia", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" } });
  await page.goto("/dashboard?module=chores");
  await expect(tabs(page, "Bagian").getByRole("link")).toHaveText(["Hari ini", "Rumah", "Hewan", "Dapur", "Pengaturan"], {
    timeout: 20_000,
  });
  await expect(page.getByRole("tablist", { name: "Rumah" }).getByRole("tab")).toHaveText(["Tugas", "Ruangan", "Perbaikan"]);
});

test("old links still land: household opens Home, staff opens Settings, inventory opens Kitchen", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  for (const [param, label] of [
    ["household", "Home"],
    ["staff", "Settings"],
    ["inventory", "Kitchen"],
    ["access", "Settings"],
  ] as const) {
    await page.goto(`/dashboard?module=${param}`);
    await expect(tabs(page).getByRole("link", { name: label })).toHaveAttribute("aria-current", "page", { timeout: 20_000 });
  }
});

test("Home → Rooms → Edit rooms opens the rooms editor, and its back link returns", async ({ context, page }) => {
  const floor = room(1, "LT1", { kind: "floor", parent_id: null, sort_order: 1 });
  const rooms = [floor, room(2, "Dapur", { kind: "room", parent_id: floor.id, sort_order: 0 })];
  await installStub(context, { owner: { locale: "id" }, rooms, chores: [] });
  await page.goto("/dashboard?module=chores&chores=rooms");

  await page.getByRole("button", { name: "Ubah ruangan" }).click({ timeout: 20_000 });
  await expect(page).toHaveURL(/module=access&page=rooms/);
  await expect(page.getByRole("button", { name: "Tambah lantai" })).toBeVisible();

  await page.getByRole("button", { name: "Rumah", exact: true }).click();
  await expect(page).toHaveURL(/module=chores&chores=rooms/);
  await expect(page.getByRole("tablist", { name: "Rumah" }).getByRole("tab", { name: "Ruangan" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("the rooms editor from Settings still goes back to Settings", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, rooms: [], chores: [] });
  await page.goto("/dashboard?module=access&page=rooms");
  await page.getByRole("button", { name: "Settings", exact: true }).click({ timeout: 20_000 });
  await expect(page).not.toHaveURL(/page=rooms/);
  await expect(page.getByRole("button", { name: /^Rooms/ })).toBeVisible();
});

test("Kakak's button is on Today, Home, Pets and Kitchen, not Settings (S4)", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  for (const module of ["agenda", "chores", "pets", "inventory"]) {
    await page.goto(`/dashboard?module=${module}`);
    await expect(page.getByRole("button", { name: "Tell Kakak" })).toBeVisible({ timeout: 20_000 });
  }
  await page.goto("/dashboard?module=access");
  await expect(page.getByRole("button", { name: /^Kakak/ })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Tell Kakak" })).toHaveCount(0);
});
