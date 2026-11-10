import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";

// Rooms inside rooms (Phase 168 PR A, docs/phase-168-suites-plan.md): putting
// a bathroom inside its bedroom by hand, the path on cards, the Rooms view
// and its sheet, the picker, deleting a bedroom, and the staff tag and tip.
// Rooms and chores are answered by the stub; nothing reaches a real backend.

const id = (n: number) => `00000000-0000-4000-8000-0000000008${String(n).padStart(2, "0")}`;
const place = (n: number, name: string, extra: Record<string, unknown> = {}) => ({
  id: id(n),
  household_id: HOUSEHOLD_ID,
  name,
  created_at: "2026-10-01T00:00:00Z",
  kind: "room",
  parent_id: null,
  sort_order: 0,
  ...extra,
});

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let n = 0;
const chore = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: `00000000-0000-4000-8000-0000000009${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  notes: null, category: "cleaning", assigned_to: STAFF_ID, due_date: today(), due_time: null, status: "pending",
  completed_by: null, completed_at: null, photo_url: null, created_at: "2026-11-01T00:00:00Z", recurrence: "weekly",
  recurrence_until: null, parent_task_id: null, requires_supervision: false, before_photo_url: null, after_photo_url: null,
  location_id: null, spot: null,
  ...over,
});

const SEEN = ["rooms-2026-11", "floors-2026-11", "room-picker-2026-11", "repairs-2026-11", "rooms-inside-2026-11", "bills-2026-11"];

test("Household → Rooms: put a bathroom inside its bedroom, add a closet, then delete the bedroom", async ({ context, page }) => {
  const LT2 = place(1, "LT2", { kind: "floor" });
  const GB1 = place(2, "GB1", { parent_id: LT2.id, sort_order: 1 });
  const BATH = place(3, "GB1 Bathroom", { parent_id: LT2.id, sort_order: 2 });
  const rooms: Record<string, unknown>[] = [LT2, GB1, BATH];
  await installStub(context, { owner: { locale: "en" }, rooms, chores: [] });
  await page.goto("/dashboard?module=access&page=rooms");

  const lt2 = page.getByRole("region", { name: "LT2" });
  await lt2.getByRole("button", { name: /GB1 Bathroom/ }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Inside").selectOption({ label: "GB1" });
  await sheet.getByLabel("Room name").fill("Bathroom");
  await expect(sheet.getByText("LT2 · GB1 · Bathroom")).toBeVisible();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toHaveCount(0);
  expect(rooms.find((r) => r.id === BATH.id)).toMatchObject({ name: "Bathroom", parent_id: GB1.id });
  await expect(lt2.getByRole("button", { name: /GB1\s*1 inside/ })).toBeVisible();

  // GB1 holds a room now, so it can't go inside one; it offers rooms to add.
  await lt2.getByRole("button", { name: /GB1\s*1 inside/ }).click();
  await expect(sheet.getByLabel("Inside")).toHaveCount(0);
  await expect(sheet.getByText("Rooms inside")).toBeVisible();
  await sheet.getByRole("button", { name: "Walk-in closet" }).click();
  await expect.poll(() => rooms.find((r) => r.name === "Walk-in closet")?.parent_id).toBe(GB1.id);
  await expect(sheet.getByRole("button", { name: "Walk-in closet" })).toHaveCount(0);

  // Deleting GB1 says where its rooms go, and the database's renaming shows.
  await sheet.getByRole("button", { name: "Delete room" }).click();
  // In the Rooms page's order: the closet is new (order 0), the bathroom kept its 2.
  await expect(sheet.getByText("Delete GB1? Its 2 rooms inside move onto LT2: GB1 Walk-in closet, GB1 Bathroom. Chores stay.")).toBeVisible();
  await sheet.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(lt2.getByRole("button", { name: /GB1 Bathroom/ })).toBeVisible();
  expect(rooms.find((r) => r.id === BATH.id)).toMatchObject({ name: "GB1 Bathroom", parent_id: LT2.id });
});

test("Rooms view and picker: rooms inside under their room, counted once each, with the full path", async ({ context, page }) => {
  const LT2 = place(10, "LT2", { kind: "floor" });
  const MASTER = place(11, "Kamar Utama", { parent_id: LT2.id, sort_order: 0 });
  const M_BATH = place(12, "Kamar Mandi", { parent_id: MASTER.id });
  const M_CLOSET = place(13, "Ruang Ganti", { parent_id: MASTER.id });
  const GB1 = place(14, "Kamar Tamu 1", { parent_id: LT2.id, sort_order: 1 });
  const G1_BATH = place(15, "Kamar Mandi", { parent_id: GB1.id });
  const rooms = [LT2, MASTER, M_BATH, M_CLOSET, GB1, G1_BATH];
  const chores = [
    chore({ title: "Vakum dan pel", location_id: MASTER.id }),
    chore({ title: "Vakum", location_id: GB1.id }),
    chore({ title: "Sikat toilet", location_id: G1_BATH.id, spot: "Toilet" }),
  ];
  await installStub(context, { owner: { locale: "id" }, rooms, chores });
  await context.addInitScript((cards) => {
    for (const card of cards) localStorage.setItem(`miamus.whats-new.${card}`, "seen");
  }, SEEN);
  await page.goto("/dashboard?module=chores&chores=rooms");

  const lt2 = page.getByRole("region", { name: "LT2", exact: true });
  await expect(lt2.getByText("5 ruangan")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /^Vakum/ }).first().click();
  await expect(lt2.getByText("Vakum di 2 dari 5")).toBeVisible();
  await expect(lt2.getByRole("button", { name: "Tambah vakum di LT2 · Kamar Utama · Ruang Ganti" })).toBeVisible();
  await page.getByRole("button", { name: /^Semua/ }).click();

  // A bedroom's sheet lists its rooms inside; each opens its own sheet.
  await lt2.getByRole("button", { name: /^Kamar Utama/ }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Ruangan di dalamnya")).toBeVisible();
  await sheet.getByRole("button", { name: /Ruang Ganti/ }).click();
  await expect(sheet.getByRole("heading", { name: "LT2 · Kamar Utama · Ruang Ganti" })).toBeVisible();
  await sheet.getByRole("button", { name: "Tutup" }).click();

  // The Today list names the place in full.
  await page.goto("/dashboard?module=chores");
  await expect(page.getByText("LT2 · Kamar Tamu 1 · Kamar Mandi · Toilet").first()).toBeVisible({ timeout: 20_000 });

  // The picker: rooms inside indented under their room; search finds them by bedroom.
  await page.getByRole("button", { name: "Tambah Tugas" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Ruangan" }).click();
  const list = dialog.getByRole("listbox", { name: "Ruangan" });
  await expect(list.getByRole("group", { name: "LT2" }).getByRole("option")).toHaveText([
    "Seluruh lantai",
    "Kamar Utama",
    "Kamar Mandi",
    "Ruang Ganti",
    "Kamar Tamu 1",
    "Kamar Mandi",
  ]);
  await dialog.getByRole("combobox", { name: "Ruangan" }).fill("tamu mandi");
  // While searching, a room inside says whose it is (its room may be filtered out).
  await expect(list.getByRole("group", { name: "LT2" }).getByRole("option")).toHaveText(["Kamar Tamu 1 · Kamar Mandi"]);
  await list.getByRole("group", { name: "LT2" }).getByRole("option").click();
  await expect(dialog.getByText("LT2 · Kamar Tamu 1 · Kamar Mandi")).toBeVisible();

  // With a bedroom already picked, its rooms inside say whose they are, never
  // a bare "Kamar Mandi" under the wrong heading (Codex, #74).
  await dialog.getByRole("button", { name: "Pilih ruangan lain" }).click();
  await list.getByRole("option", { name: "Kamar Utama", exact: true }).click();
  await dialog.getByRole("button", { name: "Pilih ruangan lain" }).click();
  await expect(list.getByRole("group", { name: "LT2" }).getByRole("option")).toHaveText([
    "Seluruh lantai",
    "Kamar Utama · Kamar Mandi",
    "Kamar Utama · Ruang Ganti",
    "Kamar Tamu 1",
  ]);
});

test("a staff phone reads the full path and gets the one-line tip", async ({ context, page }) => {
  const LT2 = place(20, "LT2", { kind: "floor" });
  const GB2 = place(21, "Kamar Tamu 2", { parent_id: LT2.id });
  const BATH = place(22, "Kamar Mandi", { parent_id: GB2.id });
  const rooms = [LT2, GB2, BATH];
  const chores = [chore({ title: "Lap keran dan wastafel", assigned_to: null, location_id: BATH.id, spot: "Wastafel" })];
  await installStub(context, { stored: freshSession(), staffPhone: true, rooms, chores });
  await context.addInitScript(() => localStorage.setItem("miamus.whats-new.staff-feedback-2026-11", "seen"));
  await page.goto("/staff");

  await expect(page.getByText("LT2 · Kamar Tamu 2 · Kamar Mandi · Wastafel").first()).toBeVisible({ timeout: 20_000 });
  const tip = page.getByRole("region", { name: "Baru: kamar mandi bersama kamarnya" });
  await expect(tip).toBeVisible();
  await tip.getByRole("button", { name: "Tutup" }).click();
  await expect(tip).toHaveCount(0);
});
