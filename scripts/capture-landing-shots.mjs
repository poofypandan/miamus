/**
 * Captures the landing page's screenshots (public/landing/*.webp) from the
 * real app in mock mode, with made-up data (scripts/landing-shots).
 *
 *   NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= npm run build
 *   node scripts/capture-landing-shots.mjs
 *
 * The build must be a mock-mode one (no Supabase URL), so nothing leaves the
 * browser. This script starts its own `next start` on port 3390 and stops it
 * when done. Re-run it when one of the captured screens changes noticeably.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID, SARI, sampleDb } from "./landing-shots/sample-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public/landing");
const PORT = 3390;
const BASE = `http://localhost:${PORT}`;
// The captures are 390 × 700 CSS px at 2× (src/components/landing/landing-page.tsx).
const VIEWPORT = { width: 390, height: 700 };
// A fixed morning, so every run shows the same day: breakfast done, the
// terrace due at 09.00.
const CLOCK_TIME = "08:40";

/** Today's date in Jakarta. */
function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}

/** A soft, wordless stand-in for a photo: a warm tile, darker before, lighter after. */
async function photo(top, bottom) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
    <rect width="480" height="480" fill="url(#g)"/>
    <rect y="300" width="480" height="180" fill="#000" opacity="0.06"/>
  </svg>`;
  const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 70 }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}

async function whatsNewIds() {
  const source = await readFile(path.join(ROOT, "src/lib/whats-new.ts"), "utf8");
  return [...source.matchAll(/^\s+id: "([^"]+)",$/gm)].map((match) => match[1]);
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${BASE}/welcome`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("next start did not come up");
}

async function main() {
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "" };
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: "ignore" });
  try {
    await waitForServer();
    await mkdir(OUT, { recursive: true });
    const today = jakartaToday();
    const photos = { beforePhoto: await photo("#b8b0a6", "#8c847b"), afterPhoto: await photo("#efe9e1", "#d8cfc4") };
    const seen = await whatsNewIds();
    const browser = await chromium.launch();

    async function capture(name, { state, locale, staff = false, url, then }) {
      const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        locale: locale === "id" ? "id-ID" : "en-US",
        timezoneId: "Asia/Jakarta",
      });
      await context.clock.install({ time: new Date(`${today}T${CLOCK_TIME}:00+07:00`) });
      const db = sampleDb({ today, state, ...photos });
      await context.addInitScript(
        ({ db, locale, seen, staff, household, sari }) => {
          if (sessionStorage.getItem("shots-seeded")) return;
          sessionStorage.setItem("shots-seeded", "1");
          localStorage.clear();
          localStorage.setItem("maimus_mock_db_v1", JSON.stringify(db));
          localStorage.setItem("miamus.owner-locale", locale);
          localStorage.setItem("miamus.public-locale", locale);
          localStorage.setItem("b11_onboarding_dismissed", "true");
          for (const id of seen) localStorage.setItem(`miamus.whats-new.${id}`, "seen");
          if (staff) {
            localStorage.setItem("miamus_tenant_id", household);
            localStorage.setItem("banyuwangi11:staffId", sari);
            localStorage.setItem("banyuwangi11:staffName", "Sari");
          }
        },
        { db, locale, seen, staff, household: HOUSEHOLD_ID, sari: SARI }
      );
      const page = await context.newPage();
      await page.goto(`${BASE}${url}`);
      if (then) await then(page);
      await page.waitForTimeout(800);
      const png = await page.screenshot({ fullPage: !!process.env.SHOTS_FULL_PAGE });
      await writeFile(path.join(OUT, `${name}.webp`), await sharp(png).webp({ quality: 82 }).toBuffer());
      console.log(`captured ${name}`);
      await context.close();
    }

    const waitFor = (text) => async (page) => {
      await page.getByText(text, { exact: false }).first().waitFor({ timeout: 20_000 });
    };

    for (const locale of ["en", "id"]) {
      // Today scrolled down to the finished work (green, with who did it).
      await capture(`${locale}-owner-today`, {
        state: "done",
        locale,
        url: "/dashboard?module=agenda",
        then: async (page) => {
          await waitFor("Pel teras")(page);
          await page.waitForTimeout(500);
          await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
        },
      });
      await capture(`${locale}-owner-done`, {
        state: "done",
        locale,
        url: "/dashboard?module=chores",
        then: waitFor("Pel teras"),
      });
      await capture(`${locale}-owner-chore`, {
        state: "pending",
        locale,
        url: "/dashboard?module=chores",
        then: async (page) => {
          await waitFor("Pel teras")(page);
          await page.getByText("Pel teras").first().click();
          await page.getByRole("dialog").waitFor({ timeout: 10_000 });
          // The form selects the title on open; a screenshot shouldn't.
          await page.waitForTimeout(400);
          await page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null));
        },
      });
    }

    await capture("staff-today", {
      state: "pending",
      locale: "id",
      staff: true,
      url: "/staff",
      then: async (page) => {
        // The phone remembers Sari; her PIN may still be asked.
        const pin = page.getByText("Masukkan PIN");
        if (await pin.isVisible({ timeout: 5_000 }).catch(() => false)) {
          for (const digit of "1234") await page.getByRole("button", { name: digit, exact: true }).click();
        }
        await waitFor("Pel teras")(page);
        // Mock mode has no anonymous staff sessions, so the phone counts as
        // an owner's and shows the owner's Ringkasan | Staf switch. A staff
        // phone shows the person on duty instead (OnDutyBadge in
        // src/app/staff/page.tsx); draw exactly that in its place.
        await page.evaluate(() => {
          // ViewSwitch (src/components/navigation/app-header.tsx).
          const pill = document.querySelector(
            '[role=tablist][aria-label="Pilih tampilan"], [role=tablist][aria-label="Choose view"]'
          );
          if (!pill) throw new Error("owner switch not found");
          const badge = document.createElement("span");
          badge.className =
            "flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-xs font-medium text-gray-500";
          badge.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>Sari';
          pill.replaceWith(badge);
        });
      },
    });

    await browser.close();
  } finally {
    server.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
