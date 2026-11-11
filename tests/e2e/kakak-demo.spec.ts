import { expect, test, type Page } from "@playwright/test";
import { BENTO, HOUSEHOLD_ID, MOCHI, SCHEDULES, logFor, schedule } from "../fixtures/household";
import { STAFF_ID, freshSession, installStub } from "./stub-backend";
import { WHATS_NEW, storageKey } from "../../src/lib/whats-new";

// The Kakak routine demo (Phase 173 PR B; docs/kakak-demo-script.md): the
// intro video's story, beat by beat, recordable with no Anthropic key and no
// real household. Test-only: the stubbed backend and the scripted Kakak reply
// below live in tests/ and never ship with the app.
//
//   1. The ask: one plain sentence to Kakak.
//   2. The build: the card assembles itself (pets, time, photo, Syam, the two switches).
//   3. The payoff: Save, then Kakak's "Done" says what it means for the family.
//   4. The staff side: the routine on Syam's phone, as it would be anyway.
//   5. The evening: nothing to report.
//
// Recording: DEMO_DIR=<folder> saves a screenshot of each beat there and
// turns on Playwright's video (test-results/). See the script for the command.

const DIR = process.env.DEMO_DIR;
test.use({ video: DIR ? "on" : "off" });

// A clean screen for the camera: every What's new card already closed on this phone.
test.beforeEach(async ({ context }) => {
  await context.addInitScript((keys: string[]) => {
    for (const key of keys) localStorage.setItem(key, "seen");
  }, WHATS_NEW.map((entry) => storageKey(entry.id)));
});

const PETS: [string, string] = ["Mocha", "Matcha"];
const SYAM = {
  id: STAFF_ID,
  household_id: HOUSEHOLD_ID,
  name: "Syam",
  has_pin: true,
  user_id: null,
  archived_at: null,
  created_at: "2026-10-01T00:00:00Z",
};

/** The owner's sentence and Kakak's warm reply, as the real Kakak is told to write it (prompt.ts). */
const SCRIPT = {
  en: {
    open: "Tell Kakak",
    box: "What should I set up?",
    send: "Send",
    ask: "Lights off for Mocha and Matcha at 9:30 pm, with a photo. Syam does it. Remind Syam, and tell me if it isn't done.",
    reply: "Of course. I'll have Syam turn the lights off for Mocha and Matcha every night at 21:30, with a photo.",
    heading: "Routine · Mocha & Matcha",
    save: "Save",
    done: "Done. Syam gets a reminder at 21:30; you'll only hear from me if it isn't done.",
    evening: "Not done today",
    allDone: "Everything is done.",
  },
  id: {
    open: "Bilang ke Kakak",
    box: "Mau Kakak atur apa?",
    send: "Kirim",
    ask: "Lampu dimatikan untuk Mocha dan Matcha jam 21.30, pakai foto. Syam yang kerjakan. Ingatkan Syam, kabari saya kalau belum.",
    reply: "Baik, Bu. Kakak siapkan: Syam mematikan lampu untuk Mocha dan Matcha setiap malam jam 21.30, dengan foto.",
    heading: "Rutinitas · Mocha & Matcha",
    save: "Simpan",
    done: "Beres. Syam diingatkan jam 21.30; Kakak hanya mengabari Anda jika belum dikerjakan.",
    evening: "Belum selesai hari ini",
    allDone: "Semua sudah selesai.",
  },
} as const;

