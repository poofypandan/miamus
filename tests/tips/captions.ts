import type { Page } from "@playwright/test";
import { tipLocale, videoTip, type VideoTipId, type VideoTipLocale } from "../../src/lib/video-tips";

/**
 * Shows a tip's captions on the page while it is recorded, one at a time,
 * so they are part of the video (captions only, no voice: D12). The same
 * lines go into the .vtt for screen readers (scripts/finish-tips.ts).
 */
export async function captions(page: Page, id: VideoTipId, locale: VideoTipLocale) {
  const tip = videoTip(id);
  if (!tip) throw new Error(`no tip ${id}`);
  const lines = tip.captions[tipLocale(tip, locale)] ?? tip.captions.id;
  let next = 0;
  return {
    /** Shows the next caption and holds it for a moment. */
    async show(holdMs = 2200) {
      const text = lines[next++] ?? "";
      await page.evaluate((caption) => {
        let el = document.getElementById("tip-caption");
        if (!el) {
          el = document.createElement("div");
          el.id = "tip-caption";
          el.setAttribute(
            "style",
            "position:fixed;left:16px;right:16px;bottom:96px;z-index:2147483647;padding:10px 14px;border-radius:12px;" +
              "background:rgba(17,24,39,.88);color:#fff;font:600 16px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none"
          );
          document.body.appendChild(el);
        }
        el.textContent = caption;
      }, text);
      await page.waitForTimeout(holdMs);
    },
  };
}
