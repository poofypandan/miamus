import { expect, test, type BrowserContext } from "@playwright/test";
import sharp from "sharp";
import { HOUSEHOLD_ID } from "../fixtures/household";
import { installStub } from "./stub-backend";

// Phase 174 PR C (docs/phase-174-repairs-walkin-plan.md, D7 A): an owner
// sends the open repairs to the developer from Chores → Repairs: every open
// one ticked, untick what isn't theirs, then the phone's share sheet (text
// plus the photos as files) or a page to save as PDF. Miamus sends nothing.

const id = (n: number) => `00000000-0000-4000-8000-0000000009${String(n).padStart(2, "0")}`;
const LT2 = {
  id: id(1),
  household_id: HOUSEHOLD_ID,
  name: "LT2",
  created_at: "2026-10-01T00:00:00Z",
  kind: "floor",
  parent_id: null,
  sort_order: 0,
};
const GUEST = { ...LT2, id: id(2), name: "Kamar Tamu 1", kind: "room", parent_id: LT2.id };
const storage = (name: string) =>
  `http://supabase.test/storage/v1/object/public/household-logs/${HOUSEHOLD_ID}/repairs/${name}`;

const repair = (n: number, over: Record<string, unknown> = {}) => ({
  id: id(n),
  household_id: HOUSEHOLD_ID,
  location_id: GUEST.id,
  spot: null,
  title: `Repair ${n}`,
  details: null,
  photo_url: null,
  urgent: false,
  status: "open",
  reported_by_staff: null,
  created_by: null,
  created_at: "2026-11-09T03:00:00Z",
  updated_at: "2026-11-09T03:00:00Z",
  decided_by: null,
  decided_at: null,
  dismiss_reason: null,
  fixed_by_name: null,
  closed_at: null,
  ...over,
});

const REPAIRS = () => [
  repair(10, { title: "Keran bocor", spot: "Wastafel", urgent: true, photo_url: storage("keran.jpg") }),
  repair(11, { title: "Dinding retak", details: "Retak rambut dekat jendela", photo_url: storage("dinding.jpg"), created_at: "2026-11-02T03:00:00Z" }),
  repair(12, { title: "Lampu taman mati", location_id: null }),
  // Not on the list: fixed, and a staff report still waiting for review.
  repair(13, { title: "Pintu seret", status: "fixed", closed_at: new Date().toISOString() }),
  repair(14, { title: "Laporan staf", status: "reported" }),
];

const WALK_IN = {
  id: id(30),
  household_id: HOUSEHOLD_ID,
  repair_id: id(11),
  worker_name: "Pak Budi",
  logged_by_staff: null,
  created_by: null,
  arrived_at: "2026-11-10T02:00:00Z",
  arrived_phone_at: "2026-11-10T02:00:00Z",
  before_photo_url: storage("dinding-before.jpg"),
  left_at: "2026-11-10T04:00:00Z",
  left_phone_at: "2026-11-10T04:00:00Z",
  after_photo_url: storage("dinding-after.jpg"),
  outcome: "come_back",
  note: null,
};

async function setUp(context: BrowserContext, locale: "en" | "id", { share = true, photoDelayMs = 0 } = {}) {
  await installStub(context, { owner: { locale }, rooms: [LT2, GUEST], chores: [], repairs: REPAIRS(), walkIns: [WALK_IN] });
  const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 150, g: 140, b: 120 } } })
    .jpeg()
    .toBuffer();
  // Every photo asked for, and every one the page gave up on (closed sheet).
  const photos = { requested: [] as string[], aborted: [] as string[] };
  context.on("requestfailed", (request) => {
    if (request.url().includes("/api/photo")) photos.aborted.push(request.url());
  });
  await context.route("**/api/photo**", async (route) => {
    photos.requested.push(route.request().url());
    if (photoDelayMs) await new Promise((resolve) => setTimeout(resolve, photoDelayMs));
    await route.fulfill({ contentType: "image/jpeg", body: jpeg }).catch(() => undefined);
  });
  await context.route("https://wa.me/**", (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
  await context.addInitScript(
    ({ share }) => {
      for (const card of ["walkins-2026-11", "repair-costs-2026-11", "repairs-2026-11", "rooms-2026-11", "floors-2026-11"]) {
        localStorage.setItem(`miamus.whats-new.${card}`, "seen");
      }
      const w = window as unknown as { __shared: unknown[]; __printed: number };
      w.__shared = [];
      w.__printed = 0;
      window.print = () => {
        w.__printed += 1;
      };
      if (share) {
        Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async (data: { text?: string; files?: File[] }) => {
            w.__shared.push({ text: data.text, files: (data.files ?? []).map((f) => ({ name: f.name, type: f.type, size: f.size })) });
          },
        });
      } else {
        Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
        Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
      }
    },
    { share }
  );
  return photos;
}

