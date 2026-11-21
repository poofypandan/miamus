import { expect, test, type Locator, type Page } from "@playwright/test";
import { installStub } from "./stub-backend";
import { WHATS_NEW, storageKey } from "../../src/lib/whats-new";

// Quiet motion (04, PR 7): a press settles, the chosen pill slides, a sheet
// arrives and comes to rest, and nothing moves under reduced motion. What is
// checked is the motion's shape (where things land, the kit's easings, and
// none at all under reduced motion), not its frames.

test.beforeEach(async ({ context }) => {
  await context.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "seen");
  }, WHATS_NEW.map((entry) => storageKey(entry.id)));
});

const TRAVEL = "cubic-bezier(0.65, 0, 0.35, 1)";
const ARRIVE = "cubic-bezier(0.16, 1, 0.3, 1)";

async function kitchen(page: Page) {
  await page.goto("/dashboard?module=inventory");
  const track = page.getByRole("tablist", { name: "Kitchen" });
  await expect(track).toBeVisible({ timeout: 20_000 });
  return track;
}

/** Whether the pill's left edge sits on the chosen tab's. */
async function pillOnChosen(track: Locator) {
  const pill = await track.getByTestId("segment-pill").boundingBox();
  const tab = await track.getByRole("tab", { selected: true }).boundingBox();
  return !!pill && !!tab && Math.abs(pill.x - tab.x) < 1 && Math.abs(pill.width - tab.width) < 1;
}

test("the chosen pill slides to its new place on the kit's travel easing", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: true } });
  const track = await kitchen(page);
  const pill = track.getByTestId("segment-pill");
  await expect(pill).toHaveCount(1);
  await expect.poll(() => pillOnChosen(track)).toBe(true);

  const tabs = track.getByRole("tab");
  const last = tabs.nth((await tabs.count()) - 1);
  await last.click();
  await expect(last).toHaveAttribute("aria-selected", "true");
  // It lands under the new tab, and gets there by moving, not by jumping.
  await expect.poll(() => pillOnChosen(track)).toBe(true);
  const style = await pill.evaluate((el) => {
    const s = getComputedStyle(el);
    return { property: s.transitionProperty, duration: s.transitionDuration, easing: s.transitionTimingFunction };
  });
  expect(style.property).toContain("translate");
  expect(style.duration).toContain("0.32s");
  expect(style.easing).toContain(TRAVEL);
});

test("a sheet arrives from below on the arrive easing", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, kakak: { allowed: true, enabled: true } });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible();
  const style = await sheet.evaluate((el) => {
    const s = getComputedStyle(el);
    return { enter: s.getPropertyValue("--tw-enter-translate-y").trim(), easing: s.animationTimingFunction, duration: s.animationDuration };
  });
  expect(style.enter).toBe("100%");
  expect(style.easing).toBe(ARRIVE);
  expect(style.duration).toBe("0.42s");
});

test("with reduced motion, nothing slides or settles", async ({ context, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installStub(context, { owner: { locale: "en" }, features: { kitchen: true }, kakak: { allowed: true, enabled: true } });
  const track = await kitchen(page);
  await expect(track.getByTestId("segment-pill")).toHaveCount(1);
  expect(await track.getByTestId("segment-pill").evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("none");

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Tell Kakak" }).click({ timeout: 20_000 });
  const sheet = page.locator('[data-slot="sheet-content"]');
  await expect(sheet).toBeVisible();
  // The sheet only fades.
  expect(await sheet.evaluate((el) => getComputedStyle(el).getPropertyValue("--tw-enter-translate-y").trim())).toBe("0");
  // A shared Button keeps its size under the thumb.
  const button = sheet.locator('[data-slot="button"]').first();
  expect(await button.evaluate((el) => getComputedStyle(el).transitionProperty)).toBe("none");
});
