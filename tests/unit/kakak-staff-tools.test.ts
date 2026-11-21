// Staff onboarding step 5: Kakak suggests adding a staff member (add_staff)
// and removing one (remove_staff). Neither tool is strict (the union limit,
// tools.ts), so validateToolCall checks the whole shape; the cards save
// through the Free sheets' own paths (steps 2 and 4), never through Kakak.
import { describe, expect, it } from "vitest";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { describeSuggestion, savedSummary } from "@/lib/kakak/describe";
import { toolsFor } from "@/lib/kakak/engine";
import { KAKAK_CLIENT_VERSION } from "@/lib/kakak/client";
import {
  clientVersionFor,
  isSaveableSuggestion,
  needsNewerApp,
  toSuggestion,
  type AddStaffSuggestion,
  type RemoveStaffSuggestion,
} from "@/lib/kakak/suggestions";
import { KAKAK_TOOLS } from "@/lib/kakak/tools";
import { sameStaffName, validateToolCall } from "@/lib/kakak/validate";

import type Anthropic from "@anthropic-ai/sdk";
import { runKakakTurn, type CallRecord, type TurnDeps } from "@/lib/kakak/engine";
import { trialChore, trialNameFrom, trialTitle } from "@/lib/staff-onboarding";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = "11111111-1111-4111-8111-111111111111";
const WIFE = "22222222-2222-4222-8222-222222222222";

const rows: ContextRows = {
  staff: [
    { id: id(1), name: "Moshe", created_at: "2026-01-01", user_id: OWNER, archived_at: null }, // M1
    { id: id(2), name: "Ari", created_at: "2026-01-02", user_id: null, archived_at: null, hidden_areas: ["kitchen"] }, // S1
    { id: id(3), name: "Mbak Sri", created_at: "2026-01-03", user_id: null, archived_at: null, hidden_areas: ["home", "pets", "repairs"] }, // S2
    { id: id(4), name: "Rina", created_at: "2026-01-04", user_id: WIFE, archived_at: null }, // S3, a co-owner
  ],
  pets: [],
  schedules: [],
  rooms: [],
  items: [],
} as ContextRows;
const opts = { today: "2026-11-11", now: "08:30", ownerLocale: "en" as const, callerUserId: OWNER };
const context = buildContext(rows, opts);
const household = context.household;
const ref = (name: string) => household.people.find((p) => p.name === name)!.ref;

const add = (over: Record<string, unknown> = {}) => ({ name: "Wati", areas: ["kitchen"], starter_chores: true, trial_days: 0, ...over });
const remove = (over: Record<string, unknown> = {}) => ({ staff: ref("Sri"), give_to: ref("Ari"), ...over });

describe("the tools", () => {
  it("are offered to every household, and aren't strict (the strict union count stays 15)", () => {
    const names = KAKAK_TOOLS.map((t) => t.name);
    expect(names).toContain("add_staff");
    expect(names).toContain("remove_staff");
    for (const name of ["add_staff", "remove_staff"]) {
      expect(KAKAK_TOOLS.find((t) => t.name === name)!.strict).toBeUndefined();
      expect(toolsFor({ ...household, petsOff: true, foodOff: true, ingredientsOn: false }).map((t) => t.name)).toContain(name);
    }
  });

  it("have no field for a code, a PIN or a phone number", () => {
    for (const name of ["add_staff", "remove_staff"]) {
      const tool = KAKAK_TOOLS.find((t) => t.name === name)!;
      const fields = Object.keys((tool.input_schema as { properties: object }).properties);
      expect(fields.some((f) => /pin|code|phone|number/i.test(f))).toBe(false);
    }
  });
});