test("an owner sends the open repairs to the developer: untick one, share text and photos, Indonesian by default", async ({
  context,
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-11T09:30:00+07:00"));
  await setUp(context, "en");
  await page.goto("/dashboard?module=chores&chores=repairs");
  await page.getByRole("button", { name: "Send to the developer" }).click({ timeout: 20_000 });

  const sheet = page.getByRole("dialog", { name: "Send to the developer" });
  await expect(sheet.getByText("Untick what isn't the developer's.")).toBeVisible();
  const list = sheet.getByRole("region", { name: "Repairs to send" });
  // Every open repair, ticked; the fixed one and the waiting report aren't there.
  await expect(list.getByRole("checkbox")).toHaveCount(3);
  for (const title of ["Keran bocor", "Dinding retak", "Lampu taman mati"]) {
    await expect(list.getByRole("checkbox", { name: title })).toHaveAttribute("aria-checked", "true");
  }
  await expect(list.getByText("Pintu seret")).toHaveCount(0);
  await expect(list.getByRole("checkbox", { name: "Dinding retak" })).toContainText("Reported 2 Nov · Not finished, needs another visit · 2 photos");

  // The message: Indonesian by default, whatever the owner reads.
  await expect(sheet.getByRole("tab", { name: "Bahasa Indonesia" })).toHaveAttribute("aria-selected", "true");
  const text = sheet.getByTestId("developer-text");
  await expect(text).toContainText("Daftar perbaikan, Rumah Uji, 11 Nov 2026: 3 item");

  // Untick the garden lamp: it isn't the developer's.
  await list.getByRole("checkbox", { name: "Lampu taman mati" }).click();
  await expect(list.getByRole("checkbox", { name: "Lampu taman mati" })).toHaveAttribute("aria-checked", "false");
  await expect(text).toContainText("Daftar perbaikan, Rumah Uji, 11 Nov 2026: 2 item");
  await expect(text).not.toContainText("Lampu taman mati");

  const share = sheet.getByRole("button", { name: "Share on WhatsApp" });
  await expect(share).toBeEnabled();
  await share.click();
  const shared = () => page.evaluate(() => (window as unknown as { __shared: { text: string; files: { name: string }[] }[] }).__shared);
  await expect.poll(async () => (await shared()).length).toBe(1);
  const [sent] = await shared();
  expect(sent.text).toBe(
    [
      "Selamat pagi, Pak/Bu. Mohon bantuannya untuk perbaikan berikut.",
      "",
      "Daftar perbaikan, Rumah Uji, 11 Nov 2026: 2 item",
      "",
      "1. Keran bocor (darurat)",
      "   LT2 · Kamar Tamu 1 · Wastafel",
      "   Dilaporkan 9 Nov · Belum dikerjakan",
      "",
      "2. Dinding retak",
      "   LT2 · Kamar Tamu 1",
      "   Retak rambut dekat jendela",
      "   Dilaporkan 2 Nov · Belum selesai, perlu datang lagi",
      "",
      "Fotonya terlampir, nomornya sesuai daftar ini.",
      "Terima kasih banyak atas bantuannya, Pak/Bu.",
    ].join("\n")
  );
  // The problem photos, and the latest visit's after photo, named by number.
  expect(sent.files.map((f) => f.name)).toEqual(["perbaikan-1a.jpg", "perbaikan-2a.jpg", "perbaikan-2b.jpg"]);

  // English is one tap away, and the phone remembers it.
  await sheet.getByRole("tab", { name: "English" }).click();
  await expect(text).toContainText("Repair list, Rumah Uji, 11 Nov 2026: 2 items");
  await expect(text).toContainText("1. Keran bocor (urgent)");
  await expect(text).toContainText("Reported 2 Nov · Not finished, needs another visit");
  await expect(text).toContainText("Photos attached, numbered to match this list.");
  expect(await page.evaluate(() => localStorage.getItem("miamus.developer-list.lang"))).toBe("en");
});

test("Save as PDF opens a page made for paper, one repair per block, and the print dialog", async ({ context, page }) => {
  await page.clock.setFixedTime(new Date("2026-11-11T14:00:00+07:00"));
  await setUp(context, "id");
  await page.goto("/dashboard?module=chores&chores=repairs");
  await page.getByRole("button", { name: "Kirim ke developer" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog", { name: "Kirim ke developer" });
  await sheet.getByRole("checkbox", { name: "Lampu taman mati" }).click();
  await sheet.getByRole("button", { name: "Simpan sebagai PDF" }).click();

  const paper = page.getByRole("dialog", { name: "Daftar perbaikan" });
  await expect(paper.getByRole("heading", { name: "Daftar perbaikan", level: 1 })).toBeVisible();
  await expect(paper.getByText("Rumah Uji · 11 Nov 2026 · 2 item")).toBeVisible();
  const blocks = paper.locator("section");
  await expect(blocks).toHaveCount(2);
  await expect(blocks.nth(0).getByRole("heading", { level: 2 })).toHaveText("1. Keran bocor (darurat)");
  await expect(blocks.nth(1).getByRole("heading", { level: 2 })).toHaveText("2. Dinding retak");
  await expect(blocks.nth(1).getByText("Dilaporkan 2 Nov · Belum selesai, perlu datang lagi")).toBeVisible();
  await expect(blocks.nth(1).getByText("2b · Kunjungan terakhir")).toBeVisible();
  await expect(paper.getByText("Lampu taman mati")).toHaveCount(0);
  // The print dialog opens by itself once the photos are in.
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printed: number }).__printed)).toBe(1);

  // On paper only the list: the app around it is hidden.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Kirim ke developer" })).toBeHidden();
  await expect(paper.getByRole("button", { name: "Cetak atau simpan PDF" })).toBeHidden();
  await expect(paper.getByText("1. Keran bocor (darurat)")).toBeVisible();
  await page.emulateMedia({ media: "screen" });

  // Back returns to the sheet, the ticks as they were.
  await paper.getByRole("button", { name: "Kembali" }).click();
  await expect(paper).toHaveCount(0);
  await expect(sheet.getByRole("checkbox", { name: "Lampu taman mati" })).toHaveAttribute("aria-checked", "false");
});

