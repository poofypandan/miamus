import { describe, expect, it } from "vitest";
import { ONE_DAY_COPY, ONE_DAY_PREVIEW_HREF } from "@/components/landing/one-day/one-day-copy";
import { LANDING_HREF } from "@/components/landing/landing-copy";
import { LEGAL } from "@/config/legal";
import { parseOneDayLanding } from "@/lib/landing-flag";

// The "One day" landing page (docs/private/landing, Direction 3): both
// languages complete and in step, the concept's "must never" list kept, the
// endorsement line exact, and the switch off unless set.

function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => strings(item, path ? `${path}.${key}` : key));
  }
  return [];
}

function shape(value: unknown): unknown {
  if (typeof value === "string") return "string";
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
  }
  return typeof value;
}

const ALL = (["en", "id"] as const).flatMap((locale) =>
  strings(ONE_DAY_COPY[locale]).map(([path, text]) => [`${locale}.${path}`, text] as const)
);

describe("the One day switch", () => {
  it("is off unless set to on or preview", () => {
    expect(parseOneDayLanding(undefined)).toBe("off");
    expect(parseOneDayLanding("")).toBe("off");
    expect(parseOneDayLanding("yes")).toBe("off");
    expect(parseOneDayLanding("true")).toBe("off");
    expect(parseOneDayLanding("preview")).toBe("preview");
    expect(parseOneDayLanding(" ON ")).toBe("on");
  });

  it("previews at its own routes, never at the live ones", () => {
    expect(ONE_DAY_PREVIEW_HREF.en).not.toBe(LANDING_HREF.en);
    expect(ONE_DAY_PREVIEW_HREF.id).not.toBe(LANDING_HREF.id);
  });
});

describe("One day copy", () => {
  it("has the same structure in English and Bahasa Indonesia", () => {
    expect(shape(ONE_DAY_COPY.id)).toEqual(shape(ONE_DAY_COPY.en));
  });

  it("has no empty strings, except the accented lines' ends", () => {
    for (const [path, text] of ALL) {
      if (/\[(0|2)\]$/.test(path)) continue; // [before, word, after]: before/after may be ""
      expect(text.trim(), path).not.toBe("");
    }
  });

  it("uses no emoji or symbol icons", () => {
    for (const [path, text] of ALL) {
      expect(text, path).not.toMatch(/\p{Extended_Pictographic}|[✓✔♛⚿★]/u);
    }
  });

  it("is never loud about being exclusive, never about watching staff, never 'AI-powered'", () => {
    const banned =
      /\b(exclusive|eksklusif|VIP|elite|members only|limited spots?|terbatas|AI-powered|monitor|memantau|pembantu|ponsel)\b/i;
    for (const [path, text] of ALL) expect(text, path).not.toMatch(banned);
  });

  it("names Kakak as Miamus's AI helper and optional, once", () => {
    expect(ONE_DAY_COPY.en.sayOnce.kakakNote).toMatch(/AI helper, and she is optional/);
    expect(ONE_DAY_COPY.id.sayOnce.kakakNote).toMatch(/asisten AI Miamus, dan boleh tidak dipakai/);
  });

  it("signs the footer 'Miamus, by Poofy Labs' / 'Miamus, oleh Poofy Labs', and nothing else", () => {
    expect(ONE_DAY_COPY.en.footer.by).toBe("Miamus, by Poofy Labs");
    expect(ONE_DAY_COPY.id.footer.by).toBe("Miamus, oleh Poofy Labs");
  });

  it("gives only the public contact, and never links to poofylabs.dev", () => {
    for (const [path, text] of ALL) {
      for (const email of text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? []) expect(email, path).toBe(LEGAL.contactEmail);
      expect(text, path).not.toMatch(/https?:\/\/(www\.)?poofylabs\.dev/);
    }
  });

  it("says 'early access' and 'by invitation' in place of beta and invite-only", () => {
    expect(ONE_DAY_COPY.en.eyebrow).toBe("Early access · By invitation");
    expect(ONE_DAY_COPY.id.eyebrow).toBe("Akses awal · Dengan undangan");
    for (const [path, text] of ALL) expect(text, path).not.toMatch(/\bbeta\b|invite-only|hanya dengan undangan/i);
  });

  it("quotes Kakak's line with when she says it, not as a promise", () => {
    expect(ONE_DAY_COPY.en.keeps.quoteBy).toMatch(/when you ask her to tell you if a routine is missed/);
    expect(ONE_DAY_COPY.id.keeps.quoteBy).toMatch(/saat Anda minta dikabari/);
  });

  it("links each language to its own privacy policy", () => {
    expect(ONE_DAY_COPY.en.privacyHref).toBe("/privacy");
    expect(ONE_DAY_COPY.id.privacyHref).toBe("/privasi");
  });
});

describe("serving it at /welcome", () => {
  async function routing(value: string | undefined) {
    const before = process.env.LANDING_ONE_DAY;
    if (value === undefined) delete process.env.LANDING_ONE_DAY;
    else process.env.LANDING_ONE_DAY = value;
    try {
      const { default: config } = await import("../../next.config");
      return { rewrites: await config.rewrites!(), redirects: await config.redirects!() };
    } finally {
      if (before === undefined) delete process.env.LANDING_ONE_DAY;
      else process.env.LANDING_ONE_DAY = before;
    }
  }

  it("changes nothing while off or in preview", async () => {
    for (const value of [undefined, "off", "preview"]) {
      const { rewrites, redirects } = await routing(value);
      expect(rewrites, String(value)).toEqual([]);
      expect(redirects, String(value)).toEqual([]);
    }
  });

  it("when on, serves the new page at /welcome and /selamat-datang, before today's page files", async () => {
    const { rewrites, redirects } = await routing("on");
    expect(rewrites).toMatchObject({
      beforeFiles: [
        { source: "/welcome", destination: ONE_DAY_PREVIEW_HREF.en },
        { source: "/selamat-datang", destination: ONE_DAY_PREVIEW_HREF.id },
      ],
    });
    expect(redirects).toEqual([
      { source: ONE_DAY_PREVIEW_HREF.en, destination: "/welcome", permanent: false },
      { source: ONE_DAY_PREVIEW_HREF.id, destination: "/selamat-datang", permanent: false },
    ]);
  });
});
