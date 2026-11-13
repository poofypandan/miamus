// The route's guard on Kakak's own words (src/lib/kakak/reply-guard.ts) and
// the eval's matching must-never, with the three notes to self from the
// 2026-11-13 eval (Opus 5.5, low effort).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { KakakHousehold } from "@/lib/kakak/household";
import { guardReplyText, INTERNAL_NAMES, MAX_REPLY_CHARS, noteTells, replyTells } from "@/lib/kakak/reply-guard";
import { gradeCase, visibleText, type ActualTurn } from "../kakak/grade";
import type { KakakTestSet } from "../kakak/types";

const K021 =
  "'Sabun cuci' most likely means I2 Sabun cuci piring, though it could be detergent. It's ambiguous: sabun cuci could be laundry soap. I2 is \"Sabun cuci piring\", I3 is \"Deterjen\". I'll treat it as close enough to I2.";
const K104 = "Need time: ask.";
const K114 = "Eggs I1 already in fridge; set expiry 2026-11-25.";

const GOOD_ID = [
  "Baik. Kakak siapkan: Syam mematikan lampu untuk Mocha dan Matcha setiap malam jam 21.30, dengan foto.",
  "Baik, Bu. Sari akan mengepel teras setiap Senin jam 09.00.",
  "Mochi sudah punya jadwal makan jam 07.00, jadi Kakak hanya tambahkan jam 18.00.",
  "Maaf, Kakak belum bisa mengubah tugas. Tugas bisa diubah di Rumah → Tugas.",
  "Hewan sedang dimatikan. Anda bisa menyalakannya di Pengaturan → Fitur.",
];
const GOOD_EN = [
  "Of course. I'll have Syam turn the lights off for Mocha and Matcha every night at 21:30, with a photo.",
  "Sari will mop the terrace every Monday at 9:00.",
  "Mochi already eats at 07:00, so I'll only suggest 18:00.",
  "Sorry, I can't change chores yet. You can change them in Home → Chores.",
  "Matcha's walk is at 21.30 every day, with Ari.",
];

describe("the guard's tells", () => {
  it("catches all three notes from tonight's eval", () => {
    expect(replyTells(K021, "id")).toEqual(["reference", "too_long", "language"]);
    expect(replyTells(K114, "en")).toEqual(["reference", "date"]);
    // K104 has no tell of its own: it came with a question, whose text is always dropped.
    expect(guardReplyText("question", K104, "id")).toEqual({ text: "", tells: [] });
  });

  it("drops each of them before it reaches the owner", () => {
    expect(guardReplyText("suggestions", K021, "id").text).toBe("");
    expect(guardReplyText("suggestions", K114, "en").text).toBe("");
    expect(guardReplyText("message", K021, "id").text).toBe("Maaf, Kakak belum paham. Bisa Anda katakan dengan cara lain?");
    expect(guardReplyText("message", K114, "en").text).toBe("Sorry, I didn't catch that. Could you say it another way?");
  });

  it("passes good sentences with names and times, in either language", () => {
    for (const text of GOOD_ID) {
      expect(replyTells(text, "id"), text).toEqual([]);
      expect(guardReplyText("suggestions", text, "id").text).toBe(text);
      expect(guardReplyText("message", text, "id").text).toBe(text);
    }
    for (const text of GOOD_EN) {
      expect(replyTells(text, "en"), text).toEqual([]);
      expect(guardReplyText("suggestions", text, "en").text).toBe(text);
    }
  });

  it("spots each tell on its own", () => {
    expect(noteTells("Kakak pakai S2 untuk ini.")).toEqual(["reference"]);
    expect(noteTells("Untuk M1 dan R3.")).toEqual(["reference"]);
    expect(noteTells("Kedaluwarsa 2026-11-25.")).toEqual(["date"]);
    expect(noteTells("Pakai put_away_ingredient dengan kept_in fridge.")).toEqual(["internal_name"]);
    expect(noteTells("Set the assignee to Ari.")).toEqual(["internal_name"]);
    expect(replyTells("Baik. ".repeat(40), "id")).toEqual(["too_long"]);
    expect(replyTells("Which day should Budi do it? You can pick one.", "id")).toEqual(["language"]);
    expect(replyTells("Mau yang mana untuk Mbak Yan, Yanti atau Yati?", "en")).toEqual(["language"]);
  });

  it("leaves look-alikes alone", () => {
    // P3K (first aid), times, plain dates and ordinary words that are also fields.
    expect(noteTells("Beli kotak P3K dan plester.")).toEqual([]);
    expect(noteTells("Jam 21.30 dan 07:00, tanggal 25 Nov.")).toEqual([]);
    expect(noteTells("Add a note and a title to the room.")).toEqual([]);
    // The Ingredients rule's own explanation (Codex, PR #138).
    const outItem = "You can set the expiry date once the eggs are marked Bought.";
    expect(replyTells(outItem, "en")).toEqual([]);
    expect(guardReplyText("suggestions", outItem, "en").text).toBe(outItem);
    expect(MAX_REPLY_CHARS).toBe(200);
  });

  it("knows the tools' snake_case fields from tools.ts", () => {
    for (const name of ["create_chore", "ask_question", "kept_in", "expires_on", "due_time", "remind_staff", "alert_owners", "assignee", "expiry_is_guess"]) {
      expect(INTERNAL_NAMES).toContain(name);
    }
    expect(INTERNAL_NAMES).not.toContain("expiry");
    expect(INTERNAL_NAMES).not.toContain("title");
    expect(INTERNAL_NAMES).not.toContain("note");
  });

  it("keeps an empty text empty", () => {
    expect(guardReplyText("message", "  ", "id")).toEqual({ text: "", tells: [] });
    expect(guardReplyText("suggestions", "", "en")).toEqual({ text: "", tells: [] });
  });
});

