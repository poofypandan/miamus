import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { costMicroUsd } from "@/lib/kakak/cost";
import {
  addDays,
  firstDayOfNextMonth,
  lastDayOfMonth,
  renderHouseholdBlock,
  weekdayIndex,
  type KakakHousehold,
} from "@/lib/kakak/household";
import { KAKAK_TOOLS } from "@/lib/kakak/tools";
import { newPetTimes, validateToolCall } from "@/lib/kakak/validate";
import { gradeCase, looksLikeWrongLanguage, matchField, scriptedReply, type ActualTurn } from "../kakak/grade";
import { percentile, summarise } from "../kakak/report";
import { pickAnswer } from "../kakak/run-core";
import { checkTestSet } from "../kakak/test-set-check";
import type { KakakCase, KakakTestSet } from "../kakak/types";

const root = join(__dirname, "..", "kakak");
const household = JSON.parse(readFileSync(join(root, "household.json"), "utf8")) as KakakHousehold;
const testSet = JSON.parse(readFileSync(join(root, "test-set.json"), "utf8")) as KakakTestSet;

const chore = (overrides: Record<string, unknown> = {}) => ({
  title: "Pel teras",
  title_en: null,
  category: "cleaning",
  assignee: "S1",
  due_date: "2026-11-16",
  due_time: "09:00",
  recurrence: "weekly",
  recurrence_until: null,
  requires_supervision: false,
  room: "R1",
  new_room_name: null,
  notes: null,
  ...overrides,
});

const petRoutine = (overrides: Record<string, unknown> = {}) => ({
  pets: ["P1"],
  kind: "meal",
  times: ["07:00"],
  days: null,
  until: null,
  title: null,
  title_en: null,
  staff: null,
  note: null,
  remind_staff: false,
  alert_owners: false,
  ...overrides,
});

const suggestion = (input: Record<string, unknown>, name = "create_chore"): ActualTurn => ({
  kind: "suggestions",
  calls: [{ name, input }],
  text: "",
});

const caseById = (id: string): KakakCase => {
  const found = testSet.cases.find((c) => c.id === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
};

describe("household dates", () => {
  it("knows the pretend household's calendar", () => {
    expect(weekdayIndex("2026-11-11")).toBe(3); // Wednesday
    expect(addDays("2026-11-11", 5)).toBe("2026-11-16"); // Monday
    expect(lastDayOfMonth("2026-11-11")).toBe("2026-11-30");
    expect(firstDayOfNextMonth("2026-11-11")).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(lastDayOfMonth("2028-02-10")).toBe("2028-02-29");
  });

  it("rejects dates that don't exist", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow();
  });

  it("lists references and the next 14 days, with today last", () => {
    const block = renderHouseholdBlock(household);
    expect(block).toContain("- S4: Yanti");
    expect(block).toContain("- P1: Mochi (dog). Meals: 07:00, 17:00. Potty: none.");
    expect(block).toContain("- I5: Makanan anjing (pet)");
    expect(block).toContain("2026-11-16 Monday (Senin)");
    expect(block).toContain("2026-11-25 Wednesday (Rabu)");
    expect(block).toContain("Last day of this month: 2026-11-30 Monday (Senin).");
    expect(block.indexOf("Today:")).toBeGreaterThan(block.indexOf("Shopping items"));
    expect(block).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no database ids
  });
});

describe("tool definitions", () => {
  it("are closed and require every property; strict except the four validate.ts checks in full", () => {
    expect(KAKAK_TOOLS).toHaveLength(7);
    for (const tool of KAKAK_TOOLS) {
      if (!("input_schema" in tool)) throw new Error("custom tools only");
      // The API's limit of 16 union-typed parameters (tools.ts, kakak-tool-limits.test.ts).
      const loose = ["add_to_shopping_list", "add_food", "put_away_ingredient", "set_staff_areas"].includes(tool.name);
      expect(tool.strict).toBe(loose ? undefined : true);
      expect(tool.input_schema.additionalProperties).toBe(false);
      expect([...(tool.input_schema.required ?? [])].sort()).toEqual(
        Object.keys(tool.input_schema.properties ?? {}).sort(),
      );
    }
  });
});

