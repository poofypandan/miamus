import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { STAFF_ID, installStub } from "./stub-backend";

// Home → Chores as plain rows (21 Nov; Fable's 07, section 2, decision 3):
// a name and one quiet line; earlier ones under an amber label, not in a
// box; the day's chores by time, done ones quiet with a tick and in place;
// "Needs you at home" for a chore that waits for an owner.

function day(offset: number): string {
  const d = new Date(Date.now() + 7 * 3_600_000 + offset * 86_400_000);
  return d.toISOString().slice(0, 10);
}

let n = 0;
const chore = (over: Record<string, unknown>) => ({
  id: `00000000-0000-4000-8000-0000000005${String(++n).padStart(2, "0")}`,
  household_id: HOUSEHOLD_ID,
  notes: null,
  category: "cleaning",
  assigned_to: STAFF_ID,
  due_date: day(0),
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
  ...over,
});

test("the day's chores as plain rows: earlier ones under an amber label, done ones in place with a tick", async ({
  context,
  page,
}) => {
  await installStub(context, {
    owner: { locale: "en" },
    chores: [
      chore({ title: "Pel teras", due_date: day(-2) }),
      chore({ title: "Lap kaca", due_time: "09:00:00" }),
      chore({
        title: "Sapu halaman",
        due_time: "07:00:00",
        status: "completed",
        completed_by: STAFF_ID,
        completed_at: new Date().toISOString(),
      }),
      chore({ title: "Terima tukang AC", due_time: "10:00:00", requires_supervision: true }),
    ],
  });
  await page.goto("/dashboard?module=chores&chores=today");

  const earlier = page.getByRole("region", { name: "From earlier" });
  await expect(earlier.getByRole("button", { name: /^Pel teras/ })).toContainText(/since /, { timeout: 20_000 });

  const today = page.getByRole("region", { name: "Today", exact: true });
  // By time, the done one in its place, not in a section of its own.
  await expect(today.getByRole("button", { name: /^(Done: )?(Sapu halaman|Lap kaca|Terima tukang AC)/ })).toHaveText([
    /Sapu halaman.*Done/,
    /Lap kaca.*9:00 AM/,
    /Terima tukang AC.*Needs you at home/,
  ]);
  await expect(page.getByText("Completed", { exact: true })).toHaveCount(0);

  // A tap edits it.
  await today.getByRole("button", { name: /^Lap kaca/ }).click();
  await expect(page.getByRole("dialog", { name: "Edit Chore" })).toBeVisible();
});

test("in Bahasa Indonesia", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "id" },
    chores: [chore({ title: "Pel teras", due_date: day(-2) }), chore({ title: "Terima tukang AC", requires_supervision: true })],
  });
  await page.goto("/dashboard?module=chores&chores=today");
  await expect(page.getByRole("region", { name: "Dari hari sebelumnya" }).getByRole("button", { name: /^Pel teras/ })).toContainText(
    /sejak /,
    { timeout: 20_000 }
  );
  await expect(page.getByRole("region", { name: "Hari ini", exact: true }).getByRole("button", { name: /^Terima tukang AC/ })).toContainText(
    "Perlu Anda di rumah"
  );
});
