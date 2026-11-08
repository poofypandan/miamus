import { describe, expect, it } from "vitest";
import { sonioxCleanup } from "../kakak/stt-providers";
import { nameHits, normalise, wordErrorRate } from "../kakak/wer";

describe("normalise", () => {
  it("lowercases, drops punctuation and collapses spaces", () => {
    expect(normalise("  Mbak Sari, pel   teras!  ")).toBe("mbak sari pel teras");
  });

  it("keeps digits and accented letters", () => {
    expect(normalise("Jam 9, café.")).toBe("jam 9 café");
  });

  it("does not turn number words into digits", () => {
    expect(normalise("jam sembilan")).toBe("jam sembilan");
  });
});

describe("wordErrorRate", () => {
  it("is 0 for identical text, ignoring case and punctuation", () => {
    const result = wordErrorRate("Mbak Sari pel teras.", "mbak sari pel teras");
    expect(result).toEqual({ wer: 0, substitutions: 0, deletions: 0, insertions: 0, refWords: 4 });
  });

  it("counts one substitution", () => {
    const result = wordErrorRate("besok budi cuci mobil", "besok budi cuci motor");
    expect(result.substitutions).toBe(1);
    expect(result.wer).toBeCloseTo(0.25);
  });

  it("counts an insertion", () => {
    const result = wordErrorRate("beli telur", "beli telur ayam");
    expect(result).toMatchObject({ insertions: 1, deletions: 0, substitutions: 0 });
    expect(result.wer).toBeCloseTo(0.5);
  });

  it("counts a deletion", () => {
    const result = wordErrorRate("tolong beli telur", "beli telur");
    expect(result).toMatchObject({ deletions: 1, insertions: 0, substitutions: 0 });
    expect(result.wer).toBeCloseTo(1 / 3);
  });

  it("is 1 for an empty hypothesis", () => {
    const result = wordErrorRate("beli telur", "");
    expect(result).toMatchObject({ wer: 1, deletions: 2 });
  });

  it("is 0 when both are empty", () => {
    expect(wordErrorRate("", "").wer).toBe(0);
  });
});

describe("nameHits", () => {
  const names = ["Sari", "Nah", "Budi", "Mochi"];

  it("finds a name behind an honorific", () => {
    expect(nameHits("Mbak Sari pel teras", "mbak sari pel teras", names)).toEqual([{ name: "Sari", hit: true }]);
  });

  it("marks a name the hypothesis missed", () => {
    expect(nameHits("Bik Nah masak", "bik na masak", names)).toEqual([{ name: "Nah", hit: false }]);
  });

  it("ignores names not in the reference and matches whole words only", () => {
    expect(nameHits("Budi cuci mobil", "budiman cuci mobil", names)).toEqual([{ name: "Budi", hit: false }]);
  });
});

describe("sonioxCleanup", () => {
  it("tries both deletions and reports what is left behind", async () => {
    const calls: string[] = [];
    const failing = (async (url: string) => {
      calls.push(url);
      if (url.includes("/files/")) throw new Error("offline");
      return new Response(null, { status: 503 });
    }) as unknown as typeof fetch;
    const left = await sonioxCleanup({ Authorization: "Bearer k" }, "t1", "f1", failing);
    expect(calls).toEqual(["https://api.soniox.com/v1/transcriptions/t1", "https://api.soniox.com/v1/files/f1"]);
    expect(left).toEqual(["transcription t1 (HTTP 503)", "file f1 (offline)"]);
  });

  it("is quiet when both are deleted or already gone", async () => {
    const ok = (async (url: string) =>
      new Response(null, { status: url.includes("/files/") ? 404 : 204 })) as unknown as typeof fetch;
    expect(await sonioxCleanup({}, "t1", "f1", ok)).toEqual([]);
  });
});
