import { describe, expect, it } from "vitest";
import { pickLaunchStart } from "@/lib/launch-clock";
import manifest from "@/app/manifest";

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

  it("starts a mark seen long after launch settled, never from the opening frame", () => {
    expect(pickLaunchStart({ ownStarts: [], firstPaint: 300, now: 20_000 })).toBe(20_000 - 760);
    expect(pickLaunchStart({ ownStarts: [], firstPaint: null, now: 900 })).toBe(140);
  });
});

describe("the launch stage's white", () => {
  // Android paints its splash in background_color; the status bar takes
  // theme_color; the launch stage is the page background. One white for all
  // three, or the hand-over from the phone's splash shows as a colour step.
  // (layout.tsx's viewport.themeColor is the same #ffffff; it loads fonts
  // and cannot be imported here.)
  it("is the manifest's splash colour and theme colour", () => {
    const m = manifest();
    expect(m.background_color).toBe("#ffffff");
    expect(m.theme_color).toBe("#ffffff");
  });
});
