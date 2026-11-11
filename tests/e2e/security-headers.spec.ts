import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { freshSession, installStub } from "./stub-backend";

// Pre-launch audit M8: every page sends the security headers, and the
// report-only Content-Security-Policy finds nothing to report on the main
// owner and staff screens (so it can be enforced later without breaking them).

async function watchPolicy(context: BrowserContext) {
  await context.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener("securitypolicyviolation", (e) => {
      seen.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
}

const violations = (page: Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

test("pages and API routes send the security headers", async ({ request }) => {
  for (const path of ["/", "/privacy", "/api/version"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"], path).toContain("microphone=(self)");
    expect(headers["content-security-policy-report-only"], path).toContain("default-src 'self'");
  }
});

test("public pages: nothing for the policy to report", async ({ context, page }) => {
  await watchPolicy(context);
  await installStub(context, { stored: null });
  for (const path of ["/", "/privacy", "/privasi", "/join/code"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await violations(page), path).toEqual([]);
  }
});

test("the owner's tabs: nothing for the policy to report", async ({ context, page }) => {
  await watchPolicy(context);
  await installStub(context, { owner: { locale: "en" } });
  await page.goto("/dashboard");
  await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible({ timeout: 20_000 });
  for (const name of ["Kitchen", "Household", "Today"]) {
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name }).click();
    await page.waitForLoadState("networkidle");
  }
  expect(await violations(page)).toEqual([]);
});

test("the staff page: nothing for the policy to report", async ({ context, page }) => {
  await watchPolicy(context);
  await installStub(context, { stored: freshSession(), staffPhone: true });
  await page.goto("/staff");
  await expect(page.getByRole("button", { name: /Pipis & Pup/ }).first()).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  expect(await violations(page)).toEqual([]);
});
