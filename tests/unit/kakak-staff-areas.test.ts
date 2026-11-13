// Phase 178 follow-up: Kakak sets what a staff member sees with
// set_staff_areas. The household block says who doesn't see what, the tool
// isn't strict (the union limit), so validateToolCall checks all of it, and
// the card saves through the owner's own switches' path.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { describeSuggestion, savedSummary } from "@/lib/kakak/describe";
import { runKakakTurn, toolsFor, type CallRecord, type TurnDeps, type TurnResult } from "@/lib/kakak/engine";
import { renderHouseholdBlock, type KakakHousehold } from "@/lib/kakak/household";
import { practiceClient } from "@/lib/kakak/practice";
import { KAKAK_SYSTEM_PROMPT } from "@/lib/kakak/prompt";
import { isSaveableSuggestion, toSuggestion, type StaffAreasSuggestion } from "@/lib/kakak/suggestions";
import { KAKAK_TOOLS } from "@/lib/kakak/tools";
import { validateToolCall } from "@/lib/kakak/validate";
import { withAreas } from "@/lib/staff-areas";
import { gradeCase, type ActualTurn } from "../kakak/grade";
import { checkTestSet } from "../kakak/test-set-check";
import type { KakakTestSet } from "../kakak/types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = "11111111-1111-4111-8111-111111111111";
const WIFE = "22222222-2222-4222-8222-222222222222";

const rows: ContextRows = {
  staff: [
    // M1: the owner asking.
    { id: id(1), name: "Moshe", created_at: "2026-01-01", user_id: OWNER, archived_at: null },
    // S1: Ari sees everything.
    { id: id(2), name: "Ari", created_at: "2026-01-02", user_id: null, archived_at: null, hidden_areas: [] },
    // S2: Syam doesn't see the kitchen (stored out of order, with an unknown value).
    { id: id(3), name: "Mas Syam", created_at: "2026-01-03", user_id: null, archived_at: null, hidden_areas: ["repairs", "garden", "kitchen"] },
    // S3: a co-owner, never limited (rule 6), even with a stray stored value.
    { id: id(4), name: "Rina", created_at: "2026-01-04", user_id: WIFE, archived_at: null, hidden_areas: ["kitchen"] },
    // Removed: not in the block at all.
    { id: id(5), name: "Lama", created_at: "2026-01-05", user_id: null, archived_at: "2026-02-01", hidden_areas: ["home"] },
  ],
  pets: [],
  schedules: [],
  rooms: [],
  items: [],
} as ContextRows;

// Wednesday 11 November 2026.
const opts = { today: "2026-11-11", now: "08:30", ownerLocale: "en" as const, callerUserId: OWNER };
const built = (over: Partial<ContextRows> = {}, locale: "en" | "id" = "en") =>
  buildContext({ ...rows, ...over }, { ...opts, ownerLocale: locale });

const call = (over: Record<string, unknown> = {}) => ({ staff: "S1", show: [], hide: ["kitchen", "repairs"], ...over });

describe("the household block", () => {
  it("says what a staff member doesn't see, in the areas' order; everyone else reads as before", () => {
    const block = renderHouseholdBlock(built().household);
    expect(block).toContain("- S1: Ari\n");
    expect(block).toContain("- S2: Syam (doesn't see: kitchen, repairs)\n");
    // A co-owner is never limited, and isn't marked as an owner in the block.
    expect(block).toContain("- S3: Rina\n");
    expect(block).not.toContain("Lama");
  });

  it("is exactly as before for a household where everyone sees everything, or a read without the column", () => {
    const plain = rows.staff.map(({ hidden_areas: _hidden, ...rest }) => (void _hidden, rest));
    const before = renderHouseholdBlock(built({ staff: plain }).household);
    const allOn = rows.staff.map((p) => ({ ...p, hidden_areas: [] }));
    expect(renderHouseholdBlock(built({ staff: allOn }).household)).toBe(before);
    expect(before).not.toContain("doesn't see");
  });

  it("flags the co-owner and Repairs switched off without writing either into the block", () => {
    const { household } = built({ repairsOn: false });
    expect(household.people.find((p) => p.ref === "S3")).toEqual({ ref: "S3", name: "Rina", owner: true });
    expect(household.repairsOff).toBe(true);
    expect(built().household.repairsOff).toBeUndefined();
    expect(built({ repairsOn: null }).household.repairsOff).toBeUndefined();
  });
});