test("without a share sheet, the text opens in WhatsApp and the PDF is offered for the photos", async ({ context, page }) => {
  await page.clock.setFixedTime(new Date("2026-11-11T19:00:00+07:00"));
  await setUp(context, "en", { share: false });
  await page.goto("/dashboard?module=chores&chores=repairs");
  await page.getByRole("button", { name: "Send to the developer" }).click({ timeout: 20_000 });
  const sheet = page.getByRole("dialog", { name: "Send to the developer" });
  await expect(sheet.getByText("This browser can't attach photos to a message.", { exact: false })).toBeVisible();
  const text = sheet.getByTestId("developer-text");
  await expect(text).toContainText("Selamat malam, Pak/Bu.");
  await expect(text).not.toContainText("Fotonya terlampir");

  const popup = page.waitForEvent("popup");
  await sheet.getByRole("button", { name: "Share on WhatsApp" }).click();
  const opened = await popup;
  const url = new URL(opened.url());
  expect(url.origin).toBe("https://wa.me");
  expect(url.searchParams.get("text")).toMatch(/^Selamat malam, Pak\/Bu\.[\s\S]*3 item[\s\S]*Terima kasih banyak atas bantuannya, Pak\/Bu\.$/);
  await opened.close();
});

test("with no open repairs there is nothing to send", async ({ context, page }) => {
  await installStub(context, { owner: { locale: "en" }, chores: [], repairs: [repair(13, { title: "Pintu seret", status: "fixed", closed_at: new Date().toISOString() })] });
  await context.addInitScript(() => {
    for (const card of ["walkins-2026-11", "repair-costs-2026-11", "repairs-2026-11"]) {
      localStorage.setItem(`miamus.whats-new.${card}`, "seen");
    }
  });
  await page.goto("/dashboard?module=chores&chores=repairs");
  await expect(page.getByRole("region", { name: "Fixed" }).getByText("Pintu seret")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Send to the developer" })).toHaveCount(0);
});

test("photos download only while the sheet is open, and closing it stops them (Codex, PR #99)", async ({ context, page }) => {
  const photos = await setUp(context, "en", { photoDelayMs: 3_000 });
  await page.goto("/dashboard?module=chores&chores=repairs");
  const button = page.getByRole("button", { name: "Send to the developer" });
  await expect(button).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("region", { name: "Open" }).getByText("Keran bocor")).toBeVisible();
  // Repairs on its own, sheet closed: not one photo asked for.
  await page.waitForTimeout(1_500);
  expect(photos.requested).toEqual([]);

  // Opening the sheet starts the full-size downloads for sharing.
  await button.click();
  const sheet = page.getByRole("dialog", { name: "Send to the developer" });
  await expect(sheet.getByRole("button", { name: "Getting the photos ready…" })).toBeDisabled();
  const fullSize = () => photos.requested.filter((url) => url.includes("w=1280"));
  await expect.poll(() => fullSize().length).toBe(3);

  // Closed before they arrive: the page stops waiting for them.
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  await expect.poll(() => photos.aborted.filter((url) => url.includes("w=1280")).length).toBe(3);
});
