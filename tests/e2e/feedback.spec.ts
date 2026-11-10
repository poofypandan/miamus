import { expect, test, type BrowserContext } from "@playwright/test";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { OWNER, STAFF_ID, STUB_URL, USER, freshSession, installStub } from "./stub-backend";

// Feedback (roadmap item 9, migrations/135): an owner sends it from About
// Miamus, a staff phone from the Lapor sheet; what goes to the database is
// the message, the kind, the person on duty for a staff phone, the screen
// and the build — nothing else. Answered here, after the stub: Playwright
// tries the most recently added route first.

interface Sent {
  who: string;
  body: Record<string, unknown>;
}

async function catchFeedback(context: BrowserContext, refuse?: string): Promise<Sent[]> {
  const sent: Sent[] = [];
  await context.route(`${STUB_URL}/rest/v1/feedback*`, (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fulfill({ status: 405, json: { message: "stub: send only" } });
    const token = (request.headers()["authorization"] ?? "").split(" ")[1] ?? "";
    let who = "anon";
    try {
      who = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).sub;
    } catch {}
    if (refuse) return route.fulfill({ status: 400, json: { code: "54000", message: refuse, details: null, hint: null } });
    sent.push({ who, body: request.postDataJSON() });
    // A staff phone may not read feedback, so nothing comes back (return=minimal).
    return route.fulfill({ status: 201, body: "" });
  });
  return sent;
}

test("an owner sends feedback from About Miamus", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  const sent = await catchFeedback(context);

  await page.goto("/dashboard?module=access&page=about");
  await page.getByRole("button", { name: /Send feedback/ }).click({ timeout: 20_000 });

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Send feedback" })).toBeVisible();
  await expect(sheet.getByText("Type (optional)")).toBeVisible();
  const send = sheet.getByRole("button", { name: "Send", exact: true });
  await expect(send).toBeDisabled();

  await sheet.getByLabel("Your message").fill("  A dark mode would be lovely.  ");
  await sheet.getByRole("button", { name: "Idea" }).click();
  await expect(sheet.getByRole("button", { name: "Idea" })).toHaveAttribute("aria-pressed", "true");
  await send.click();

  await expect(sheet.getByText("Thank you")).toBeVisible();
  await expect(sheet.getByText("Your message reached the Miamus team.")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0].who).toBe(OWNER);
  expect(sent[0].body).toMatchObject({
    household_id: HOUSEHOLD_ID,
    message: "A dark mode would be lovely.",
    category: "idea",
    staff_id: null,
    page: "/dashboard?module=access&page=about",
  });
  expect(typeof sent[0].body.app_version).toBe("string");
  // Nothing else rides along.
  expect(Object.keys(sent[0].body).sort()).toEqual(
    ["app_version", "category", "household_id", "message", "page", "staff_id"].sort()
  );

  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the Household list opens it too, over the list", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" } });
  const sent = await catchFeedback(context);

  await page.goto("/dashboard?module=access");
  await page.getByRole("button", { name: "Send feedback" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Send feedback" })).toBeVisible();
  // A sheet, not a page: the list stays where it was.
  await expect(page).not.toHaveURL(/page=/);
  await sheet.getByLabel("Your message").fill("Love the Rooms view");
  await sheet.getByRole("button", { name: "Send", exact: true }).click();
  await expect(sheet.getByText("Thank you")).toBeVisible();
  expect(sent[0].body).toMatchObject({ message: "Love the Rooms view", page: "/dashboard?module=access" });
});

test("an owner who reads Indonesian sends it in Indonesian", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "id" } });
  const sent = await catchFeedback(context);

  await page.goto("/dashboard?module=access&page=about");
  await page.getByRole("button", { name: /Kirim masukan/ }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Jenis (opsional)")).toBeVisible();
  await sheet.getByLabel("Pesan Anda").fill("Tolong tambah mode gelap");
  await sheet.getByRole("button", { name: "Kirim", exact: true }).click();
  await expect(sheet.getByText("Terima kasih")).toBeVisible();
  expect(sent[0].body).toMatchObject({ message: "Tolong tambah mode gelap", category: null });
});

test("a staff phone sends feedback as the person on duty", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, chores: [] });
  const sent = await catchFeedback(context);
  await page.goto("/staff");

  // The one-time tip, in Indonesian.
  await expect(page.getByRole("region", { name: "Baru: Kirim masukan" })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: /^Lapor/ }).click();
  await page.getByRole("button", { name: /Kirim masukan/ }).click();

  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Kirim masukan" })).toBeVisible();
  // Staff forms never say "opsional" (docs/indonesian-glossary.md).
  await expect(sheet.getByText("Jenis (boleh dikosongkan)")).toBeVisible();
  await expect(sheet.getByText(/opsional/)).toHaveCount(0);
  await sheet.getByLabel("Pesan Anda").fill("Tombol foto susah ditekan");
  await sheet.getByRole("button", { name: "Masalah" }).click();
  await sheet.getByRole("button", { name: "Kirim", exact: true }).click();

  await expect(sheet.getByText("Terima kasih")).toBeVisible();
  expect(sent).toHaveLength(1);
  expect(sent[0].who).toBe(USER);
  expect(sent[0].body).toMatchObject({
    household_id: HOUSEHOLD_ID,
    message: "Tombol foto susah ditekan",
    category: "problem",
    staff_id: STAFF_ID,
  });
  expect(String(sent[0].body.page)).toMatch(/^\/staff/);
  await sheet.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a refused send keeps the message and says why, in Indonesian", async ({ context, page }) => {
  await installStub(context, { stored: freshSession(), staffPhone: true, chores: [] });
  await catchFeedback(context, "feedback_daily_limit");
  await page.goto("/staff");

  await page.getByRole("button", { name: /^Lapor/ }).click({ timeout: 20_000 });
  await page.getByRole("button", { name: /Kirim masukan/ }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("Pesan Anda").fill("Pesan ke-21");
  await sheet.getByRole("button", { name: "Kirim", exact: true }).click();

  await expect(page.getByText("Sudah banyak pesan hari ini. Coba lagi besok, ya.")).toBeVisible();
  await expect(sheet.getByLabel("Pesan Anda")).toHaveValue("Pesan ke-21");
  await expect(sheet.getByText("Terima kasih")).toHaveCount(0);
});