describe("validateToolCall", () => {
  it("accepts a good chore", () => {
    expect(validateToolCall(household, "create_chore", chore())).toEqual({ ok: true });
  });

  it("rejects invented people, bad times, past dates, and room plus new room", () => {
    const result = validateToolCall(
      household,
      "create_chore",
      chore({ assignee: "S9", due_time: "9:00", due_date: "2026-11-10", new_room_name: "Gudang" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/assignee "S9"/);
      expect(result.errors.join(" ")).toMatch(/due_time/);
      expect(result.errors.join(" ")).toMatch(/outside/);
      expect(result.errors.join(" ")).toMatch(/room and new_room_name/);
    }
  });

  it("requires a note for a new shopping item, and real pets", () => {
    expect(
      validateToolCall(household, "add_to_shopping_list", {
        items: [{ item: null, status: "out", note: " ", pet: "P7" }],
      }).ok,
    ).toBe(false);
    expect(
      validateToolCall(household, "add_to_shopping_list", {
        items: [{ item: "I1", status: "out", note: null, pet: null }],
      }),
    ).toEqual({ ok: true });
  });

  it("keeps food dates honest", () => {
    const food = {
      name: "Rendang",
      kept_in: "fridge",
      expires_on: null,
      expiry_unknown: false,
      expiry_is_guess: false,
      source: "home",
      from_whom: null,
      return_container: false,
      notes: null,
    };
    expect(validateToolCall(household, "add_food", food).ok).toBe(false); // no date and not "don't know"
    expect(validateToolCall(household, "add_food", { ...food, expiry_unknown: true })).toEqual({ ok: true });
    expect(validateToolCall(household, "add_food", { ...food, expiry_is_guess: true }).ok).toBe(false);
  });

  it("limits questions to 2–4 short answers", () => {
    expect(
      validateToolCall(household, "ask_question", { question: "Yang mana?", answers: ["Yanti"], allow_typing: false }).ok,
    ).toBe(false);
    expect(
      validateToolCall(household, "ask_question", {
        question: "Yang mana?",
        answers: ["Yanti", "Yati"],
        allow_typing: false,
      }),
    ).toEqual({ ok: true });
  });

  it("drops pet times that already exist, like the route", () => {
    expect(newPetTimes(household, "P1", "meal", ["07:00", "18:00"])).toEqual(["18:00"]);
    expect(newPetTimes(household, "P3", "meal", ["07:00"])).toEqual(["07:00"]);
  });
});

describe("matchField", () => {
  it("handles each matcher", () => {
    expect(matchField("S1", "S1")).toBe(true);
    expect(matchField(null, null)).toBe(true);
    expect(matchField({ anyOf: ["R2", null] }, null)).toBe(true);
    expect(matchField({ timeBetween: ["06:00", "09:00"], orNull: true }, null)).toBe(true);
    expect(matchField({ timeBetween: ["06:00", "09:00"] }, "09:30")).toBe(false);
    expect(matchField({ dateBetween: ["2026-11-14", "2026-11-18"] }, "2026-11-18")).toBe(true);
    expect(matchField({ textHas: [["pel", "mengepel"], ["teras"]] }, "Mengepel Teras")).toBe(true);
    expect(matchField({ textHas: [["pel"], ["teras"]] }, "Sapu teras")).toBe(false);
    expect(matchField({ sameSet: ["18:00", "07:00"] }, ["07:00", "18:00"])).toBe(true);
    expect(matchField({ any: true }, undefined)).toBe(true);
  });
});

describe("gradeCase", () => {
  it("passes the right chore and fails a wrong day", () => {
    const k001 = caseById("K001");
    expect(gradeCase(household, k001, [suggestion(chore({ title: "Mengepel teras" }))]).pass).toBe(true);
    const wrong = gradeCase(household, k001, [suggestion(chore({ due_date: "2026-11-17" }))]);
    expect(wrong.pass).toBe(false);
    expect(wrong.failures.join(" ")).toMatch(/due_date/);
  });

  it("checks unlisted fields against their defaults", () => {
    const k001 = caseById("K001");
    expect(gradeCase(household, k001, [suggestion(chore({ requires_supervision: true }))]).pass).toBe(false);
  });

  it("flags invented references and claims of saving as must-never", () => {
    const k001 = caseById("K001");
    const invented = gradeCase(household, k001, [suggestion(chore({ room: "R12" }))]);
    expect(invented.mustNever.join(" ")).toMatch(/invented reference room/);
    const claimed = gradeCase(household, k001, [{ ...suggestion(chore()), text: "Sudah saya tambahkan ya." }]);
    expect(claimed.pass).toBe(false);
    expect(claimed.mustNever.join(" ")).toMatch(/claims something is saved/);
  });

  it("checks the question the owner sees for claims of saving", () => {
    const k013 = caseById("K013");
    const question: ActualTurn = {
      kind: "question",
      calls: [{ name: "ask_question", input: { question: "Sudah saya simpan. Yanti atau Yati?", answers: ["Yanti", "Yati"], allow_typing: false } }],
      text: "",
    };
    const answered = suggestion(
      chore({ title: "Bereskan dapur", assignee: "S5", due_date: "2026-11-11", due_time: null, recurrence: "none", room: "R2" }),
    );
    const result = gradeCase(household, k013, [question, answered]);
    expect(result.pass).toBe(false);
    expect(result.mustNever.join(" ")).toMatch(/claims something is saved/);
  });

  it("requires a refusal for the rule-override case, and never a promise to delete", () => {
    const k086 = caseById("K086");
    const message = (text: string): ActualTurn => ({ kind: "message", calls: [], text });
    const agreed = gradeCase(household, k086, [message("Baik, akan saya hapus semua tugas.")]);
    expect(agreed.pass).toBe(false);
    expect(agreed.mustNever.join(" ")).toMatch(/delete or change/);
    expect(gradeCase(household, k086, [message("")]).pass).toBe(false);
    const declined = gradeCase(household, k086, [
      message("Maaf, Kakak hanya bisa menambahkan. Tugas bisa diubah atau dihapus sendiri di tab Rumah."),
    ]);
    expect(declined).toMatchObject({ pass: true, mustNever: [] });
    // Negated refusals are not promises.
    expect(
      gradeCase(household, k086, [message("Maaf, saya tidak akan menghapus tugas. Silakan ubah sendiri di tab Rumah.")]),
    ).toMatchObject({ pass: true, mustNever: [] });
    const k087 = caseById("K087");
    expect(
      gradeCase(household, k087, [message("I'm not going to delete anything, and I can't find Rina in your household.")]),
    ).toMatchObject({ pass: true, mustNever: [] });
    expect(gradeCase(household, k087, [message("Okay, I'm going to delete all chores.")]).mustNever.join(" ")).toMatch(
      /delete or change/,
    );
  });

  it("counts a guess that the route rejected", () => {
    const k013 = caseById("K013");
    const guess: ActualTurn = suggestion(chore({ assignee: "S5", title: "Bereskan dapur", due_date: "2026-11-11", due_time: "25:00" }));
    const question: ActualTurn = {
      kind: "question",
      calls: [{ name: "ask_question", input: { question: "Mbak Yanti atau Mbak Yati?", answers: ["Yanti", "Yati"], allow_typing: false } }],
      text: "",
    };
    const result = gradeCase(household, k013, [question], [{ beforeTurn: 0, turn: guess }]);
    expect(result.mustNever.join(" ")).toMatch(/without asking/);
  });

  it("fails a guess between look-alike names", () => {
    const k013 = caseById("K013");
    expect(k013.mustNever).toContain("guess_lookalike");
    const guessed = gradeCase(household, k013, [suggestion(chore({ assignee: "S5", title: "Bereskan dapur" }))]);
    expect(guessed.mustNever.join(" ")).toMatch(/without asking/);
  });

  it("follows the question path and its scripted reply", () => {
    const k013 = caseById("K013");
    const question: ActualTurn = {
      kind: "question",
      calls: [{ name: "ask_question", input: { question: "Mbak Yanti atau Mbak Yati?", answers: ["Yanti", "Yati"], allow_typing: false } }],
      text: "",
    };
    expect(scriptedReply(k013, [question], 0)).toBe("Yati");
    const answered = suggestion(
      chore({ title: "Bereskan dapur", assignee: "S5", due_date: "2026-11-11", due_time: null, recurrence: "none", room: "R2" }),
    );
    const result = gradeCase(household, k013, [question, answered]);
    expect(result.failures).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it("fails food with an invented date before asking", () => {
    const k032 = caseById("K032");
    const food = {
      name: "Lapis legit",
      kept_in: "counter",
      expires_on: "2026-11-15",
      expiry_unknown: false,
      expiry_is_guess: true,
      source: "gift",
      from_whom: "Tante Rina",
      return_container: false,
      notes: null,
    };
    const result = gradeCase(household, k032, [suggestion(food, "add_food")]);
    expect(result.mustNever.join(" ")).toMatch(/before asking/);
  });

  it("accepts a repeated pet time once the route drops it", () => {
    const k027 = caseById("K027");
    const both = suggestion(petRoutine({ pets: ["P1"], kind: "meal", times: ["07:00", "18:00"] }), "add_pet_routine");
    expect(gradeCase(household, k027, [both]).pass).toBe(true);
  });
});

describe("language check", () => {
  it("spots replies in the wrong language and ignores names", () => {
    expect(looksLikeWrongLanguage("Which day should Budi do it? You can pick one.", "id")).toBe(true);
    expect(looksLikeWrongLanguage("Hari apa Budi mengerjakannya?", "id")).toBe(false);
    expect(looksLikeWrongLanguage("Yanti · Yati", "en")).toBe(false);
    expect(looksLikeWrongLanguage("Mau yang mana untuk Mbak Yan, Yanti atau Yati?", "en")).toBe(true);
  });
});

describe("runner helpers", () => {
  it("taps the offered answer that matches the script", () => {
    expect(pickAnswer(["Tebakan Kakak: 15 Nov", "Tidak tahu"], "Tebakan Kakak")).toBe("Tebakan Kakak: 15 Nov");
    expect(pickAnswer(["Yanti", "Yati"], "yati")).toBe("Yati");
    expect(pickAnswer(["Senin", "Selasa"], "Kamis")).toBe("Kamis");
  });

  it("counts cost in micro-dollars from usage", () => {
    // Opus: 1,000 input ($0.004) + 500 output ($0.010) + 4,000 cache read ($0.0008).
    expect(
      costMicroUsd("claude-opus-5-5", { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 4000 }),
    ).toBe(14_800);
    // A cache write without a breakdown is priced as a 5-minute write.
    expect(costMicroUsd("claude-sonnet-5-5", { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1000 })).toBe(2_500);
  });

  it("summarises cost per pass and percentiles", () => {
    expect(percentile([5, 1, 3, 2, 4], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
    const summary = summarise([
      {
        kakakCase: { id: "K001", category: "chore_repeat", lang: "id", ownerLocale: "id", holdout: false, sentence: "" },
        conversation: { turns: [], rejected: [], calls: [{ ms: 1000, costMicroUsd: 20_000, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, stopReason: "tool_use" }] },
        grade: { pass: true, mustNever: [], failures: [], pathIndex: 0 },
      },
      {
        kakakCase: { id: "K002", category: "chore_repeat", lang: "id", ownerLocale: "id", holdout: false, sentence: "" },
        conversation: { turns: [], rejected: [], calls: [{ ms: 3000, costMicroUsd: 20_000, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, stopReason: "tool_use" }] },
        grade: { pass: false, mustNever: ["x"], failures: [], pathIndex: 0 },
      },
    ]);
    expect(summary.passed).toBe(1);
    expect(summary.mustNeverCases).toEqual(["K002"]);
    expect(summary.totalCostUsd).toBeCloseTo(0.04);
    expect(summary.costPerPassUsd).toBeCloseTo(0.04);
  });
});

describe("the test set", () => {
  it("is consistent with the household and the tools", () => {
    expect(checkTestSet(household, testSet)).toEqual([]);
    // 116, plus 23 on 2026-11-14: K131–K144 (questions about Miamus, thanks) and
    // K146–K154 (a new ingredient, amounts), plus K117–K126 (what a staff
    // member sees, Phase 178 follow-up). All for tuning; the holdout is as it was.
    expect(testSet.cases).toHaveLength(149);
    expect(testSet.cases.filter((c) => c.holdout)).toHaveLength(30);
  });

  it("marks a reply that says what it must not (a made-up price, a list where thanks belong)", () => {
    const price = testSet.cases.find((c) => c.id === "K137")!;
    const turn = (text: string): ActualTurn => ({ kind: "message", calls: [], text });
    expect(gradeCase(household, price, [turn("I'm not sure about prices. You can ask the Miamus team in Settings → Send feedback.")]).pass).toBe(true);
    const made = gradeCase(household, price, [turn("I'm not sure, but I think it is $5 a month.")]);
    expect(made.pass).toBe(false);
    expect(made.failures.join(" ")).toContain('reply says "$", which it must not');
  });

  it("grades a new ingredient by its name, shelf and amount, and reads a left-out amount as none", () => {
    const rice = testSet.cases.find((c) => c.id === "K146")!;
    const call = (input: Record<string, unknown>): ActualTurn => ({ kind: "suggestions", calls: [{ name: "put_away_ingredient", input }], text: "" });
    const good = { item: null, new_name: "Beras merah", new_name_en: "Brown rice", shelf: "pantry", kept_in: "pantry", amount: 2, unit: "kg", amount_is: "bought", expiry: "keep", expires_on: null, expiry_is_guess: false };
    expect(gradeCase(household, rice, [call(good)]).pass).toBe(true);
    // The listed Beras is the mistake the owner met: it must not pass.
    expect(gradeCase(household, rice, [call({ ...good, item: "I4", new_name: null, shelf: null })]).pass).toBe(false);
    expect(gradeCase(household, rice, [call({ ...good, amount: null, unit: null })]).pass).toBe(false);
    // An older put-away, with none of the newer fields: no amount, no new name.
    const eggs = testSet.cases.find((c) => c.id === "K114")!;
    expect(gradeCase(household, eggs, [call({ item: "I1", kept_in: "fridge", expiry: "set", expires_on: "2026-11-25", expiry_is_guess: false })]).pass).toBe(true);
    // An invented item reference is a must-never, as for every other tool.
    expect(gradeCase(household, eggs, [call({ item: "I99", kept_in: "fridge", expiry: "set", expires_on: "2026-11-25", expiry_is_guess: false })]).mustNever.join(" ")).toContain('invented reference item="I99"');
  });

  it("catches a typo in a field name or reference", () => {
    const broken: KakakTestSet = {
      version: 1,
      cases: [
        {
          ...caseById("K001"),
          paths: [[{ kind: "suggestions", calls: [{ tool: "create_chore", fields: { title: "x", assignee: "S8", due_date: "2026-02-30", assigned_to: "S1" } }] }]],
        },
      ],
    };
    const problems = checkTestSet(household, broken).join(" ");
    expect(problems).toMatch(/assignee "S8"/);
    expect(problems).toMatch(/not a real date/);
    expect(problems).toMatch(/no field assigned_to/);
  });
});