describe("the tool", () => {
  it("is always offered, isn't strict, and leaves the strict set as it was", () => {
    const tool = KAKAK_TOOLS.find((t) => t.name === "set_staff_areas")!;
    expect(tool.strict).toBeUndefined();
    expect(tool.input_schema.required).toEqual(["staff", "show", "hide"]);
    expect(toolsFor(built().household).map((t) => t.name)).toContain("set_staff_areas");
    expect(toolsFor(built({ hasPets: false, foodOn: false }).household).map((t) => t.name)).toContain("set_staff_areas");
    expect(KAKAK_TOOLS.filter((t) => t.strict).map((t) => t.name)).toEqual(["create_chore", "add_pet_routine", "ask_question"]);
  });

  it("is in Kakak's instructions, and no longer among what she can't do", () => {
    expect(KAKAK_SYSTEM_PROMPT).toContain("- set_staff_areas:");
    expect(KAKAK_SYSTEM_PROMPT).toContain("# Staff areas");
    const cantDo = KAKAK_SYSTEM_PROMPT.slice(KAKAK_SYSTEM_PROMPT.indexOf("# What you can't do yet"));
    expect(cantDo).toContain("other than an ingredient's place and date and what a staff member sees");
    expect(cantDo).not.toMatch(/^- what a staff member sees/m);
    // She doesn't pick someone for kitchen work or a repair whose area is off.
    expect(KAKAK_SYSTEM_PROMPT).toContain("never pick someone whose kitchen is off");
  });
});

describe("validateToolCall for set_staff_areas", () => {
  const { household } = built();
  const check = (input: Record<string, unknown>) => validateToolCall(household, "set_staff_areas", input);
  const errors = (input: Record<string, unknown>) => {
    const result = check(input);
    return result.ok ? [] : result.errors;
  };

  it("accepts hiding, showing, and both at once", () => {
    expect(check(call())).toEqual({ ok: true });
    expect(check(call({ staff: "S2", show: ["kitchen"], hide: [] }))).toEqual({ ok: true });
    expect(check(call({ show: ["pets"], hide: ["home", "kitchen", "repairs"] }))).toEqual({ ok: true });
  });

  it("checks the whole shape: every field, no others, lists of known areas", () => {
    const { hide: _hide, ...noHide } = call();
    void _hide;
    expect(errors(noHide).join()).toContain("missing hide");
    expect(errors({ ...call(), note: "x" }).join()).toContain("unknown fields: note");
    expect(errors(call({ hide: "kitchen" })).join()).toContain("hide must be a list");
    expect(errors(call({ hide: null })).join()).toContain("hide must be a list");
    expect(errors(call({ hide: ["garden"] })).join()).toContain("hide must hold only home, pets, kitchen, repairs");
    expect(errors(call({ hide: ["kitchen", "kitchen"] })).join()).toContain("hide repeats an area");
    expect(errors(call({ show: ["kitchen"], hide: ["kitchen"] })).join()).toContain("kitchen is in both show and hide");
    expect(errors(call({ show: [], hide: [] })).join()).toContain("show and hide are both empty");
  });

  it("takes only a listed staff member: never the owner, a co-owner, or a name that isn't there", () => {
    expect(errors(call({ staff: "M1" })).join()).toContain("owners always see everything");
    expect(errors(call({ staff: "S3" })).join()).toContain("owners always see everything");
    expect(errors(call({ staff: "S9" })).join()).toContain('staff "S9" is not a reference in this household');
    expect(errors(call({ staff: "Syam" })).join()).toContain("not a reference");
    expect(errors(call({ staff: null })).join()).toContain("staff is required");
  });

  it("refuses a change that changes nothing, so she says so instead", () => {
    expect(errors(call({ staff: "S2", show: [], hide: ["kitchen"] })).join()).toContain("nothing would change");
    expect(errors(call({ staff: "S1", show: ["home", "pets"], hide: [] })).join()).toContain("nothing would change");
    // Part of it already so is fine: the rest changes.
    expect(check(call({ staff: "S2", hide: ["kitchen", "home"] }))).toEqual({ ok: true });
  });

  it("refuses pets while pets are switched off", () => {
    const off = built({ hasPets: false }).household;
    const result = validateToolCall(off, "set_staff_areas", call({ show: [], hide: ["pets", "kitchen"] }));
    expect(result.ok ? [] : result.errors).toContain("pets are switched off for this household: leave pets out");
  });
});

