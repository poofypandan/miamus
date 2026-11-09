import { describe, expect, it } from "vitest";
import { LANDING_COPY, LANDING_HREF } from "@/components/landing/landing-copy";
import { LEGAL } from "@/config/legal";

// The landing page's words (docs/landing-page-proposal.md): both languages
// complete and in step, the glossary's rules kept, no emoji.

/** Every string in a nested object, with its path. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
  }
  return [];
}

/** The object's shape: every key path and array length, without the words. */
function shape(value: unknown): unknown {
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
  }
  return typeof value;
}

describe("landing copy", () => {
  it("has the same structure in English and Bahasa Indonesia", () => {
    expect(shape(LANDING_COPY.id)).toEqual(shape(LANDING_COPY.en));
  });

  it("has no empty strings", () => {
    for (const locale of ["en", "id"] as const) {
      for (const [path, text] of strings(LANDING_COPY[locale])) {
        expect(text.trim(), `${locale}.${path}`).not.toBe("");
      }
    }
  });

  it("uses no emoji or symbol glyphs as icons (AGENTS.md, Design)", () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    for (const locale of ["en", "id"] as const) {
      for (const [path, text] of strings(LANDING_COPY[locale])) {
        expect(emoji.test(text), `${locale}.${path}: ${text}`).toBe(false);
      }
    }
  });

  it("keeps the Indonesian glossary's rules", () => {
    // "opsional" is fine here: the glossary keeps it off staff forms only.
    const banned = /\b(ponsel|pembantu|majikan|kamu)\b/i;
    for (const [path, text] of strings(LANDING_COPY.id)) {
      expect(banned.test(text), `id.${path}: ${text}`).toBe(false);
    }
  });

  it("takes the operator and contact email from LEGAL", () => {
    for (const locale of ["en", "id"] as const) {
      const t = LANDING_COPY[locale];
      expect(t.request.noGoogle).toContain(LEGAL.contactEmail);
      expect(t.request.consent).toContain(LEGAL.operatorName);
      expect(t.footer.madeBy).toContain(LEGAL.operatorName);
    }
  });

  it("doesn't promise what the app doesn't do yet", () => {
    for (const locale of ["en", "id"] as const) {
      const all = strings(LANDING_COPY[locale]).map(([, text]) => text).join(" ");
      // No data region on the page (owner, 2026-11-09): the privacy policy says it.
      expect(all).not.toMatch(/Singap/i);
      // Kakak isn't named until she's live (L6).
      expect(all).not.toMatch(/Kakak/);
      // The weak-signal answer waits for PR #41.
      expect(LANDING_COPY[locale].faq.items).toHaveLength(7);
    }
  });

  it("links each language to the other", () => {
    expect(LANDING_COPY.en.otherHref).toBe(LANDING_HREF.id);
    expect(LANDING_COPY.id.otherHref).toBe(LANDING_HREF.en);
    expect(LANDING_COPY.en.privacyHref).toBe("/privacy");
    expect(LANDING_COPY.id.privacyHref).toBe("/privasi");
  });
});
