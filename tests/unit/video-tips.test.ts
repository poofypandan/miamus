import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { VIDEO_TIPS, tipLocale, videoTip, videoTipFiles, videoTipVtt, watchLabel } from "@/lib/video-tips";

describe("video tips", () => {
  it("each tip has Indonesian captions and title; owner tips English too", () => {
    for (const tip of VIDEO_TIPS) {
      expect(tip.captions.id.length).toBeGreaterThan(0);
      expect(tip.title.id).toBeTruthy();
      if (tip.audience === "owner") {
        expect(tip.captions.en?.length).toBe(tip.captions.id.length);
        expect(tip.title.en).toBeTruthy();
      }
      expect(tip.seconds).toBeGreaterThanOrEqual(10);
      expect(tip.seconds).toBeLessThanOrEqual(15);
    }
  });

  it("no emoji or symbol characters in captions (premium, plain text)", () => {
    const text = VIDEO_TIPS.flatMap((tip) => [...tip.captions.id, ...(tip.captions.en ?? [])]).join(" ");
    expect(text).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿✓✔⋮]/u);
  });

  it("a tip marked ready has its clip, poster and captions in public/tips", () => {
    for (const tip of VIDEO_TIPS.filter((t) => t.ready)) {
      for (const locale of tip.audience === "owner" ? (["en", "id"] as const) : (["id"] as const)) {
        const files = videoTipFiles(tip, locale);
        for (const path of [files.video, files.poster, files.captions]) {
          expect(existsSync(join("public", path)), path).toBe(true);
        }
      }
    }
  });

  it("staff tips are Indonesian whatever is asked", () => {
    const staff = videoTip("staff-first-chore")!;
    expect(tipLocale(staff, "en")).toBe("id");
    expect(videoTipFiles(staff, "en").video).toBe("/tips/staff-first-chore.id.mp4");
    expect(watchLabel(staff, "en")).toBe("Tonton · 15 detik");
    const owner = videoTip("owner-staff-phones")!;
    expect(watchLabel(owner, "en")).toBe("Watch · 15 s");
    expect(videoTipFiles(owner, "en")).toEqual({
      video: "/tips/owner-staff-phones.en.mp4",
      poster: "/tips/owner-staff-phones.en.jpg",
      captions: "/tips/owner-staff-phones.en.vtt",
    });
  });

  it("writes WebVTT with one caption at a time over the tip's length", () => {
    const vtt = videoTipVtt(videoTip("owner-staff-phones")!, "en");
    expect(vtt.startsWith("WEBVTT\n\n1\n00:00:00.000 --> 00:00:03.750\nAdd each person by name\n")).toBe(true);
    expect(vtt.trimEnd().endsWith("00:00:11.250 --> 00:00:15.000\nThey tap their name and make a PIN")).toBe(true);
  });
});
