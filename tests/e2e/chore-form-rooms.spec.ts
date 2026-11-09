import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, installStub } from "./stub-backend";

// The chore form's room picker (Phase 158 PR B2): rooms grouped by floor with
// "Whole floor", several rooms at once (one chore each), and the spot chips.

const id = (n: number) => `00000000-0000-4000-8000-0000000005${String(n).padStart(2, "0")}`;
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

const LT2 = place(1, "LT2", { kind: "floor" });
const LOUNGE = place(2, "Lounge", { parent_id: LT2.id });
const BATH = place(3, "GB2 Bathroom", { parent_id: LT2.id, sort_order: 1 });
const BEDROOM = place(4, "Bedroom", { parent_id: LT2.id, sort_order: 2 });
const TERAS = place(5, "Teras");

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

let n = 0;
const chore = (over: Record<string, unknown>): Record<string, unknown> => ({
  id: `00000000-0000-4000-8000-0000000006${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  notes: null, category: "cleaning", assigned_to: STAFF_ID, due_date: today(), due_time: null, status: "pending",
  completed_by: null, completed_at: null, photo_url: null, created_at: "2026-11-01T00:00:00Z", recurrence: "weekly",
  recurrence_until: null, parent_task_id: null, requires_supervision: false, before_photo_url: null, after_photo_url: null,
  location_id: null, spot: null,
  ...over,
});

test("Chore form: rooms by floor, several rooms at once, a whole floor, and a spot", async ({ context, page }) => {
  const rooms = [LT2, LOUNGE, BATH, BEDROOM, TERAS];
  const chores = [
    chore({ title: "Lap keran", location_id: BATH.id, spot: "Wastafel" }),
    chore({ title: "Gosok wastafel", recurrence: "daily", location_id: BATH.id, spot: "wastafel" }),
    chore({ title: "Sikat kloset", location_id: BATH.id, spot: "Toilet" }),
  ];
  const stub = await installStub(context, { owner: { locale: "en" }, rooms, chores });
  await context.addInitScript(() => {
    for (const card of ["rooms-2026-11", "floors-2026-11", "room-picker-2026-11"]) {
      localStorage.setItem(`miamus.whats-new.${card}`, "seen");
    }
  });
  await page.goto("/dashboard?module=chores");

  // Several rooms at once: one chore per room, saved together.
  await page.getByRole("button", { name: "Add Chore" }).first().click({ timeout: 20_000 });
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill("Vakum");
  await dialog.getByRole("combobox", { name: "Room" }).click();
  const list = dialog.getByRole("listbox", { name: "Rooms" });
  // Floors are headings, the whole floor first, then its rooms; loose rooms last.
  await expect(list.getByRole("group", { name: "LT2" }).getByRole("option")).toHaveText([
    "Whole floor",
    "Lounge",
    "GB2 Bathroom",
    "Bedroom",
  ]);
  await expect(list.getByText("No floor yet")).toBeVisible();
  await list.getByRole("option", { name: "Lounge" }).click();
  await expect(dialog.getByText("LT2 · Lounge")).toBeVisible();
  await dialog.getByRole("button", { name: "More rooms" }).click();
  // Typing filters by floor and room together; a room already picked is gone.
  await dialog.getByRole("combobox", { name: "Room" }).fill("lt2 b");
  await expect(list.getByRole("group")).toHaveCount(1);
  await expect(list.getByRole("group", { name: "LT2" }).getByRole("option")).toHaveText(["GB2 Bathroom", "Bedroom"]);
  await list.getByRole("option", { name: "Bedroom" }).click();
  await expect(dialog.getByText("2 chores will be added, one for each room.")).toBeVisible();
  await dialog.getByRole("button", { name: "Add Chore" }).click();
  await expect.poll(() => stub.tasks.length).toBe(2);
  expect(stub.tasks.map((t) => t.location_id)).toEqual([LOUNGE.id, BEDROOM.id]);
  expect(stub.tasks.every((t) => t.title === "Vakum" && !("spot" in t))).toBe(true);
  await expect(dialog).toHaveCount(0);

  // A spot: the room's spots as chips, "wastafel" and "Wastafel" as one.
  await page.getByRole("button", { name: "Add Chore" }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill("Lap cermin");
  await dialog.getByRole("combobox", { name: "Room" }).click();
  await dialog.getByRole("option", { name: "GB2 Bathroom" }).click();
  const spots = dialog.getByRole("group", { name: "Spot" });
  await expect(spots.getByRole("button")).toHaveText(["Wastafel", "Toilet", /New spot/]);
  await spots.getByRole("button", { name: "New spot" }).click();
  await dialog.getByRole("textbox", { name: "New spot" }).fill("  Cermin  ");
  await dialog.getByRole("textbox", { name: "New spot" }).press("Enter");
  await expect(spots.getByRole("button", { name: "Cermin" })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Add Chore" }).click();
  await expect.poll(() => stub.tasks.length).toBe(3);
  expect(stub.tasks[2]).toMatchObject({ title: "Lap cermin", location_id: BATH.id, spot: "Cermin" });

  // The whole floor is a place of its own.
  await page.getByRole("button", { name: "Add Chore" }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox").first().fill("Buang sampah");
  await dialog.getByRole("combobox", { name: "Room" }).click();
  await dialog.getByRole("option", { name: "Whole floor" }).click();
  await expect(dialog.getByText("LT2 · Whole floor")).toBeVisible();
  await dialog.getByRole("button", { name: "Add Chore" }).click();
  await expect.poll(() => stub.tasks.length).toBe(4);
  expect(stub.tasks[3]).toMatchObject({ title: "Buang sampah", location_id: LT2.id });
});