describe("the eval's must-never for a note on screen", () => {
  const root = join(__dirname, "..", "kakak");
  const household = JSON.parse(readFileSync(join(root, "household.json"), "utf8")) as KakakHousehold;
  const testSet = JSON.parse(readFileSync(join(root, "test-set.json"), "utf8")) as KakakTestSet;
  const caseById = (id: string) => {
    const found = testSet.cases.find((c) => c.id === id);
    if (!found) throw new Error(id);
    return found;
  };
  const message = (text: string): ActualTurn => ({ kind: "message", calls: [], text });
  const question = (text: string, q: string, answers: string[]): ActualTurn => ({
    kind: "question",
    calls: [{ name: "ask_question", input: { question: q, answers, allow_typing: true } }],
    text,
  });

  it("flags a reference, a date or a field name in a reply, on any case", () => {
    const k001 = caseById("K001");
    for (const text of [K021, K114, "Kakak siapkan untuk S1.", "Pakai add_food."]) {
      const grade = gradeCase(household, k001, [message(text)]);
      expect(grade.pass).toBe(false);
      expect(grade.mustNever.join(" "), text).toMatch(/shows a note to self/);
    }
  });

  it("flags a reference in a question or its answers, but not the question turn's dropped text", () => {
    const k104 = caseById("K104");
    const leaky = gradeCase(household, k104, [question("", "Jam berapa untuk P1?", ["16.00", "17.00"])]);
    expect(leaky.mustNever.join(" ")).toMatch(/shows a note to self \(reference\)/);
    const dropped = gradeCase(household, k104, [question("Hmm, R1.", "Jam berapa?", ["16.00", "17.00"])]);
    expect(dropped.mustNever.join(" ")).not.toMatch(/note to self/);
    expect(visibleText(question("Hmm, R1.", "Jam berapa?", ["16.00"]))).toBe("Jam berapa?\n16.00");
  });

  it("leaves good replies alone", () => {
    const k001 = caseById("K001");
    for (const text of GOOD_ID) {
      expect(gradeCase(household, k001, [message(text)]).mustNever.join(" "), text).not.toMatch(/note to self/);
    }
  });
});
