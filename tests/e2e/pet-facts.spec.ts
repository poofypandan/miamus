import { expect, test } from "@playwright/test";
import { MOCHI, schedule } from "../fixtures/household";
import { STAFF_ID, installStub } from "./stub-backend";

// A pet's facts card (21 Nov; Fable's 08, section 5, PR 2): the latest
// weight, the next vaccine (amber with its mark once passed) and who looks
// after it, by first name. A fact not known is left out; none, no card.

const record = (over: Record<string, unknown>) => ({
  id: `rec-${Math.random().toString(36).slice(2)}`,
  entity_id: MOCHI.id,
  record_type: "vaccine",
  title: "Rabies",
  administered_at: null,
  next_due_date: null,
  document_photo_url: null,
  notes: null,
  value: null,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

async function serveRecords(page: import("@playwright/test").Page, rows: Record<string, unknown>[]) {
  await page.route("**/rest/v1/medical_records*", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: rows }) : route.fallback()
  );
}

test.beforeEach(async ({ context, page }) => {
  await page.clock.setFixedTime(new Date("2026-11-21T05:30:00+07:00"));
  await context.addInitScript(() => localStorage.setItem("miamus.whats-new.pets-wall-2026-11", "seen"));
});

test("the page's card: weight, next vaccine, looked after by", async ({ context, page }) => {
  await installStub(context, {
    owner: { locale: "en" },
    schedules: [
      schedule(MOCHI, "Jalan pagi", ["06:00"], { staff_id: STAFF_ID }) as unknown as Record<string, unknown>,
      schedule(MOCHI, "Jalan sore", ["17:00"], { staff_id: STAFF_ID }) as unknown as Record<string, unknown>,
    ],
  });
  await serveRecords(page, [
    record({ record_type: "weight", title: "Weight", value: 4.2, administered_at: "2026-11-02" }),
    record({ record_type: "weight", title: "Weight", value: 4.0, administered_at: "2026-09-01" }),
    record({ title: "DHPP", administered_at: "2026-03-01", next_due_date: "2027-01-14" }),
  ]);
  await page.goto("/dashboard?module=pets");
  await page.getByRole("list", { name: "Your pets" }).getByRole("button", { name: /^Mochi/ }).click({ timeout: 20_000 });
  const card = page.getByRole("dialog", { name: "Mochi" }).getByRole("region", { name: "About" });
  await expect(card).toContainText("Weight");
  await expect(card).toContainText("4.2 kg");
  await expect(card).toContainText("Next vaccine");
  await expect(card).toContainText("DHPP");
  await expect(card).toContainText("Looked after by");
  await expect(card).toContainText("Ari");
});

test("a vaccine past its date is amber, in Bahasa Indonesia; nothing known, no card", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" } });
  await serveRecords(page, [record({ title: "Rabies", administered_at: "2025-11-01", next_due_date: "2026-11-01" })]);
  await page.goto("/dashboard?module=pets");
  await page.getByRole("list", { name: "Hewan Anda" }).getByRole("button", { name: /^Mochi/ }).click({ timeout: 20_000 });
  const card = page.getByRole("dialog", { name: "Mochi" }).getByRole("region", { name: "Tentang" });
  await expect(card).toContainText("Vaksin berikutnya");
  await expect(card).toContainText("Lewat jatuh tempo");
  await page.keyboard.press("Escape");
  await page.getByRole("list", { name: "Hewan Anda" }).getByRole("button", { name: /^Bento/ }).click();
  await expect(page.getByRole("dialog", { name: "Bento" }).getByRole("region", { name: "Tentang" })).toHaveCount(0);
});
