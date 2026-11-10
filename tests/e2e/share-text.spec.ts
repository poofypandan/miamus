import { expect, test, type Page } from "@playwright/test";
import { installStub } from "./stub-backend";

// Warm link previews and share text (owner, 2026-11-10): a link to the app
// shared on WhatsApp reads as Miamus for a home, in Indonesian, with a
// picture; the owner's WhatsApp buttons fill in friendly words.

function meta(html: string, key: string): string | null {
  const match = html.match(new RegExp(`<meta[^>]+(?:property|name)="${key}"[^>]+content="([^"]*)"`));
  return match ? match[1] : null;
}

test("a shared link to the app previews warmly, in Indonesian, with a picture", async ({ request }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain("<title>Miamus untuk rumah Anda</title>");
  expect(meta(html, "description")).toBe("Biar pikiran sedikit lebih ringan. Masuk untuk lihat rumah Anda.");
  expect(meta(html, "og:title")).toBe("Miamus untuk rumah Anda");
  expect(meta(html, "og:description")).toBe("Biar pikiran sedikit lebih ringan. Masuk untuk lihat rumah Anda.");
  expect(meta(html, "og:locale")).toBe("id_ID");
  expect(meta(html, "og:site_name")).toBe("Miamus");
  // The home-screen label stays the short name.
  expect(meta(html, "apple-mobile-web-app-title")).toBe("Miamus");

  const image = meta(html, "og:image");
  expect(image).toMatch(/\/opengraph-image/);
  const png = await request.get(new URL(image!).pathname + new URL(image!).search);
  expect(png.ok()).toBe(true);
  expect(png.headers()["content-type"]).toContain("image/png");
});

test("the landing pages keep their own previews", async ({ request }) => {
  const id = await (await request.get("/selamat-datang")).text();
  expect(meta(id, "og:title")).toBe("Miamus: tahu apa yang sudah beres di rumah");
  expect(meta(id, "og:image")).toMatch(/\/selamat-datang\/opengraph-image/);
  const en = await (await request.get("/welcome")).text();
  expect(meta(en, "og:title")).toBe("Miamus: know what&#x27;s done at home");
  expect(meta(en, "og:image")).toMatch(/\/welcome\/opengraph-image/);
});

/** Clicks a WhatsApp button and returns the text it would send. */
async function sentText(page: Page, button: ReturnType<Page["getByRole"]>): Promise<string> {
  const popup = page.waitForEvent("popup");
  await button.click();
  const opened = await popup;
  const url = new URL(opened.url());
  expect(url.origin).toBe("https://wa.me");
  await opened.close();
  return url.searchParams.get("text") ?? "";
}

for (const locale of ["en", "id"] as const) {
  test(`invite links go out on WhatsApp with warm words (owner reads ${locale})`, async ({ context, page }) => {
    await installStub(context, { owner: { locale } });
    await context.route("https://wa.me/**", (route) => route.fulfill({ contentType: "text/html", body: "<html></html>" }));
    const t = (en: string, id: string) => (locale === "id" ? id : en);
    await page.goto("/dashboard?module=access&page=invite");

    // Family: in the owner's language.
    await page.getByRole("button", { name: t("Invite family", "Undang keluarga") }).click();
    const family = page.getByRole("button", { name: t("Send on WhatsApp", "Kirim lewat WhatsApp") });
    await expect(family).toBeVisible({ timeout: 20_000 });
    const familyText = await sentText(page, family);
    expect(familyText).toMatch(
      locale === "id"
        ? /^Yuk gabung ke rumah kita di Miamus: http:\/\/localhost:\d+\/join\/owner\?token=\S+ \(berlaku 7 hari\)\.$/
        : /^Join our household on Miamus: http:\/\/localhost:\d+\/join\/owner\?token=\S+ \(works for 7 days\)\.$/
    );

    // A staff phone: always Bahasa Indonesia, it is for staff.
    await page.getByRole("button", { name: t("Link a staff phone", "Hubungkan HP staf") }).click();
    const staff = page.getByRole("button", { name: t("Send on WhatsApp", "Kirim lewat WhatsApp") }).nth(1);
    await expect(staff).toBeVisible();
    expect(await sentText(page, staff)).toMatch(
      /^Halo! Ini link untuk menghubungkan HP Anda ke Miamus rumah kita: http:\/\/localhost:\d+\/join\/staff\?token=\S+ \(berlaku 7 hari\)\.$/
    );
  });
}