describe("add_staff is checked in full", () => {
  it("accepts a new person with what they do", () => {
    expect(validateToolCall(household, "add_staff", add())).toEqual({ ok: true });
    expect(validateToolCall(household, "add_staff", add({ areas: ["home", "pets"], starter_chores: false, trial_days: 14 }))).toEqual({ ok: true });
  });

  it("refuses a missing or extra field, an unknown area, no area, or a trial that isn't 0, 14 or 30", () => {
    const errors = (input: Record<string, unknown>) => {
      const result = validateToolCall(household, "add_staff", input);
      return result.ok ? [] : result.errors;
    };
    expect(errors({ name: "Wati", areas: ["kitchen"], starter_chores: true })).not.toEqual([]);
    expect(errors(add({ pin: "1234" }))).not.toEqual([]);
    expect(errors(add({ areas: ["garden"] }))).not.toEqual([]);
    expect(errors(add({ areas: [] })).join()).toContain("ask what they will do");
    expect(errors(add({ trial_days: 7 }))).not.toEqual([]);
  });

  it("keeps a code or number out of the name (safety case K318)", () => {
    const result = validateToolCall(household, "add_staff", add({ name: "Sri K7M-2QX" }));
    expect(result.ok).toBe(false);
  });

  it("says when the name is already on the staff list, honorific or not, or is an owner's", () => {
    const sri = validateToolCall(household, "add_staff", add({ name: "Sri" }));
    expect(sri.ok ? "" : sri.errors.join()).toContain("already called Sri");
    const owner = validateToolCall(household, "add_staff", add({ name: "rina" }));
    expect(owner.ok ? "" : owner.errors.join()).toContain("is an owner");
    expect(sameStaffName("Bu Sri", "sri")).toBe(true);
    expect(sameStaffName("Sri", "Sari")).toBe(false);
  });

  it("leaves pets out while pets are switched off", () => {
    const result = validateToolCall({ ...household, petsOff: true }, "add_staff", add({ areas: ["pets"] }));
    expect(result.ok).toBe(false);
  });
});

describe("remove_staff is checked in full", () => {
  it("accepts a staff member and who takes their work, or anyone", () => {
    expect(validateToolCall(household, "remove_staff", remove())).toEqual({ ok: true });
    expect(validateToolCall(household, "remove_staff", remove({ give_to: "anyone" }))).toEqual({ ok: true });
  });

  it("never an owner, and never to an owner or the person leaving", () => {
    const owner = validateToolCall(household, "remove_staff", remove({ staff: "M1" }));
    expect(owner.ok ? "" : owner.errors.join()).toContain("Keluarga / Family");
    expect(validateToolCall(household, "remove_staff", remove({ staff: ref("Rina") })).ok).toBe(false);
    expect(validateToolCall(household, "remove_staff", remove({ give_to: "M1" })).ok).toBe(false);
    expect(validateToolCall(household, "remove_staff", remove({ give_to: ref("Sri") })).ok).toBe(false);
    expect(validateToolCall(household, "remove_staff", remove({ give_to: "S9" })).ok).toBe(false);
  });
});

describe("the cards", () => {
  const added = toSuggestion(household, context.refs, context.names, "add_staff", add({ name: "  Wati  ", trial_days: 14 })) as AddStaffSuggestion;
  const removed = toSuggestion(household, context.refs, context.names, "remove_staff", remove()) as RemoveStaffSuggestion;
  const anyone = toSuggestion(household, context.refs, context.names, "remove_staff", remove({ give_to: "anyone" })) as RemoveStaffSuggestion;

  it("carry what the sheets need, with ids from the phone's own map", () => {
    expect(added).toEqual({ kind: "add_staff", name: "Wati", areas: ["kitchen"], starterChores: true, trialDays: 14 });
    expect(removed).toEqual({ kind: "remove_staff", staffId: id(3), staffName: "Sri", giveTo: { staffId: id(2), name: "Ari" } });
    expect(anyone.giveTo).toBeNull();
    for (const card of [added, removed, anyone]) expect(isSaveableSuggestion(card)).toBe(true);
  });

  it("are refused by the phone when a field is wrong", () => {
    expect(isSaveableSuggestion({ ...added, name: "Wati 1234" })).toBe(false);
    expect(isSaveableSuggestion({ ...added, areas: [] })).toBe(false);
    expect(isSaveableSuggestion({ ...added, trialDays: 3 })).toBe(false);
    expect(isSaveableSuggestion({ ...removed, giveTo: { staffId: id(3), name: "Sri" } })).toBe(false);
  });

  it("need this page or newer: an older page is asked to reopen", () => {
    // 6: above E2's Bought on a shopping card (5).
    expect(KAKAK_CLIENT_VERSION).toBe(6);
    expect(clientVersionFor(added)).toBe(6);
    expect(clientVersionFor(removed)).toBe(6);
    expect(needsNewerApp(removed, 5)).toBe(true);
    expect(needsNewerApp(removed, 6)).toBe(false);
  });

  it("read as the sheets do, with no job title, in both languages", () => {
    const en = describeSuggestion(added, "en");
    expect(en.heading).toBe("New staff: Wati");
    expect(en.rows.map((r) => [r.label, r.value])).toEqual([
      ["Does", "Kitchen"],
      ["Chores", "The kitchen's usual chores, ticked"],
      ["Trial", "2 weeks, then a reminder to decide"],
    ]);
    expect(describeSuggestion(added, "id").heading).toBe("Staf baru: Wati");
    const leaves = describeSuggestion(removed, "id");
    expect(leaves.heading).toBe("Sri berhenti hari ini");
    expect(leaves.rows).toEqual([{ label: "Tugasnya diberikan ke", value: "Ari" }]);
    expect(describeSuggestion(anyone, "en").rows[0].value).toBe("Anyone");
    for (const card of [en, leaves]) expect(JSON.stringify(card)).not.toMatch(/\b(cook|maid|juru masak|koki|pembantu|dipecat|fired)\b/i);
    expect(savedSummary([removed], "en")).toContain("Sri");
  });
});

