import { describe, expect, it } from "vitest";
import { ANDROID_SPLASH_CIRCLE, LAUNCH_MARK_SIZE } from "@/components/brand/launch-mark-size";
import { LAUNCH_LIFT_SCRIPT, launchLift } from "@/lib/android-launch";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The installed Android app's launch mark meets the phone's own splash (21
// Nov, measured on the owner's Pixel): the same size and the same centre.

describe("the launch mark's size", () => {
  it("is the splash's: a 220px glyph in a 240px circle, as globals.css draws it", () => {
    expect(LAUNCH_MARK_SIZE).toBe(220);
    expect(ANDROID_SPLASH_CIRCLE).toBe(240);
    const css = readFileSync(fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)), "utf8");
    expect(css).toContain(`scale: calc(${ANDROID_SPLASH_CIRCLE} / ${LAUNCH_MARK_SIZE});`);
    expect(css).toContain(`scale: calc(${LAUNCH_MARK_SIZE} / ${ANDROID_SPLASH_CIRCLE});`);
  });
});

describe("launchLift (the splash stood on the screen's centre)", () => {
  it("lifts by half the status bar's lead over the gesture bar", () => {
    // The owner's Pixel: a 997dp screen, a 66dp status bar and a 24dp
    // gesture bar, so a 907dp page; the splash's mark was 21dp higher.
    expect(launchLift(997, 907)).toBe(21);
    // A 24dp status bar over a 24dp gesture bar: the centres already agree.
    expect(launchLift(800, 752)).toBe(0);
  });

  it("never lowers the mark, and ignores sizes that aren't two system bars", () => {
    expect(launchLift(800, 790)).toBe(0);
    expect(launchLift(800, 800)).toBe(0);
    expect(launchLift(800, 900)).toBe(0);
    expect(launchLift(1000, 500)).toBe(0);
    expect(launchLift(NaN, 500)).toBe(0);
  });

  it("is written into the page as a self-contained script", () => {
    const set: Record<string, string> = {};
    const run = new Function(
      "matchMedia",
      "CSS",
      "screen",
      "innerHeight",
      "document",
      LAUNCH_LIFT_SCRIPT
    );
    const doc = { documentElement: { style: { setProperty: (k: string, v: string) => (set[k] = v) } } };
    run(() => ({ matches: true }), { supports: () => false }, { height: 997 }, 907, doc);
    expect(set["--launch-lift"]).toBe("21px");
    // An iPhone, or a browser tab: nothing set.
    const none: Record<string, string> = {};
    const docNone = { documentElement: { style: { setProperty: (k: string, v: string) => (none[k] = v) } } };
    run(() => ({ matches: true }), { supports: () => true }, { height: 997 }, 907, docNone);
    run(() => ({ matches: false }), { supports: () => false }, { height: 997 }, 907, docNone);
    expect(none).toEqual({});
  });
});
