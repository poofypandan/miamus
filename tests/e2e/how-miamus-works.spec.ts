import { expect, test, type Page } from "@playwright/test";
import { installStub } from "./stub-backend";
import { GUIDE, GUIDE_GROUPS, GUIDE_GROUP_TITLES } from "../../src/lib/guide";

// How Miamus works (Phase 180 H2, docs/phase-180-kakak-answers-plan.md,
// section 5): the guide Kakak answers from, as a screen an owner reads by
// hand. Settings → About Miamus → the row; the list in its five groups; an
// entry and its one button landing on the screen it is about; an entry whose
// feature is switched off sending the owner to Settings → Features; Back up
// one step at a time. In English and in Bahasa Indonesia.
//
// Phone-size screenshots of the list and an open entry, in both languages,
// when SHOTS_DIR is set:
//
//   SHOTS_DIR=<folder> CI=1 npx playwright test tests/e2e/how-miamus-works.spec.ts

const DIR = process.env.SHOTS_DIR;
test.use({ viewport: { width: 390, height: 844 } });

const tabs = (page: Page, locale: "en" | "id") => page.getByRole("navigation", { name: locale === "id" ? "Bagian" : "Sections" });

const COPY = {
  en: {
    about: "About Miamus",
    row: /How Miamus works/,
    heading: "How Miamus works",
    entry: "Chores and routines",
    body: "A chore is a job in the house",
    goChores: "Go to Home → Chores",
    homeTab: "Home",
    choresPill: "Chores",
    off: "Switched off. Turn it on in Settings → Features.",
    repairs: "Repairs",
    goFeatures: "Go to Settings → Features",
    features: "Features",
    settings: "Settings",
  },
  id: {
    about: "Tentang Miamus",
    row: /Cara pakai Miamus/,
    heading: "Cara pakai Miamus",
    entry: "Tugas dan rutinitas",
    body: "Tugas adalah pekerjaan rumah",
    goChores: "Buka Rumah → Tugas",
    homeTab: "Rumah",
    choresPill: "Tugas",
    off: "Sedang dimatikan. Nyalakan di Pengaturan → Fitur.",
    repairs: "Perbaikan",
    goFeatures: "Buka Pengaturan → Fitur",
    features: "Fitur",
    settings: "Pengaturan",
  },
} as const;

for (const locale of ["en", "id"] as const) {
  const c = COPY[locale];

  test(`${locale}: About Miamus opens the guide; an entry's button lands on its screen; Back goes up one step`, async ({
    context,
    page,
  }) => {
    await installStub(context, { owner: { locale }, features: { repairs: true, bills: true, food: true, kitchen: true } });
    await page.goto("/dashboard?module=access&page=about");

    // The row on About Miamus.
    await page.getByRole("link", { name: c.row }).click({ timeout: 20_000 });
    await expect(page).toHaveURL(/[?&]page=how-miamus-works(&|$)/);
    await expect(page.getByRole("heading", { name: c.heading, level: 2 })).toBeVisible();

    // The five groups, in the guide's order, each with its own entries.
    const groupTitles = await page.getByRole("heading", { level: 3 }).allTextContents();
    expect(groupTitles.map((title) => title.trim())).toEqual(GUIDE_GROUPS.map((group) => GUIDE_GROUP_TITLES[group][locale]));
    for (const group of GUIDE_GROUPS) {
      const section = page.getByRole("region", { name: GUIDE_GROUP_TITLES[group][locale] });
      await expect(section.getByRole("button")).toHaveCount(GUIDE.filter((entry) => entry.group === group).length);
    }
    if (DIR) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/how-miamus-works-list-${locale}.png` });
    }

    // An entry: its title, its body, one button.
    await page.getByRole("button", { name: c.entry }).click();
    await expect(page).toHaveURL(/[?&]entry=chores-vs-routines(&|$)/);
    await expect(page.getByRole("heading", { name: c.entry, level: 2 })).toBeVisible();
    await expect(page.getByText(c.body)).toBeVisible();
    await expect(page.getByText(c.off)).toHaveCount(0);
    const go = page.getByRole("link", { name: c.goChores });
    await expect(go).toBeVisible();
    if (DIR) {
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${DIR}/how-miamus-works-entry-${locale}.png` });
    }

    // The open entry is in the URL, so it survives a remount.
    await page.reload();
    await expect(page.getByRole("heading", { name: c.entry, level: 2 })).toBeVisible({ timeout: 20_000 });

    // Back: the entry → the list → About Miamus.
    await page.getByRole("button", { name: c.heading }).click();
    await expect(page.getByRole("heading", { name: c.heading, level: 2 })).toBeVisible();
    await expect(page).not.toHaveURL(/entry=/);
    await page.getByRole("button", { name: c.about }).click();
    await expect(page.getByRole("heading", { name: c.about, level: 2 })).toBeVisible();
    await page.getByRole("button", { name: c.settings }).click();
    await expect(page).not.toHaveURL(/page=/);

    // And the button lands on the screen the entry is about: Home → Chores.
    await page.goto("/dashboard?module=access&page=how-miamus-works&entry=chores-vs-routines");
    await page.getByRole("link", { name: c.goChores }).click({ timeout: 20_000 });
    await expect(page).toHaveURL(/[?&]module=chores(&|$)/);
    await expect(tabs(page, locale).getByRole("link", { name: c.homeTab })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("tab", { name: c.choresPill })).toHaveAttribute("aria-selected", "true");
  });

  test(`${locale}: an entry whose feature is off says so, and its button goes to Settings → Features`, async ({
    context,
    page,
  }) => {
    await installStub(context, { owner: { locale }, features: { repairs: false } });
    await page.goto("/dashboard?module=access&page=how-miamus-works");
    await page.getByRole("button", { name: c.repairs, exact: true }).click({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: c.repairs, level: 2 })).toBeVisible();
    await expect(page.getByText(c.off)).toBeVisible();
    await page.getByRole("link", { name: c.goFeatures }).click();
    await expect(page).toHaveURL(/[?&]page=features(&|$)/);
    await expect(page.getByRole("heading", { name: c.features, level: 2 })).toBeVisible();
    await expect(page.getByRole("switch", { name: c.repairs })).toHaveAttribute("aria-checked", "false");
  });

  test(`${locale}: an entry about Miamus as a whole has no button`, async ({ context, page }) => {
    await installStub(context, { owner: { locale } });
    await page.goto("/dashboard?module=access&page=how-miamus-works&entry=what-miamus-is-for");
    const entry = GUIDE.find((e) => e.id === "what-miamus-is-for")!;
    await expect(page.getByRole("heading", { name: entry.title[locale], level: 2 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(entry.body[locale])).toBeVisible();
    await expect(page.getByRole("link", { name: locale === "en" ? /^Go to / : /^Buka / })).toHaveCount(0);
  });
}
