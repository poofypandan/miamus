// "Remind me" through Kakak (migrations/137): the tool field, its checks,
// the suggestion and save check, the card row, and practice mode.

import { describe, expect, it } from "vitest";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { describeSuggestion } from "@/lib/kakak/describe";
import { runKakakTurn, type TurnDeps } from "@/lib/kakak/engine";
import { practiceClient } from "@/lib/kakak/practice";
import { isSaveableSuggestion, toSuggestion, type KakakSuggestion } from "@/lib/kakak/suggestions";
import { KAKAK_TOOLS } from "@/lib/kakak/tools";
import { validateToolCall } from "@/lib/kakak/validate";

const OWNER = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows: ContextRows = {
  staff: [
    { id: id(1), name: "Budi", created_at: "2026-01-01", user_id: null, archived_at: null },
    { id: id(3), name: "Dewi", created_at: "2026-01-03", user_id: OWNER, archived_at: null },
  ],
  pets: [],
  schedules: [],
  rooms: [{ id: id(20), name: "Teras", created_at: "2026-01-01" }],
  items: [],
};
const built = buildContext(rows, { today: "2026-11-11", now: "08:30", ownerLocale: "id", callerUserId: OWNER });

const input = (extra: Record<string, unknown> = {}) => ({
  title: "Servis AC",
  title_en: null,
  category: "maintenance",
  assignee: "S1",
  due_date: "2026-11-14",
  due_time: null,
  recurrence: "none",
  recurrence_until: null,
  requires_supervision: false,
  room: null,
  new_room_name: null,
  new_room_floor: null,
  notes: null,
  remind_days_before: null,
  ...extra,
});

describe("create_chore's remind_days_before", () => {
  it("is in the strict schema, required, and only 0, 1, 3, 7 or null", () => {
    const tool = KAKAK_TOOLS.find((t) => t.name === "create_chore")!;
    const schema = tool.input_schema as { required: string[]; properties: Record<string, unknown> };
    expect(schema.required).toContain("remind_days_before");
    expect(schema.properties.remind_days_before).toEqual(
      expect.objectContaining({ anyOf: [{ type: "integer", enum: [0, 1, 3, 7] }, { type: "null" }] }),
    );
  });

  it("passes the route's check for each choice, and refuses anything else", () => {
    for (const days of [null, 0, 1, 3, 7]) {
      expect(validateToolCall(built.household, "create_chore", input({ remind_days_before: days })).ok).toBe(true);
    }
    const without: Record<string, unknown> = input();
    delete without.remind_days_before;
    expect(validateToolCall(built.household, "create_chore", without).ok).toBe(true);
    for (const days of [2, -1, 14, "1"]) {
      expect(validateToolCall(built.household, "create_chore", input({ remind_days_before: days })).ok).toBe(false);
    }
  });

  it("becomes the suggestion's remindDaysBefore, which the phone checks again", () => {
    const item = toSuggestion(built.household, built.refs, built.names, "create_chore", input({ remind_days_before: 1 }));
    expect(item).toMatchObject({ kind: "chore", assignedTo: id(1), remindDaysBefore: 1 });
    expect(isSaveableSuggestion(item)).toBe(true);
    expect(isSaveableSuggestion({ ...item, remindDaysBefore: 2 })).toBe(false);
    // A card from before this change (no field) is still saveable: no reminder.
    const older: Record<string, unknown> = { ...item };
    delete older.remindDaysBefore;
    expect(isSaveableSuggestion(older)).toBe(true);
  });

  it("shows on the card in the chore form's words", () => {
    const item = toSuggestion(built.household, built.refs, built.names, "create_chore", input({ remind_days_before: 7 }))!;
    expect(describeSuggestion(item, "en").rows).toContainEqual({ label: "Remind me", value: "1 week before" });
    expect(describeSuggestion(item, "id").rows).toContainEqual({ label: "Ingatkan saya", value: "1 minggu sebelumnya" });
    const none = toSuggestion(built.household, built.refs, built.names, "create_chore", input())!;
    expect(describeSuggestion(none, "en").rows.map((r) => r.label)).not.toContain("Remind me");
  });
});

describe("practice mode hears the lead time", () => {
  const deps: TurnDeps = {
    client: practiceClient(built.household),
    model: "claude-opus-5-5",
    effort: "low",
    household: built.household,
    refs: built.refs,
    names: built.names,
    begin: async () => ({ ok: true, requestId: "00000000-0000-4000-8000-0000000000ad", callsLeft: 10 }),
    record: async () => undefined,
  };
  const chore = async (sentence: string) => {
    const result = await runKakakTurn(deps, null, sentence);
    if (result.kind !== "suggestions") throw new Error(`${result.kind}: ${"text" in result ? result.text : ""}`);
    return result.items[0] as Extract<KakakSuggestion, { kind: "chore" }>;
  };

  it("in Indonesian and English, and keeps the phrase out of the title", async () => {
    const id1 = await chore("Budi servis AC hari Sabtu, ingatkan saya sehari sebelumnya");
    expect(id1).toMatchObject({ assignedTo: id(1), dueDate: "2026-11-14", remindDaysBefore: 1 });
    expect(id1.title).not.toMatch(/ingatkan|sebelum/i);
    expect((await chore("Budi cleans the terrace on Saturday, remind me a week before")).remindDaysBefore).toBe(7);
    expect((await chore("Budi pel teras hari Sabtu, ingatkan saya 3 hari sebelumnya")).remindDaysBefore).toBe(3);
  });

  it("no reminder unless asked", async () => {
    expect((await chore("Budi pel teras hari Sabtu")).remindDaysBefore).toBeNull();
  });
});