// Codex, PR #173: a staff card comes alone, and the trial reaches the sheet.
describe("a staff card comes alone in a turn", () => {
  it("sends a staff change with anything beside it back to Kakak once", async () => {
    const replies = [
      [
        { type: "tool_use", id: "t1", name: "add_staff", input: add() },
        { type: "tool_use", id: "t2", name: "remove_staff", input: remove() },
      ],
      [{ type: "tool_use", id: "t3", name: "add_staff", input: add() }],
    ];
    const seen: Anthropic.MessageParam[][] = [];
    const client = {
      messages: {
        create: async (params: { messages: Anthropic.MessageParam[] }) => {
          seen.push(params.messages);
          return {
            content: [{ type: "text", text: "Of course." }, ...replies[seen.length - 1]],
            stop_reason: "tool_use",
            usage: { input_tokens: 10, output_tokens: 5 },
          };
        },
      },
    } as unknown as Anthropic;
    const recorded: CallRecord[] = [];
    const deps: TurnDeps = {
      client,
      model: "claude-opus-5-5",
      effort: "low",
      household,
      refs: context.refs,
      names: context.names,
      begin: async () => ({ ok: true, requestId: id(901), callsLeft: 40 }),
      record: async (_r, record) => void recorded.push(record),
    };
    const result = await runKakakTurn(deps, null, "Add Wati and remove Sri");
    expect(result.kind).toBe("suggestions");
    if (result.kind === "suggestions") expect(result.items.map((i) => i.kind)).toEqual(["add_staff"]);
    // The second request carried the first answer's problems back.
    expect(JSON.stringify(seen[1])).toContain("add_staff and remove_staff come alone");
  });
});

describe("the trial reminder (decision 3)", () => {
  it("is the owner's own chore, in their language, with a push on the day", () => {
    expect(trialTitle("Sri", "en")).toBe("Decide on Sri's trial");
    expect(trialTitle("Sri", "id")).toBe("Putuskan masa percobaan Sri");
    expect(trialChore(" Sri ", 14, "2026-11-20", "en")).toEqual({
      title: "Decide on Sri's trial",
      place: null,
      recurrence: "none",
      interval: 1,
      due_date: "2026-12-04",
      category: "errand",
      assignee: { me: true },
      remind: 0,
    });
    expect(trialChore("Sri", 30, "2026-11-20", "id").due_date).toBe("2026-12-20");
  });

  it("is found again by its title, in either language, and nothing else is", () => {
    expect(trialNameFrom("Decide on Sri's trial")).toBe("Sri");
    expect(trialNameFrom("Putuskan masa percobaan Sri Wahyuni")).toBe("Sri Wahyuni");
    expect(trialNameFrom("Cuci piring")).toBeNull();
    expect(trialNameFrom(null)).toBeNull();
  });

  it("shows on Kakak's card when she heard a trial", () => {
    const card = toSuggestion(household, context.refs, context.names, "add_staff", add({ trial_days: 14 })) as AddStaffSuggestion;
    expect(describeSuggestion(card, "en").rows.at(-1)).toEqual({ label: "Trial", value: "2 weeks, then a reminder to decide" });
    expect(describeSuggestion({ ...card, trialDays: 0 }, "en").rows.map((r) => r.label)).not.toContain("Trial");
  });
});
