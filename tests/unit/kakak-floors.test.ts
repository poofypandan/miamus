// Kakak and floors (Phase 158 PR B2): rooms labelled with their floor, a
// floor offered as a whole-floor place, and a new room that names its floor.

import { describe, expect, it } from "vitest";
import { buildContext, type ContextRows } from "@/lib/kakak/context";
import { describeSuggestion } from "@/lib/kakak/describe";
import { renderHouseholdBlock } from "@/lib/kakak/household";
import { isSaveableSuggestion, toSuggestion, type ChoreSuggestion } from "@/lib/kakak/suggestions";
import { validateToolCall } from "@/lib/kakak/validate";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = "11111111-1111-4111-8111-111111111111";

const rows: ContextRows = {
  staff: [{ id: id(1), name: "Ari", created_at: "2026-01-01", user_id: null, archived_at: null }],
  pets: [],
  schedules: [],
  rooms: [
    { id: id(20), name: "LT2", created_at: "2026-01-01", kind: "floor", parent_id: null },
    { id: id(21), name: "Service Area", created_at: "2026-01-02", kind: "room", parent_id: id(20) },
    { id: id(22), name: "LT1", created_at: "2026-01-03", kind: "floor", parent_id: null },
    { id: id(23), name: "Service Area", created_at: "2026-01-04", kind: "room", parent_id: id(22) },
    { id: id(24), name: "Teras", created_at: "2026-01-05", kind: "room", parent_id: null },
    // Before migrations/129: no kind, no floor.
    { id: id(25), name: "Dapur", created_at: "2026-01-06" },
  ],
  items: [],
};

const built = buildContext(rows, { today: "2026-11-11", now: "08:30", ownerLocale: "en", callerUserId: OWNER });

const choreInput = (over: Record<string, unknown>) => ({
  title: "Vakum",
  title_en: null,
  category: "cleaning",
  assignee: null,
  due_date: "2026-11-12",
  due_time: null,
  recurrence: "none",
  recurrence_until: null,
  requires_supervision: false,
  room: null,
  new_room_name: null,
  new_room_floor: null,
  notes: null,
  ...over,
});

describe("Kakak's rooms with floors", () => {
  it("lists each place with its floor, and floors as whole-floor places", () => {
    const block = renderHouseholdBlock(built.household);
    expect(block).toContain("- R1: LT2 (whole floor)");
    expect(block).toContain("- R2: LT2 · Service Area");
    expect(block).toContain("- R4: LT1 · Service Area");
    expect(block).toContain("- R5: Teras");
    expect(block).toContain("- R6: Dapur");
    // The card names them the way the app's tags do.
    expect(built.names.rooms).toMatchObject({ R1: "LT2", R2: "LT2 · Service Area", R4: "LT1 · Service Area" });
    expect(built.refs.rooms.R4).toBe(id(23));
  });

  it("lets a new room name its floor, but only a floor and only with a name", () => {
    const ok = validateToolCall(built.household, "create_chore", choreInput({ new_room_name: "Gudang", new_room_floor: "R1" }));
    expect(ok).toEqual({ ok: true });
    const notAFloor = validateToolCall(built.household, "create_chore", choreInput({ new_room_name: "Gudang", new_room_floor: "R5" }));
    expect(notAFloor.ok).toBe(false);
    const noName = validateToolCall(built.household, "create_chore", choreInput({ new_room_floor: "R1" }));
    expect(noName.ok).toBe(false);
    if (!noName.ok) expect(noName.errors.join(" ")).toMatch(/new_room_floor without new_room_name/);
    // A call without the field at all (an older test set) still passes.
    const { new_room_floor: _drop, ...older } = choreInput({});
    void _drop;
    expect(validateToolCall(built.household, "create_chore", older)).toEqual({ ok: true });
  });

  it("carries the floor to the card and the save", () => {
    const suggestion = toSuggestion(
      built.household,
      built.refs,
      built.names,
      "create_chore",
      choreInput({ new_room_name: "Gudang", new_room_floor: "R1" }),
    ) as ChoreSuggestion;
    expect(suggestion).toMatchObject({ newRoomName: "Gudang", newRoomFloorId: id(20), newRoomFloorName: "LT2" });
    expect(isSaveableSuggestion(suggestion)).toBe(true);
    expect(isSaveableSuggestion({ ...suggestion, newRoomName: null })).toBe(false);
    const rows = describeSuggestion(suggestion, "en").rows;
    expect(rows.find((r) => r.label === "Room")?.value).toBe("LT2 · Gudang (new room)");
  });

  it("names an existing room with its floor on the card", () => {
    const suggestion = toSuggestion(built.household, built.refs, built.names, "create_chore", choreInput({ room: "R4" })) as ChoreSuggestion;
    expect(suggestion).toMatchObject({ locationId: id(23), roomName: "LT1 · Service Area", newRoomFloorId: null });
  });
});
