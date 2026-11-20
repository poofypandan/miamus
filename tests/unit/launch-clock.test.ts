import { describe, expect, it } from "vitest";
import { handOverStart, pickLaunchStart } from "@/lib/launch-clock";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import manifest from "@/app/manifest";
import { LAUNCH_BACKGROUND } from "@/components/brand/brand-mark";
import { IPHONE_SCREENS, iosStartupImages, markCentreY } from "@/lib/ios-launch-screens";

describe("pickLaunchStart (the launch mark's one clock)", () => {
  it("uses the mark's own start when it has been animating since first paint", () => {
    expect(pickLaunchStart({ ownStarts: [412, 410, 415], firstPaint: 300, now: 1200 })).toBe(410);
  });

  it("falls back to first paint when the first mark was swapped before it could report", () => {
    expect(pickLaunchStart({ ownStarts: [], firstPaint: 380, now: 1400 })).toBe(380);
  });

  it("ignores start times from the future (a pending animation)", () => {
    expect(pickLaunchStart({ ownStarts: [5000], firstPaint: 380, now: 1400 })).toBe(380);
  });

  it("gives a mark seen long after launch its own clock, starting now", () => {
    expect(pickLaunchStart({ ownStarts: [], firstPaint: 300, now: 20_000 })).toBe(20_000);
    expect(pickLaunchStart({ ownStarts: [], firstPaint: null, now: 900 })).toBe(900);
  });
});

describe("handOverStart (the staff cover's mark-to-rules hand-over)", () => {
  it("counts from now when no launch mark has set the clock, so the wait is served in full", () => {
    expect(handOverStart(1500, 4000)).toBe(4000);
  });
});

describe("the launch stage's paper", () => {
  // Android paints its splash in background_color; the status bar takes
  // theme_color; the launch stage is the page background. One paper for all
  // of them, or the hand-over from the phone's splash shows as a colour step.
  // (layout.tsx's viewport.themeColor uses the same LAUNCH_BACKGROUND; it
  // loads fonts and cannot be imported here.)
  it("is the manifest's splash colour and theme colour, and the page's --background", () => {
    const m = manifest();
    expect(LAUNCH_BACKGROUND).toBe("#f5f2ec");
    expect(m.background_color).toBe(LAUNCH_BACKGROUND);
    expect(m.theme_color).toBe(LAUNCH_BACKGROUND);
    const css = readFileSync(fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)), "utf8");
    expect(css).toMatch(new RegExp(`--background: ${LAUNCH_BACKGROUND};`));
  });
});

describe("the iPhone launch screens", () => {
  it("lists one portrait image per screen size, each with its exact media query", () => {
    const links = iosStartupImages();
    expect(links).toHaveLength(IPHONE_SCREENS.length);
    expect(new Set(links.map((l) => l.url)).size).toBe(links.length);
    expect(links.find((l) => l.url === "/apple-splash/393x852-3x")?.media).toBe(
      "(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
    );
  });

  it("puts the mark at the launch stage's centre: below the status bar, halfway down the rest", () => {
    // iPhone 15: a 59pt bar, then 793pt of page whose middle is 396.5pt down.
    expect(markCentreY({ height: 852, statusBar: 59 })).toBe(455.5);
    expect(markCentreY({ height: 667, statusBar: 20 })).toBe(343.5);
  });
});
