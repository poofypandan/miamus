// The guide to Miamus (src/lib/guide.ts; Phase 180, docs/phase-180-kakak-
// answers-plan.md, section 4c): kept current by a test, not by memory.
// Kakak answers "how does this work?" from it and only from it, so an entry
// that is missing, stale or only in one language is a wrong answer waiting.
import { describe, expect, it } from "vitest";
import {
  GUIDE,
  GUIDE_BODY_MAX,
  GUIDE_FOR_KAKAK_MAX,
  GUIDE_GROUPS,
  GUIDE_GROUP_TITLES,
  GUIDE_PLACES,
  NOT_IN_GUIDE,
  guideEntry,
  guideForKakak,
} from "@/lib/guide";
import { FEATURES } from "@/lib/features";
import { WHATS_NEW } from "@/lib/whats-new";

const LOCALES = ["en", "id"] as const;
// Standard emoji and the symbol characters used as icons (AGENTS.md, Design).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}♛⚿✓]/u;

describe("the guide's entries", () => {
  it("have a unique kebab-case id, a group, and both languages", () => {
    const ids = GUIDE.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of GUIDE) {
      expect(entry.id, entry.id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
      expect(GUIDE_GROUPS, entry.id).toContain(entry.group);
      for (const locale of LOCALES) {
        expect(entry.title[locale].trim().length, `${entry.id} title ${locale}`).toBeGreaterThan(0);
        expect(entry.body[locale].trim().length, `${entry.id} body ${locale}`).toBeGreaterThan(40);
      }
      expect(guideEntry(entry.id)).toBe(entry);
    }
    // Every group has something in it, and a title in both languages.
    for (const group of GUIDE_GROUPS) {
      expect(GUIDE.some((entry) => entry.group === group), group).toBe(true);
      for (const locale of LOCALES) expect(GUIDE_GROUP_TITLES[group][locale]).toBeTruthy();
    }
  });

  it("are short: a body is two or three sentences, at most 280 characters", () => {
    for (const entry of GUIDE) {
      for (const locale of LOCALES) {
        expect(entry.body[locale].length, `${entry.id} ${locale} is ${entry.body[locale].length}`).toBeLessThanOrEqual(GUIDE_BODY_MAX);
      }
    }
  });

  it("point at a screen that is in the list of places, or at none", () => {
    for (const entry of GUIDE) {
      if (entry.where !== null) expect(Object.keys(GUIDE_PLACES), entry.id).toContain(entry.where);
      if (entry.needs) expect([...FEATURES, "pets"], entry.id).toContain(entry.needs);
    }
    for (const place of Object.values(GUIDE_PLACES)) {
      for (const locale of LOCALES) expect(place[locale]).toBeTruthy();
    }
  });

  it("name each screen the way the tabs do, in each language", () => {
    // The five tabs (bottom-tab-bar.tsx): a path starts with one of them.
    const tabs = { en: ["Today", "Home", "Pets", "Kitchen", "Settings"], id: ["Hari ini", "Rumah", "Hewan", "Dapur", "Pengaturan"] };
    for (const [key, place] of Object.entries(GUIDE_PLACES)) {
      for (const locale of LOCALES) {
        expect(tabs[locale].some((tab) => place[locale] === tab || place[locale].startsWith(`${tab} → `)), `${key} ${locale}`).toBe(true);
      }
    }
  });

  it("say nothing about prices or plans, and carry no emoji", () => {
    for (const entry of GUIDE) {
      for (const locale of LOCALES) {
        const text = `${entry.title[locale]} ${entry.body[locale]}`;
        expect(text, entry.id).not.toMatch(EMOJI);
        expect(text, entry.id).not.toMatch(/\b(Rp|IDR|USD|\$\d|gratis|free plan|premium|berlangganan|subscription|coming soon|segera hadir)\b/i);
        // The plan's name, with its capital: "plus what you leave on" is fine.
        expect(text, entry.id).not.toMatch(/\bPlus\b/);
      }
    }
  });

  it("use the glossary's words in Bahasa Indonesia", () => {
    for (const entry of GUIDE) {
      const text = `${entry.title.id} ${entry.body.id}`;
      // docs/indonesian-glossary.md: HP, staf, tugas; never these.
      expect(text, entry.id).not.toMatch(/\b(ponsel|handphone|pembantu|majikan|kamu|asisten rumah tangga|ART)\b/i);
      // Times are written 07.00 in Indonesian, 07:00 in English.
      expect(text, entry.id).not.toMatch(/\b\d{1,2}:\d{2}\b/);
      expect(`${entry.title.en} ${entry.body.en}`, entry.id).not.toMatch(/\b\d{1,2}\.\d{2}\b(?! kg)/);
    }
  });
});

describe("the guide stays current", () => {
  it("speaks for every owner What's new card, or says why it doesn't", () => {
    const covered = new Set(GUIDE.flatMap((entry) => entry.covers ?? []));
    const known = new Set(WHATS_NEW.map((entry) => entry.id));
    for (const entry of WHATS_NEW) {
      expect(covered.has(entry.id) || entry.id in NOT_IN_GUIDE, `${entry.id}: add it to a guide entry's covers (src/lib/guide.ts), or to NOT_IN_GUIDE with the reason`).toBe(true);
    }
    // And names no card that doesn't exist.
    for (const id of [...covered, ...Object.keys(NOT_IN_GUIDE)]) expect(known.has(id), id).toBe(true);
    for (const reason of Object.values(NOT_IN_GUIDE)) expect(reason.trim().length).toBeGreaterThan(10);
  });
});

describe("the guide as Kakak reads it", () => {
  it("is one block per language, groups in order, each entry with its screen in words", () => {
    for (const locale of LOCALES) {
      const text = guideForKakak(locale);
      expect(text.startsWith("<guide>\n# Guide to Miamus")).toBe(true);
      expect(text.endsWith("</guide>")).toBe(true);
      const at = GUIDE_GROUPS.map((group) => text.indexOf(`## ${GUIDE_GROUP_TITLES[group][locale]}`));
      expect(at.every((index) => index > 0)).toBe(true);
      expect([...at].sort((a, b) => a - b)).toEqual(at);
      for (const entry of GUIDE) expect(text, entry.id).toContain(entry.body[locale]);
    }
    expect(guideForKakak("en")).toContain("- Chores and routines (Home → Chores): A chore is a job in the house");
    expect(guideForKakak("id")).toContain("- Tugas dan rutinitas (Rumah → Tugas): Tugas adalah pekerjaan rumah");
    // Only the owner's language: the other one would double her reading for nothing.
    expect(guideForKakak("en")).not.toContain("Untuk apa Miamus");
    expect(guideForKakak("id")).not.toContain("What Miamus is for");
  });

  it("is the same every time, so it stays cached, and under the size cap", () => {
    for (const locale of LOCALES) {
      expect(guideForKakak(locale)).toBe(guideForKakak(locale));
      expect(guideForKakak(locale).length).toBeLessThanOrEqual(GUIDE_FOR_KAKAK_MAX);
    }
  });

  it("holds nothing of a household: no name from the eval's household, no reference", () => {
    for (const locale of LOCALES) {
      const text = guideForKakak(locale);
      expect(text).not.toMatch(/\b[MSPRI]\d+\b/);
      expect(text).not.toMatch(/\b(Ari|Syam|Mocha|Matcha|Dewi|Sari)\b/);
    }
  });
});
