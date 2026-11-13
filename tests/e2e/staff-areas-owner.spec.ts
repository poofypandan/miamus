import { expect, test } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER, OWNER_PROFILE_ID, STAFF_ID, installStub } from "./stub-backend";

// What each staff member sees (Phase 178, V2): the owner's switches on a
// staff member, in English and in Bahasa Indonesia. Saves on the tap; the
// staff list says what someone doesn't see; "nobody sees" when a switch
// leaves pet routines or chores for anyone with nobody.

const SYAM = "00000000-0000-4000-8000-00000000c002";
const person = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  household_id: HOUSEHOLD_ID,
  name,
  has_pin: true,
  user_id: null,
  archived_at: null,
  hidden_areas: [],
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});
const roster = () => [
  person(STAFF_ID, "Ari"),
  person(SYAM, "Syam", { hidden_areas: ["pets"] }),
  person(OWNER_PROFILE_ID, "Moshe", { user_id: OWNER }),
];

test("English: Syam's switches save on the tap, the list says what he doesn't see", async ({ context, page }) => {
  const staff = roster();
  const stub = await installStub(context, {
    owner: { locale: "en" },
    staff,
    household: { hasPets: true },
    features: { repairs: true },
  });
  await page.goto("/dashboard?module=access&page=staff");
  await expect(page.getByRole("button", { name: "Add Person" })).toBeVisible({ timeout: 20_000 });

  // The owner's own row has no switches: owners are never limited.
  await expect(page.getByRole("button", { name: "What Moshe sees" })).toHaveCount(0);
  // Ari has everything on: nothing new under her name.
  await expect(page.getByText(/Doesn't see/)).toHaveCount(1);
  await expect(page.getByText("Doesn't see: Pet routines")).toBeVisible();

  await page.getByRole("button", { name: "What Syam sees" }).click();
  const dialog = page.getByRole("dialog", { name: "What Syam sees" });
  await expect(dialog).toContainText("Anything you give Syam by name always shows.");
  await expect(dialog.getByRole("switch", { name: "Chores for anyone" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByRole("switch", { name: "Pet routines" })).toHaveAttribute("aria-checked", "false");
  await expect(dialog.getByRole("switch", { name: "Kitchen" })).toHaveAttribute("aria-checked", "true");
  await expect(dialog.getByRole("switch", { name: "Repairs" })).toHaveAttribute("aria-checked", "true");
  // Ari still has pet routines on: no "nobody" line.
  await expect(dialog.getByText(/Nobody sees/)).toHaveCount(0);

  await dialog.getByRole("switch", { name: "Kitchen" }).click();
  await expect(dialog.getByRole("switch", { name: "Kitchen" })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Kitchen off for Syam")).toBeVisible();
  expect(staff.find((p) => p.id === SYAM)?.hidden_areas).toEqual(["pets", "kitchen"]);
  await dialog.getByRole("switch", { name: "Repairs" }).click();
  await expect.poll(() => staff.find((p) => p.id === SYAM)?.hidden_areas).toEqual(["pets", "kitchen", "repairs"]);
  expect(stub.writes.filter(([m, t]) => m === "PATCH" && t === "staff_profiles")).toHaveLength(2);

  await page.keyboard.press("Escape");
  await expect(page.getByText("Doesn't see: Pet routines, Kitchen, Repairs")).toBeVisible();

  // Ari turns pet routines off too: nobody has them, so everybody sees them.
  await page.getByRole("button", { name: "What Ari sees" }).click();
  const ari = page.getByRole("dialog", { name: "What Ari sees" });
  await ari.getByRole("switch", { name: "Pet routines" }).click();
  await expect(ari).toContainText("Nobody sees pet routines now, so every staff member sees them.");
  // And back on: the line goes.
  await ari.getByRole("switch", { name: "Pet routines" }).click();
  await expect(ari.getByText(/Nobody sees/)).toHaveCount(0);
});

test("Bahasa Indonesia: the same switches; Repairs and Pet routines only while the home has them", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, {
    owner: { locale: "id" },
    staff,
    household: { hasPets: false },
    features: { repairs: false },
  });
  await page.goto("/dashboard?module=access&page=staff");
  await expect(page.getByRole("button", { name: "Tambah Orang" })).toBeVisible({ timeout: 20_000 });
  // Syam's pet routines are off, but this home has no pets: nothing to say.
  await expect(page.getByText(/Tidak melihat/)).toHaveCount(0);

  await page.getByRole("button", { name: "Yang dilihat Ari" }).click();
  const dialog = page.getByRole("dialog", { name: "Yang dilihat Ari" });
  await expect(dialog).toContainText("Tugas yang Anda berikan langsung ke Ari selalu terlihat.");
  await expect(dialog.getByRole("switch")).toHaveCount(2);
  await expect(dialog.getByRole("switch", { name: "Tugas untuk siapa saja" })).toBeVisible();
  await expect(dialog.getByRole("switch", { name: "Dapur" })).toBeVisible();
  await expect(dialog.getByRole("switch", { name: "Rutinitas hewan" })).toHaveCount(0);
  await expect(dialog.getByRole("switch", { name: "Perbaikan" })).toHaveCount(0);

  await dialog.getByRole("switch", { name: "Tugas untuk siapa saja" }).click();
  await expect(page.getByText("Tugas untuk siapa saja dimatikan untuk Ari")).toBeVisible();
  // Syam still has chores for anyone on.
  await expect(dialog.getByText(/Sekarang tidak ada/)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByText("Tidak melihat: Tugas untuk siapa saja")).toBeVisible();

  await page.getByRole("button", { name: "Yang dilihat Syam" }).click();
  const syam = page.getByRole("dialog", { name: "Yang dilihat Syam" });
  await syam.getByRole("switch", { name: "Tugas untuk siapa saja" }).click();
  await expect(syam).toContainText(
    "Sekarang tidak ada yang melihat tugas untuk siapa saja, jadi semua staf melihatnya."
  );
  // No English anywhere in the dialog.
  await expect(syam).not.toContainText(/Chores|Kitchen|Repairs|Nobody|sees/);
});

test("Undo reverses only its own switch, and a slow save never lands on someone else (Codex, #131)", async ({ context, page }) => {
  const staff = roster();
  await installStub(context, { owner: { locale: "en" }, staff, household: { hasPets: true }, features: { repairs: true } });
  await page.goto("/dashboard?module=access&page=staff");
  await expect(page.getByRole("button", { name: "Add Person" })).toBeVisible({ timeout: 20_000 });

  // Kitchen off, then Repairs off; Undo on the Kitchen toast brings back
  // only Kitchen.
  await page.getByRole("button", { name: "What Ari sees" }).click();
  const ari = page.getByRole("dialog", { name: "What Ari sees" });
  await ari.getByRole("switch", { name: "Kitchen" }).click();
  await expect(page.getByText("Kitchen off for Ari")).toBeVisible();
  await ari.getByRole("switch", { name: "Repairs" }).click();
  await expect(page.getByText("Repairs off for Ari")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ari).toHaveCount(0);
  // Toasts stack; hovering fans them out so the older one can be reached.
  await page.locator("[data-sonner-toast]", { hasText: "Repairs off for Ari" }).hover();
  await page
    .locator("[data-sonner-toast]", { hasText: "Kitchen off for Ari" })
    .getByRole("button", { name: "Undo" })
    .click();
  await expect.poll(() => staff.find((p) => p.id === STAFF_ID)?.hidden_areas).toEqual(["repairs"]);
  await page.getByRole("button", { name: "What Ari sees" }).click();
  await expect(ari.getByRole("switch", { name: "Kitchen" })).toHaveAttribute("aria-checked", "true");
  await expect(ari.getByRole("switch", { name: "Repairs" })).toHaveAttribute("aria-checked", "false");

  // A slow save for Ari finishes while Syam's dialog is open: Syam's
  // switches stay his own.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/rest/v1/staff_profiles*", async (route) => {
    if (route.request().method() === "PATCH") await held;
    await route.fallback();
  });
  await ari.getByRole("switch", { name: "Chores for anyone" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "What Syam sees" }).click();
  const syam = page.getByRole("dialog", { name: "What Syam sees" });
  await expect(syam.getByRole("switch", { name: "Pet routines" })).toHaveAttribute("aria-checked", "false");
  release();
  await expect.poll(() => staff.find((p) => p.id === STAFF_ID)?.hidden_areas).toEqual(["home", "repairs"]);
  await expect(syam.getByRole("switch", { name: "Chores for anyone" })).toHaveAttribute("aria-checked", "true");
  await expect(syam.getByRole("switch", { name: "Repairs" })).toHaveAttribute("aria-checked", "true");
  await expect(syam.getByRole("switch", { name: "Pet routines" })).toHaveAttribute("aria-checked", "false");
  // And Syam's own switch still saves Syam's list.
  await syam.getByRole("switch", { name: "Kitchen" }).click();
  await expect.poll(() => staff.find((p) => p.id === SYAM)?.hidden_areas).toEqual(["pets", "kitchen"]);
});