describe("the suggestion", () => {
  const suggest = (input: Record<string, unknown>, over: Partial<ContextRows> = {}, locale: "en" | "id" = "en") => {
    const context = built(over, locale);
    return toSuggestion(context.household, context.refs, context.names, "set_staff_areas", input) as StaffAreasSuggestion;
  };

  it("maps the reference to the person, with what was hidden before and the household's switches", () => {
    expect(suggest(call({ staff: "S2", show: ["kitchen"], hide: ["home"] }))).toEqual({
      kind: "staff_areas",
      staffId: id(3),
      staffName: "Syam",
      show: ["kitchen"],
      hide: ["home"],
      before: ["kitchen", "repairs"],
      areas: ["home", "pets", "kitchen", "repairs"],
      nobody: [],
    });
    // Repairs and Pet routines only when the home has them, as on the owner's dialog.
    expect(suggest(call(), { repairsOn: false, hasPets: false }).areas).toEqual(["home", "kitchen"]);
  });

  it("never maps an owner or an unknown reference", () => {
    expect(suggest(call({ staff: "S3" }))).toBeNull();
    expect(suggest(call({ staff: "M1" }))).toBeNull();
    expect(suggest(call({ staff: "S9" }))).toBeNull();
  });

  it("says when nobody on staff would see pet routines or chores for anyone (rule 3)", () => {
    // Syam already has pets on; Ari turning pets off leaves Syam.
    expect(suggest(call({ hide: ["pets"] })).nobody).toEqual([]);
    const syamNoPets = rows.staff.map((p) => (p.id === id(3) ? { ...p, hidden_areas: ["pets", "home"] } : p));
    expect(suggest(call({ hide: ["pets", "home"] }), { staff: syamNoPets }).nobody).toEqual(["home", "pets"]);
    // Pets switched off: no pets warning.
    expect(suggest(call({ hide: ["home"] }), { staff: syamNoPets, hasPets: false }).nobody).toEqual(["home"]);
  });

  it("is saveable as built, and refused by the phone when it's malformed", () => {
    const good = suggest(call({ staff: "S2", show: ["kitchen"], hide: ["home"] }));
    expect(isSaveableSuggestion(good)).toBe(true);
    expect(isSaveableSuggestion({ ...good, staffId: "S2" })).toBe(false);
    expect(isSaveableSuggestion({ ...good, show: [], hide: [] })).toBe(false);
    expect(isSaveableSuggestion({ ...good, show: ["home"], hide: ["home"] })).toBe(false);
    expect(isSaveableSuggestion({ ...good, hide: ["garden"] })).toBe(false);
    expect(isSaveableSuggestion({ ...good, hide: ["home", "home"] })).toBe(false);
    expect(isSaveableSuggestion({ ...good, before: null })).toBe(false);
    expect(isSaveableSuggestion({ ...good, nobody: ["kitchen"] })).toBe(false);
    expect(isSaveableSuggestion({ ...good, staffName: "" })).toBe(false);
  });

  it("reads on the card in both languages, with what changes marked", () => {
    const item = suggest(call({ staff: "S2", show: ["pets"], hide: ["home", "kitchen", "repairs"] }));
    expect(describeSuggestion(item, "en")).toEqual({
      heading: "What Syam sees",
      rows: [
        { label: "Chores for anyone", value: "Off (was on)" },
        { label: "Pet routines", value: "On" },
        { label: "Kitchen", value: "Off" },
        { label: "Repairs", value: "Off" },
      ],
      note: "Anything you give Syam by name always shows.",
    });
    const shown = suggest(call({ staff: "S2", show: ["kitchen"], hide: [] }));
    expect(describeSuggestion(shown, "id")).toEqual({
      heading: "Yang dilihat Syam",
      rows: [
        { label: "Tugas untuk siapa saja", value: "Aktif" },
        { label: "Rutinitas hewan", value: "Aktif" },
        { label: "Dapur", value: "Aktif (sebelumnya mati)" },
        { label: "Perbaikan", value: "Mati" },
      ],
      note: "Tugas yang Anda berikan langsung ke Syam selalu terlihat.",
    });
    expect(savedSummary([item], "en")).toBe("Saved — What Syam sees");
    expect(savedSummary([shown], "id")).toBe("Tersimpan — Yang dilihat Syam");
  });

  it("adds the 'nobody would see' line on the card", () => {
    const syamNoPets = rows.staff.map((p) => (p.id === id(3) ? { ...p, hidden_areas: ["pets"] } : p));
    const item = suggest(call({ hide: ["pets"] }), { staff: syamNoPets });
    expect(describeSuggestion(item, "en").note).toBe(
      "Anything you give Ari by name always shows. Nobody would see pet routines, so every staff member will see them.",
    );
    expect(describeSuggestion(item, "id").note).toBe(
      "Tugas yang Anda berikan langsung ke Ari selalu terlihat. Tidak ada yang akan melihat rutinitas hewan, jadi semua staf akan melihatnya.",
    );
  });

  it("uses no emoji or symbol icons in its words", () => {
    const item = suggest(call({ staff: "S2", show: ["kitchen"], hide: ["home"] }));
    for (const locale of ["en", "id"] as const) {
      const card = describeSuggestion(item, locale);
      const words = [card.heading, card.note ?? "", ...card.rows.flatMap((r) => [r.label, r.value])].join(" ");
      expect(words).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });
});

describe("withAreas", () => {
  it("applies show and hide on top of the latest list, in the areas' order", () => {
    expect(withAreas(["repairs"], ["repairs"], ["kitchen", "home"])).toEqual(["home", "kitchen"]);
    expect(withAreas(null, [], ["repairs", "pets"])).toEqual(["pets", "repairs"]);
    // An area the change doesn't name stays as it is; unknown values drop.
    expect(withAreas(["pets", "garden"], ["kitchen"], [])).toEqual(["pets"]);
  });
});

describe("a turn", () => {
  function setup(locale: "en" | "id", over: Partial<ContextRows> = {}) {
    const context = built(over, locale);
    const recorded: CallRecord[] = [];
    let begun = 0;
    const deps: TurnDeps = {
      client: practiceClient(context.household),
      model: "claude-opus-5-5",
      effort: "low",
      household: context.household,
      refs: context.refs,
      names: context.names,
      begin: async () => ({ ok: true, requestId: id(900 + ++begun), callsLeft: 40 }),
      record: async (_request, record) => void recorded.push(record),
    };
    return { deps, recorded };
  }
  const items = (result: TurnResult) => {
    if (result.kind !== "suggestions") throw new Error(`expected suggestions, got ${result.kind}`);
    for (const item of result.items) expect(isSaveableSuggestion(item)).toBe(true);
    return result.items;
  };

  it("practice mode hides Dapur and Perbaikan from a named person, and the record names the tool", async () => {
    const { deps, recorded } = setup("id");
    const result = await runKakakTurn(deps, null, "Sembunyikan Dapur dan Perbaikan dari Ari");
    expect(items(result)).toEqual([
      expect.objectContaining({ kind: "staff_areas", staffId: id(2), show: [], hide: ["kitchen", "repairs"] }),
    ]);
    // migrations/171: kakak_record accepts this name.
    expect(recorded.map((r) => r.tools)).toEqual([["set_staff_areas"]]);
  });

  it("practice mode: 'only show' shows that area and hides the rest", async () => {
    const result = await runKakakTurn(setup("en").deps, null, "Only show Ari the pet routines");
    expect(items(result)).toEqual([
      expect.objectContaining({ kind: "staff_areas", show: ["pets"], hide: ["home", "kitchen", "repairs"] }),
    ]);
  });

  it("a change that changes nothing goes back once, then nothing is offered to save", async () => {
    const result = await runKakakTurn(setup("en").deps, null, "Hide the kitchen from Syam");
    expect(result.kind).toBe("message");
  });
});

describe("the eval's staff-areas cases", () => {
  const household = JSON.parse(readFileSync(join(__dirname, "..", "kakak", "household.json"), "utf8")) as KakakHousehold;
  const testSet = JSON.parse(readFileSync(join(__dirname, "..", "kakak", "test-set.json"), "utf8")) as KakakTestSet;
  const byId = (id: string) => testSet.cases.find((c) => c.id === id)!;
  const turn = (input: Record<string, unknown>): ActualTurn => ({
    kind: "suggestions",
    calls: [{ name: "set_staff_areas", input }],
    text: "Baik.",
  });

  it("cover hiding, pets only, an unknown name and 'Sam', in both languages", () => {
    const cases = testSet.cases.filter((c) => c.category === "staff_areas");
    expect(cases.map((c) => c.id)).toEqual(["K117", "K118", "K119", "K120", "K121", "K122", "K123", "K124", "K125"]);
    expect(new Set(cases.map((c) => c.ownerLocale))).toEqual(new Set(["en", "id"]));
    // The household the cases are written against: Syam is listed, Budi has the kitchen off, nobody is Rina.
    expect(household.people.find((p) => p.name === "Syam")?.ref).toBe("S6");
    expect(renderHouseholdBlock(household)).toContain("- S3: Budi (doesn't see: kitchen)");
    expect(household.people.some((p) => p.name === "Rina")).toBe(false);
  });

  it("grade a right call as a pass, and a wrong person or an extra area as a fail", () => {
    expect(gradeCase(household, byId("K117"), [turn({ staff: "S6", show: [], hide: ["repairs", "kitchen"] })]).pass).toBe(true);
    expect(gradeCase(household, byId("K117"), [turn({ staff: "S1", show: [], hide: ["kitchen", "repairs"] })]).pass).toBe(false);
    expect(gradeCase(household, byId("K117"), [turn({ staff: "S6", show: [], hide: ["kitchen", "repairs", "home"] })]).pass).toBe(false);
    // Pets only: show may name pets or not, the other three are hidden.
    expect(gradeCase(household, byId("K119"), [turn({ staff: "S6", show: ["pets"], hide: ["home", "kitchen", "repairs"] })]).pass).toBe(true);
    expect(gradeCase(household, byId("K119"), [turn({ staff: "S6", show: [], hide: ["home", "kitchen", "repairs"] })]).pass).toBe(true);
    // An unknown name: guessing someone fails.
    expect(gradeCase(household, byId("K121"), [turn({ staff: "S1", show: [], hide: ["kitchen"] })]).pass).toBe(false);
  });

  it("are refused by the test-set check when an area is misspelt", () => {
    const broken: KakakTestSet = {
      version: 1,
      cases: [{ ...byId("K117"), paths: [[{ kind: "suggestions", calls: [{ tool: "set_staff_areas", fields: { staff: "S6", hide: { sameSet: ["dapur"] } } }] }]] }],
    };
    expect(checkTestSet(household, broken).join(" ")).toMatch(/hide has an area that is not home, pets, kitchen, repairs/);
  });
});
