import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, installStub } from "./stub-backend";

// Floors and spots (Phase 158 PR B): "Sort your rooms into floors" with its
// Undo, and Household → Rooms. Rooms, chores and organise_rooms are answered
// by the stub; nothing reaches a real backend.

const id = (n: number) => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`;
const room = (n: number, name: string) => ({ id: id(n), household_id: HOUSEHOLD_ID, name, created_at: "2026-10-01T00:00:00Z" });

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let n = 0;
const chore = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: `00000000-0000-4000-8000-0000000004${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  notes: null, category: "cleaning", assigned_to: STAFF_ID, due_date: today(), due_time: null, status: "pending",
  completed_by: null, completed_at: null, photo_url: null, created_at: "2026-11-01T00:00:00Z", recurrence: "weekly",
  recurrence_until: null, parent_task_id: null, requires_supervision: false, before_photo_url: null, after_photo_url: null,
  location_id: null, spot: null,
  ...over,
});

function household() {
  const rooms = [
    room(1, "LT2"),
    room(2, "LT2 Lounge"),
    room(3, "LT2 GB2 Bathroom Toilet"),
    room(4, "LT2 GB2 Bathroom Wastafel"),
    room(5, "LT1 Service Area"),
    room(6, "Teras"),
  ];
  const chores = [
    chore({ title: "Vacuum & pel", location_id: id(2) }),
    chore({ title: "Lap toilet", location_id: id(3) }),
    chore({ title: "Lap keran", recurrence: "daily", location_id: id(4) }),
    chore({ title: "Buang sampah", recurrence: "daily", location_id: id(1) }),
  ];
  return { rooms, chores };
}

test("Sort rooms into floors: preview, one tap, the right rooms and spots, and Undo", async ({ context, page }) => {
  const { rooms, chores } = household();
  const stub = await installStub(context, { owner: { locale: "en" }, rooms, chores });
  await context.addInitScript(() => localStorage.setItem("miamus.whats-new.floors-2026-11", "seen"));
  await page.goto("/dashboard?module=chores&chores=rooms");

  const card = page.getByRole("region", { name: "Sort your rooms into floors" });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText("LT2 · Lounge")).toBeVisible();
  await expect(card.getByText(/one room, with parts: Toilet, Wastafel/)).toBeVisible();
  await card.getByRole("button", { name: "Sort rooms" }).click();

  // The rooms view now reads the stored floors.
  const lt2 = page.getByRole("region", { name: "LT2", exact: true });
  await expect(lt2.getByText("GB2 Bathroom", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("region", { name: "LT1", exact: true }).getByText("Service Area")).toBeVisible();
  await expect(page.getByRole("region", { name: "No floor yet" }).getByText("Teras")).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(rooms.find((r) => r.id === id(1))).toMatchObject({ kind: "floor" });
  expect(rooms.find((r) => r.id === id(4))).toBeUndefined(); // the sink part, merged
  expect(chores.find((c) => c.title === "Lap keran")).toMatchObject({ location_id: id(3), spot: "Wastafel" });

  // A room's sheet shows each chore's spot.
  await lt2.getByText("GB2 Bathroom", { exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/^Wastafel · /)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  // Undo puts every name, room and chore back.
  await page.locator("[data-sonner-toast]").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("region", { name: "Sort your rooms into floors" })).toBeVisible({ timeout: 10_000 });
  expect(rooms.map((r) => r.name).sort()).toEqual(
    ["LT1 Service Area", "LT2", "LT2 GB2 Bathroom Toilet", "LT2 GB2 Bathroom Wastafel", "LT2 Lounge", "Teras"]
  );
  expect(rooms.every((r) => (r as { kind?: string }).kind !== "floor")).toBe(true);
  expect(chores.find((c) => c.title === "Lap keran")).toMatchObject({ location_id: id(4), spot: null });
  expect(stub.seen.realBackend).toEqual([]);
});

test("Household → Rooms: add a floor and a room on it, then delete the floor", async ({ context, page }) => {
  const rooms: Record<string, unknown>[] = [
    { ...room(10, "LT1"), kind: "floor", parent_id: null, sort_order: 1 },
    { ...room(11, "Dapur"), kind: "room", parent_id: id(10), sort_order: 0 },
  ];
  await installStub(context, { owner: { locale: "id" }, rooms, chores: [] });
  await page.goto("/dashboard?module=access&page=rooms");

  await expect(page.getByRole("region", { name: "LT1" }).getByText("Dapur")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Tambah lantai" }).click();
  await page.getByLabel("Nama lantai").fill("LT2");
  await page.getByRole("button", { name: "Tambah", exact: true }).click();
  await expect(page.getByRole("region", { name: "LT2" })).toBeVisible();

  await page.getByRole("button", { name: "Tambah ruangan" }).click();
  await page.getByLabel("Nama ruangan").fill("Ruang musik");
  await page.getByLabel("Lantai").selectOption({ label: "LT2" });
  await page.getByRole("button", { name: "Tambah", exact: true }).click();
  await expect(page.getByRole("region", { name: "LT2" }).getByText("Ruang musik")).toBeVisible();

  // Delete LT2: its room moves to "Belum ada lantai".
  await page.getByRole("region", { name: "LT2" }).getByRole("button", { name: "LT2", exact: true }).click();
  await page.getByRole("button", { name: "Hapus lantai" }).click();
  await page.getByRole("button", { name: "Hapus", exact: true }).click();
  await expect(page.getByRole("region", { name: "Belum ada lantai" }).getByText("Ruang musik")).toBeVisible();
  expect(rooms.some((r) => r.name === "LT2")).toBe(false);
});