async function shot(page: Page, name: string) {
  if (!DIR) return;
  // Let the card's motion settle first.
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${DIR}/${name}.png` });
}

/** What the route would answer for the sentence (lib/kakak/suggestions.ts's shape). */
function kakakReply(text: string) {
  const pets = [MOCHI, BENTO].map((p, i) => ({
    petId: p.id,
    petName: PETS[i],
    times: [{ time: "21:30", title: "Matikan lampu" }],
    alreadyThere: [],
  }));
  return {
    kind: "suggestions",
    text,
    items: [
      {
        kind: "pet_routine",
        routine: "lights",
        title: "Matikan lampu",
        titleEn: null,
        pets,
        days: null,
        until: null,
        staffId: STAFF_ID,
        staffName: "Syam",
        note: null,
        proof: "photo",
        remindStaff: true,
        alertOwners: true,
      },
    ],
    requestId: "00000000-0000-4000-8000-0000000173d1",
    history: { messages: [] },
  };
}

for (const locale of ["id", "en"] as const) {
  const words = SCRIPT[locale];

  test(`demo ${locale}: the ask, the build, the payoff`, async ({ context, page }) => {
    const stub = await installStub(context, {
      owner: { locale },
      kakak: { allowed: true, enabled: true },
      petNames: PETS,
      staff: [SYAM],
    });
    await page.route("**/api/kakak", (route) => route.fulfill({ json: kakakReply(words.reply) }));
    await page.route("**/api/kakak/outcome", (route) => route.fulfill({ json: { ok: true } }));
    await page.goto("/dashboard");

    // 1. The ask.
    await page.getByRole("button", { name: words.open }).click({ timeout: 20_000 });
    await page.getByRole("textbox", { name: words.box }).fill(words.ask);
    await shot(page, `${locale}-1-ask`);
    await page.getByRole("button", { name: words.send }).click();

    // 2. The build: Kakak's own words, then the card, row by row.
    await expect(page.getByText(words.reply)).toBeVisible();
    await expect(page.getByText(words.heading)).toBeVisible();
    await expect(page.locator("dd").getByText("Syam", { exact: true })).toBeVisible();
    await expect(page.getByRole("switch")).toHaveCount(2);
    for (const toggle of await page.getByRole("switch").all()) await expect(toggle).toHaveAttribute("aria-checked", "true");
    await shot(page, `${locale}-2-build`);

    // 3. The payoff.
    await page.getByRole("button", { name: words.save, exact: true }).click();
    const done = page.getByTestId("kakak-saved");
    await expect(done.getByText(words.done)).toBeVisible();
    await shot(page, `${locale}-3-payoff`);
    await expect.poll(() => stub.schedules.filter((s) => s.kind === "lights").length).toBe(2);
    for (const row of stub.schedules.filter((s) => s.kind === "lights")) {
      expect(row).toMatchObject({ title: "Matikan lampu", staff_id: STAFF_ID, remind_staff: true, alert_owners: true, proof: "photo" });
    }
  });
}

const lights = [MOCHI, BENTO].map((p) =>
  schedule(p, "Matikan lampu", ["21:30"], {
    kind: "lights",
    routine_group_id: "00000000-0000-4000-8000-0000000173d2",
    staff_id: STAFF_ID,
    proof: "photo",
    remind_staff: true,
    alert_owners: true,
  })
);

test("demo: the staff side, the routine on Syam's phone as it would be anyway", async ({ context, page }) => {
  await installStub(context, {
    stored: freshSession(),
    staffPhone: true,
    petNames: PETS,
    staff: [SYAM],
    schedules: lights as unknown as Record<string, unknown>[],
  });
  await page.goto("/staff");
  const card = page.getByRole("button", { name: "21.30 Matikan lampu", exact: true });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("Mocha");
  await expect(card).toContainText("Matcha");
  await card.scrollIntoViewIfNeeded();
  await shot(page, "4-staff");
});

for (const locale of ["id", "en"] as const) {
  test(`demo ${locale}: the evening, nothing to report`, async ({ context, page }) => {
    const day = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    // Every routine of the day done, the lights included.
    const logs = [...SCHEDULES, ...lights].flatMap((s) => (s.fixed_times ?? []).map((time) => logFor(s, day, time)));
    await installStub(context, {
      owner: { locale },
      petNames: PETS,
      staff: [SYAM],
      schedules: lights as unknown as Record<string, unknown>[],
      logs: logs as unknown as Record<string, unknown>[],
    });
    await page.goto(`/dashboard?module=agenda&summary=${day}`);
    const sheet = page.getByRole("dialog", { name: SCRIPT[locale].evening });
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    await expect(sheet.getByText(SCRIPT[locale].allDone)).toBeVisible();
    await shot(page, `${locale}-5-evening`);
  });
}
