import { expect, test, type BrowserContext } from "@playwright/test";
import { installStub } from "./stub-backend";

// Turning notifications on (2026-11-10). Production had no push subscriptions
// at all while the only way in was Household → Notifications, so the
// dashboard now asks on any device where push is off, says when it's
// blocked, and remembers "Not now" on the device.

// Any 65-byte P-256 point, base64url: only shown to the browser, never used
// to subscribe in these tests.
const PUSH_KEY = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";

/** The browser's answer to Notification.permission, as if the person had (or hadn't) chosen. */
async function permission(context: BrowserContext, value: NotificationPermission) {
  await context.addInitScript((answer) => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => answer });
  }, value);
}

const tabs = (page: import("@playwright/test").Page, name = "Sections") => page.getByRole("navigation", { name });

test("push off: the dashboard asks, Not now puts it off on this phone", async ({ context, page }) => {
  await permission(context, "default");
  await installStub(context, { owner: { locale: "en" }, pushKey: PUSH_KEY });
  await page.goto("/dashboard");

  const prompt = page.getByRole("region", { name: "Turn on notifications" });
  await expect(prompt).toBeVisible({ timeout: 20_000 });
  await expect(prompt.getByRole("button", { name: "Turn on" })).toBeEnabled();

  // Household lists it as Off, waiting on the owner.
  await tabs(page).getByRole("link", { name: "Household" }).click();
  await expect(page.getByRole("button", { name: /^Notifications/ })).toContainText("Off");

  await prompt.getByRole("button", { name: "Not now" }).last().click();
  await expect(prompt).toHaveCount(0);
  await page.reload();
  await expect(tabs(page).getByRole("link", { name: "Household" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /^Notifications/ })).toContainText("Off");
  await expect(page.getByRole("region", { name: "Turn on notifications" })).toHaveCount(0);
});

test("blocked: says so in the owner's language, and Details opens the settings", async ({ context, page }) => {
  await permission(context, "denied");
  await installStub(context, { owner: { locale: "id" }, pushKey: PUSH_KEY });
  await page.goto("/dashboard");

  const prompt = page.getByRole("region", { name: "Notifikasi diblokir" });
  await expect(prompt).toBeVisible({ timeout: 20_000 });
  await prompt.getByRole("button", { name: "Selengkapnya" }).click();

  await expect(page).toHaveURL(/module=access&page=notifications/);
  await expect(page.getByText("Diblokir", { exact: true })).toBeVisible();
  await expect(page.getByText(/diblokir di perangkat ini/)).toBeVisible();
  // Not shown twice on the page that already explains it.
  await expect(page.getByRole("region", { name: "Notifikasi diblokir" })).toHaveCount(0);
});

test("push not set up on the server: no prompt", async ({ context, page }) => {
  await permission(context, "default");
  await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard?module=access");

  await expect(page.getByRole("button", { name: /^Notifications/ })).toContainText("Not available", {
    timeout: 20_000,
  });
  await expect(page.getByRole("region", { name: "Turn on notifications" })).toHaveCount(0);
});
