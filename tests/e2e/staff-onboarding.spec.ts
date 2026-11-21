import { expect, test, type Page } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER, OWNER_PROFILE_ID, STAFF_ID, installStub } from "./stub-backend";

// Staff onboarding (docs/private/staff-onboarding-plan.md), step 1: the
// guide says how to add, explain to, remove and bring back a staff member,
// and removing someone no longer asks the owner to share a new house code
// (phones already signed in stay signed in). In English and in Bahasa
// Indonesia.
//
// Phone-size screenshots, when SHOTS_DIR is set:
//
//   SHOTS_DIR=<folder> CI=1 npx playwright test tests/e2e/staff-onboarding.spec.ts

const DIR = process.env.SHOTS_DIR;
test.use({ viewport: { width: 390, height: 844 } });

const SYAM = "00000000-0000-4000-8000-00000000c002";
const person = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id,
  household_id: HOUSEHOLD_ID,
  name,
  has_pin: true,
  user_id: null,
  archived_at: null as string | null,
  hidden_areas: [] as string[],
  created_at: "2026-10-01T00:00:00Z",
  ...over,
});
const roster = () => [person(STAFF_ID, "Ari"), person(SYAM, "Syam"), person(OWNER_PROFILE_ID, "Moshe", { user_id: OWNER })];

async function shot(page: Page, name: string) {
  if (!DIR) return;
  // Let the launch screen, sheets and dialogs finish moving first.
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
}

const COPY = {
  en: {
    add: "Add Person",
    remove: "Remove Syam",
    confirm: "Remove",
    toast: "Syam removed. Other staff phones stay signed in.",
    signIn: "The code changes when you remove someone; phones already signed in stay signed in.",
    entry: "Adding a new staff member",
    entryBody: "type the name they go by and tap Add Person",
    leaves: "When someone leaves",
  },
  id: {
    add: "Tambah Orang",
    remove: "Hapus Syam",
    confirm: "Hapus",
    toast: "Syam dihapus. HP staf lain tetap masuk.",
    signIn: "Kodenya berganti saat Anda menghapus staf; HP yang sudah masuk tetap masuk.",
    entry: "Menambah staf baru",
    entryBody: "ketik nama panggilannya, lalu ketuk Tambah Orang",
    leaves: "Kalau staf berhenti",
  },
} as const;

for (const locale of ["en", "id"] as const) {
  const c = COPY[locale];

  test(`${locale}: removing someone says other phones stay signed in, not "share the new code"`, async ({ context, page }) => {
    const staff = roster();
    await installStub(context, { owner: { locale }, staff, household: { hasPets: true } });
    const archived: unknown[] = [];
    await page.route("**/rest/v1/rpc/archive_staff_profile*", async (route) => {
      const { p_staff_id } = route.request().postDataJSON() as { p_staff_id: string };
      archived.push(p_staff_id);
      const row = staff.find((p) => p.id === p_staff_id)!;
      row.archived_at = new Date().toISOString();
      row.has_pin = false;
      await route.fulfill({ json: null });
    });
    // The toast no longer reads the new code: nothing to share now.
    let codeReads = 0;
    await page.route("**/rest/v1/rpc/my_house_code*", async (route) => {
      codeReads += 1;
      await route.fulfill({ json: "K7PM2Q" });
    });

    await page.goto("/dashboard?module=access&page=staff");
    await expect(page.getByRole("button", { name: c.add })).toBeVisible({ timeout: 20_000 });
    await shot(page, `pr1-${locale}-1-staff`);
    await page.getByRole("button", { name: c.remove }).click();
    await page.getByRole("dialog").getByRole("button", { name: c.confirm, exact: true }).click();
    await expect(page.getByText(c.toast)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await shot(page, `pr1-${locale}-2-removed-toast`);
    expect(archived).toEqual([SYAM]);
    expect(codeReads).toBe(0);

    // The code is on Staff sign-in, where it is needed, with the same line.
    await page.goto("/dashboard?module=access&page=sign-in");
    await expect(page.getByText(c.signIn)).toBeVisible({ timeout: 20_000 });
    await shot(page, `pr1-${locale}-3-sign-in`);
  });

  test(`${locale}: the guide has the staff entries, with the screens' own names`, async ({ context, page }) => {
    await installStub(context, { owner: { locale }, staff: roster(), household: { hasPets: true } });
    await page.goto("/dashboard?module=access&page=how-miamus-works&entry=add-staff");
    await expect(page.getByText(c.entryBody)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: c.entry })).toBeVisible();
    await shot(page, `pr1-${locale}-4-guide-add-staff`);
    await page.goto("/dashboard?module=access&page=how-miamus-works");
    await expect(page.getByText(c.leaves)).toBeVisible({ timeout: 20_000 });
    await shot(page, `pr1-${locale}-5-guide-list`);
  });
}
