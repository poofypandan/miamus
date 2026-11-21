import { describe, expect, it } from "vitest";
import { ANDROID_SPLASH_CIRCLE, ANDROID_SPLASH_GLYPH, LAUNCH_MARK_SIZE } from "@/components/brand/launch-mark-size";
import { LAUNCH_LIFT_SCRIPT, launchLift } from "@/lib/android-launch";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The installed Android app's launch mark meets the phone's own splash (21
// Nov, measured on the owner's Pixel): the same size and the same centre.

describe("the launch mark's size", () => {
  it("is the splash's on Android (a 220px glyph in a 240px circle), from a 144px tile elsewhere", () => {
    expect(LAUNCH_MARK_SIZE).toBe(144);
    expect(ANDROID_SPLASH_CIRCLE).toBe(240);
    expect(ANDROID_SPLASH_GLYPH).toBe(220);
    const css = readFileSync(fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)), "utf8");
    expect(css).toContain(`scale: calc(${ANDROID_SPLASH_CIRCLE} / ${LAUNCH_MARK_SIZE});`);
    expect(css).toContain(`scale: calc(${ANDROID_SPLASH_GLYPH} / ${ANDROID_SPLASH_CIRCLE});`);
    // The promise line stays 24px under the grown circle.
    expect(css).toContain(`margin-top: calc(1.5rem + (${ANDROID_SPLASH_CIRCLE}px - ${LAUNCH_MARK_SIZE}px) / 2);`);
  });
});

describe("launchLift (the launch picture stood on the screen's centre)", () => {
  it("on Android, lifts by half the status bar's lead over the gesture bar", () => {
    // The owner's Pixel: a 997dp screen, a 66dp status bar and a 24dp
    // gesture bar, so a 907dp page; the splash's mark was 21dp higher.
    expect(launchLift(997, 907, false)).toBe(21);
    // A 24dp status bar over a 24dp gesture bar: the centres already agree.
    expect(launchLift(800, 752, false)).toBe(0);
  });

  it("on an iPhone, lifts by half the status bar (the page runs to the bottom edge)", () => {
    // iPhone 15: an 852pt screen, a 59pt status bar.
    expect(launchLift(852, 793, true)).toBe(30);
  });

  it("never lowers the mark, and ignores sizes that aren't system bars", () => {
    expect(launchLift(800, 790, false)).toBe(0);
    expect(launchLift(800, 800, true)).toBe(0);
    expect(launchLift(800, 900, true)).toBe(0);
    expect(launchLift(1000, 500, false)).toBe(0);
    expect(launchLift(NaN, 500, true)).toBe(0);
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
    // An installed iPhone app: half its status bar.
    run(() => ({ matches: true }), { supports: () => true }, { height: 852 }, 793, doc);
    expect(set["--launch-lift"]).toBe("30px");
    // A browser tab: nothing set.
    const none: Record<string, string> = {};
    const docNone = { documentElement: { style: { setProperty: (k: string, v: string) => (none[k] = v) } } };
    run(() => ({ matches: false }), { supports: () => false }, { height: 997 }, 907, docNone);
    expect(none).toEqual({});
  });
});
