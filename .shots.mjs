import { chromium } from "@playwright/test";
const out = process.argv[2];
const base = "http://localhost:3410";
const browser = await chromium.launch();
for (const [w, h, tag] of [[390, 844, "390"], [1280, 800, "laptop"]]) {
  for (const [path, lang] of [["/welcome/one-day", "en"], ["/selamat-datang/sehari", "id"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/${tag}-${lang}-top.png` });
    await page.screenshot({ path: `${out}/${tag}-${lang}-full.png`, fullPage: true });
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    let n = 0;
    for (let y = 0; y < total; y += h) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${out}/${tag}-${lang}-s${String(n++).padStart(2, "0")}.png` });
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(tag, lang, "overflow", overflow, "errors", errors.length, errors.slice(0, 2));
    await ctx.close();
  }
}
await browser.close();
