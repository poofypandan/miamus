// Kakak go-live polish (2026-11-10): the conversation's start time that keeps
// the system prompt byte-identical across turns (preserved thinking), the
// plain reasons for API failures, and the sheet's first-screen examples.

import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { classifyApiError } from "@/lib/kakak/api-errors";
import { buildContext, jakartaNow, type ContextRows } from "@/lib/kakak/context";
import {
  BadTurnError,
  MAX_CONVERSATION_MS,
  StaleConversationError,
  checkHistory,
  conversationStart,
  runKakakTurn,
  type TurnDeps,
} from "@/lib/kakak/engine";
import { kakakExamples } from "@/lib/kakak/examples";
import { practiceClient } from "@/lib/kakak/practice";
import { MAX_REFINEMENT_NOTE, REPEAT_CHOICES, refineChore, refinementNote, repeatLabel, splitRefinementNote } from "@/lib/kakak/refine";
import { MAX_TYPED, type TurnResult } from "@/lib/kakak/engine";
import { isSaveableSuggestion } from "@/lib/kakak/suggestions";

const OWNER = "11111111-1111-4111-8111-111111111111";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows: ContextRows = {
  staff: [
    { id: id(1), name: "Ari", created_at: "2026-01-01", user_id: null, archived_at: null },
    { id: id(3), name: "Dewi", created_at: "2026-01-03", user_id: OWNER, archived_at: null },
  ],
  pets: [{ id: id(10), name: "Mochi", created_at: "2026-01-01", entity_type: "pet", metadata: {} }],
  schedules: [],
  rooms: [{ id: id(20), name: "Teras", created_at: "2026-01-01" }],
  items: [],
};

describe("conversation start", () => {
  const now = Date.parse("2026-11-14T03:00:00Z");

  it("keeps the start the phone sent back, and starts now when there is none", () => {
    const startedAt = "2026-11-14T02:58:00.000Z";
    expect(checkHistory({ messages: [], startedAt }, now)).toEqual({ messages: [], startedAt });
    expect(conversationStart({ messages: [], startedAt }, now).toISOString()).toBe(startedAt);
    expect(conversationStart({ messages: [] }, now).getTime()).toBe(now);
  });

  it("refuses a start that isn't a date, and calls an old or future one stale", () => {
    expect(() => checkHistory({ messages: [], startedAt: "soon" }, now)).toThrow(BadTurnError);
    expect(() => checkHistory({ messages: [], startedAt: 5 }, now)).toThrow(BadTurnError);
    const old = new Date(now - MAX_CONVERSATION_MS - 1000).toISOString();
    expect(() => checkHistory({ messages: [], startedAt: old }, now)).toThrow(StaleConversationError);
    const future = new Date(now + 60 * 60 * 1000).toISOString();
    expect(() => checkHistory({ messages: [], startedAt: future }, now)).toThrow(StaleConversationError);
  });

  it("calls a conversation stale once Jakarta passes midnight, so 'today' is never yesterday", () => {
    // 23.58 and 00.03 in Jakarta (UTC+7): five minutes apart, different days.
    const before = "2026-11-13T16:58:00.000Z";
    expect(() => checkHistory({ messages: [], startedAt: before }, Date.parse("2026-11-13T17:03:00Z"))).toThrow(StaleConversationError);
    expect(checkHistory({ messages: [], startedAt: before }, Date.parse("2026-11-13T16:59:30Z")).startedAt).toBe(before);
  });

  it("sends the same system prompt on the second turn, minutes later, and hands the start back", async () => {
    // Two turns of one conversation, as the route runs them: each builds the
    // household from the conversation's start, not the clock.
    const bodies: Anthropic.MessageCreateParams[] = [];
    function depsAt(startedAt: string): TurnDeps {
      const { today, now: time } = jakartaNow(new Date(startedAt));
      const built = buildContext(rows, { today, now: time, ownerLocale: "id", callerUserId: OWNER });
      const practice = practiceClient(built.household);
      const client = {
        messages: {
          create: async (body: Anthropic.MessageCreateParams) => {
            bodies.push(structuredClone(body));
            return practice.messages.create(body as Anthropic.MessageCreateParamsNonStreaming);
          },
        },
      } as unknown as Anthropic;
      return {
        client,
        model: "claude-opus-5-5",
        effort: "low",
        household: built.household,
        refs: built.refs,
        names: built.names,
        begin: async () => ({ ok: true, requestId: "00000000-0000-4000-8000-0000000000aa", callsLeft: 10 }),
        record: async () => undefined,
        startedAt,
      };
    }

    // Up to ten minutes ago, but on today's Jakarta date (runKakakTurn checks
    // against the real clock, and a conversation can't cross midnight).
    const jakartaMidnight = Date.parse(`${jakartaNow().today}T00:00:00+07:00`);
    const first = new Date(Math.max(Date.now() - 10 * 60 * 1000, jakartaMidnight)).toISOString();
    const turn1 = await runKakakTurn(depsAt(first), null, "Ari pel teras jam 9");
    if (turn1.kind !== "question") throw new Error(turn1.kind);
    expect(turn1.history.startedAt).toBe(first);

    // Two minutes later the owner taps an answer; the phone sends the history back.
    const history = checkHistory(JSON.parse(JSON.stringify(turn1.history)), Date.parse(first) + 2 * 60 * 1000);
    const turn2 = await runKakakTurn(depsAt(conversationStart(history).toISOString()), history, "Besok");
    expect(turn2.kind).toBe("suggestions");

    expect(bodies).toHaveLength(2);
    expect(JSON.stringify(bodies[1].system)).toBe(JSON.stringify(bodies[0].system));
    expect(JSON.stringify(bodies[1].tools)).toBe(JSON.stringify(bodies[0].tools));
    // The clock moved on between the turns; the household block didn't.
    const then = jakartaNow(new Date(first)).now;
    expect(jakartaNow(new Date(Date.parse(first) + 2 * 60 * 1000)).now).not.toBe(then);
    expect(JSON.stringify(bodies[0].system)).toContain(then.replace(":", "."));
  });
});

function apiError(status: number, body: Record<string, unknown>) {
  return Anthropic.APIError.generate(status, { type: "error", error: body }, undefined, new Headers());
}

describe("classifyApiError", () => {
  it("tells the spend limit apart, by code, by type, or by its message", () => {
    expect(classifyApiError(apiError(429, { type: "rate_limit_error", message: "Limit", details: { error_code: "enforced_spend_limit_reached" } })).body)
      .toEqual({ kind: "failed", reason: "cap" });
    expect(classifyApiError(apiError(402, { type: "billing_error", message: "Billing" })).body).toEqual({ kind: "failed", reason: "cap" });
    expect(
      classifyApiError(apiError(400, { type: "invalid_request_error", message: "You have reached your specified workspace API usage limits." })).body,
    ).toEqual({ kind: "failed", reason: "cap" });
  });

  it("calls a bad key unavailable, rate limits and overload busy, a timeout slow", () => {
    expect(classifyApiError(apiError(401, { type: "authentication_error", message: "invalid x-api-key" })).body).toEqual({ kind: "refused", reason: "unavailable" });
    expect(classifyApiError(apiError(429, { type: "rate_limit_error", message: "Too many" })).body).toEqual({ kind: "refused", reason: "busy" });
    expect(classifyApiError(apiError(529, { type: "overloaded_error", message: "Overloaded" })).body).toEqual({ kind: "refused", reason: "busy" });
    expect(classifyApiError(new Anthropic.APIConnectionTimeoutError()).body).toEqual({ kind: "failed", reason: "slow" });
    expect(classifyApiError(apiError(500, { type: "api_error", message: "oops" })).body).toEqual({ kind: "failed", reason: "api" });
    expect(classifyApiError(new Error("x")).body).toEqual({ kind: "failed", reason: "api" });
  });

  it("never puts the household's words in the log line", () => {
    const { log } = classifyApiError(apiError(400, { type: "invalid_request_error", message: "Mbak Sari pel teras" }));
    expect(log).not.toContain("Sari");
  });
});

describe("kakakExamples", () => {
  it("uses the household's own first names, in the owner's language", () => {
    const en = kakakExamples({ locale: "en", staffNames: ["Ari Wibowo"], petNames: ["Mochi"] });
    expect(en.map((e) => e.kind)).toEqual(["chore", "shopping", "reminder", "pet", "food", "question"]);
    expect(en[5].text).toBe("What's the difference between a chore and a routine?");
    expect(en[0].text).toBe("Ari waters the plants every Monday at 8");
    expect(en[3].text).toBe("Feed Mochi at 7 am and 5 pm");
    const id = kakakExamples({ locale: "id", staffNames: ["Ari"], petNames: ["Mochi"] });
    expect(id[0].text).toBe("Ari siram tanaman setiap Senin jam 8");
    expect(id[2].text).toMatch(/^Ingatkan saya/);
    expect(id[5].text).toBe("Apa bedanya tugas dan rutinitas?");
  });

  it("keeps a pet's whole name, as the household block does", () => {
    expect(kakakExamples({ locale: "en", staffNames: [], petNames: ["Kopi  Susu"] })[3].text).toBe("Feed Kopi Susu at 7 am and 5 pm");
  });

  it("drops honorifics, as Kakak's household block does", () => {
    expect(kakakExamples({ locale: "id", staffNames: ["Bik Nah"], petNames: [] })[0].text).toBe("Nah siram tanaman setiap Senin jam 8");
    expect(kakakExamples({ locale: "en", staffNames: ["Mbak Sari Wulandari"], petNames: [] })[0].text).toBe("Sari waters the plants every Monday at 8");
  });

  it("has no names to invent: no staff means anyone, no pets means another chore", () => {
    const list = kakakExamples({ locale: "en", staffNames: [], petNames: [] });
    expect(list[0].text).toBe("Water the plants every Monday at 8");
    expect(list.map((e) => e.kind)).toContain("sheets");
    expect(list.map((e) => e.kind)).not.toContain("pet");
    expect(list.length).toBeGreaterThanOrEqual(4);
  });

  it("never shows emoji or English on the Indonesian list", () => {
    const id = kakakExamples({ locale: "id", staffNames: ["Ari"], petNames: [] });
    for (const e of id) {
      expect(e.text).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(e.text).not.toMatch(/\b(the|every|buy|remind)\b/i);
    }
  });
});

describe("every example works in practice mode", () => {
  for (const locale of ["en", "id"] as const) {
    it(`(${locale})`, async () => {
      const built = buildContext(rows, { today: "2026-11-11", now: "08:30", ownerLocale: locale, callerUserId: OWNER });
      const deps: TurnDeps = {
        client: practiceClient(built.household),
        model: "claude-opus-5-5",
        effort: "low",
        household: built.household,
        refs: built.refs,
        names: built.names,
        begin: async () => ({ ok: true, requestId: "00000000-0000-4000-8000-0000000000ab", callsLeft: 10 }),
        record: async () => undefined,
      };
      for (const example of kakakExamples({ locale, staffNames: ["Ari"], petNames: ["Mochi"] }).concat(
        kakakExamples({ locale, staffNames: ["Ari"], petNames: [] }),
      )) {
        const result = await runKakakTurn(deps, null, example.text);
        // A question (the food's date), a card, or, for the question about
        // Miamus, the guide's own answer; never "I can't do that".
        const expected = example.kind === "food" ? "question" : example.kind === "question" ? "message" : "suggestions";
        expect([example.kind, result.kind]).toEqual([example.kind, expected]);
        if (result.kind === "message") expect(result.text).toMatch(locale === "id" ? /Tugas adalah pekerjaan rumah/ : /A chore is a job in the house/);
        if (result.kind === "suggestions" && example.kind === "reminder") {
          expect(result.items[0]).toMatchObject({ kind: "chore", assignedTo: id(3), dueTime: "19:00" });
          expect((result.items[0] as { title: string }).title).toMatch(/^Bersihkan filter AC/);
        }
      }
    });
  }
});

describe("refineChore (the card's chips)", () => {
  const chore = {
    kind: "chore" as const,
    title: "Siram tanaman",
    titleEn: null,
    category: "cleaning" as const,
    assignedTo: null,
    assignToSelf: true,
    assigneeName: "Dewi",
    dueDate: "2026-11-16",
    dueTime: "08:00",
    recurrence: "weekly" as const,
    recurrenceUntil: "2026-12-31",
    requiresSupervision: false,
    locationId: null,
    roomName: null,
    newRoomName: null,
    newRoomFloorId: null,
    newRoomFloorName: null,
    notes: null,
    remindDaysBefore: null,
  };

  it("changes how often; one time drops the end date", () => {
    expect(refineChore(chore, { recurrence: "monthly" })).toMatchObject({ recurrence: "monthly", recurrenceUntil: "2026-12-31" });
    expect(refineChore(chore, { recurrence: "none" })).toMatchObject({ recurrence: "none", recurrenceUntil: null });
  });

  it("changes who, and the result is still saveable", () => {
    const sari = refineChore(chore, { assignee: { id: id(1), name: "Sari" } });
    expect(sari).toMatchObject({ assignedTo: id(1), assigneeName: "Sari", assignToSelf: false });
    expect(isSaveableSuggestion(sari)).toBe(true);
    const anyone = refineChore(sari, { assignee: null });
    expect(anyone).toMatchObject({ assignedTo: null, assigneeName: null, assignToSelf: false });
    expect(isSaveableSuggestion(anyone)).toBe(true);
  });

  it("tells Kakak what the chips changed, and that the owner's words win", () => {
    const daily = refineChore(refineChore(chore, { recurrence: "daily" }), { assignee: { id: id(1), name: "Sari" } });
    expect(refinementNote([daily])).toBe(
      "(Set on the card with one tap; the owner's words after this win: Siram tanaman: every day, for Sari, no reminder.)",
    );
    expect(refinementNote([refineChore(chore, { assignee: null })])).toMatch(/Siram tanaman: every monday, for anyone, no reminder\.\)$/);
    expect(refinementNote([refineChore(chore, { remindDaysBefore: 1 })])).toMatch(/, remind 1 day before\.\)$/);
    expect(refinementNote([refineChore(chore, { remindDaysBefore: 0 })])).toMatch(/, remind on the day\.\)$/);
    expect(refinementNote([refineChore(chore, { remindDaysBefore: 7 })])).toMatch(/, remind 1 week before\.\)$/);
    expect(refinementNote([{ kind: "food" }])).toBe("");
  });

  it("shrinks to the room left by the owner's words, whole parts only, and never cuts their text", () => {
    const daily = refineChore(chore, { recurrence: "daily" });
    const one = refinementNote([daily]);
    expect(refinementNote(Array(10).fill(daily)).length).toBeLessThanOrEqual(MAX_REFINEMENT_NOTE);
    expect(refinementNote([daily, daily], one.length)).toBe(one); // room for one part: one part
    expect(refinementNote([daily], one.length - 1)).toBe(""); // no room: no note
    // The sheet: a long correction stays whole and the note gives way.
    const own = "x".repeat(MAX_TYPED - 20);
    const note = refinementNote([daily], MAX_TYPED - own.length - 1);
    expect(note).toBe("");
    expect(splitRefinementNote(`${one} at 9 instead`)).toEqual({ note: one.slice(one.indexOf(": ") + 2, -2), words: "at 9 instead" });
    expect(splitRefinementNote("Tuesday instead")).toEqual({ note: null, words: "Tuesday instead" });
  });

  it("words each choice like the card does", () => {
    expect(REPEAT_CHOICES.map((r) => repeatLabel(r, "2026-11-16", "en"))).toEqual(["One time", "Every day", "Every Monday", "Monthly on the 16th"]);
    expect(REPEAT_CHOICES.map((r) => repeatLabel(r, "2026-11-16", "id"))).toEqual(["Sekali saja", "Setiap hari", "Setiap Senin", "Setiap tanggal 16"]);
  });
});

describe("practice mode reads the chips' note under the owner's words", () => {
  const built = buildContext(rows, { today: "2026-11-11", now: "08:30", ownerLocale: "en", callerUserId: OWNER });
  const deps: TurnDeps = {
    client: practiceClient(built.household),
    model: "claude-opus-5-5",
    effort: "low",
    household: built.household,
    refs: built.refs,
    names: built.names,
    begin: async () => ({ ok: true, requestId: "00000000-0000-4000-8000-0000000000ac", callsLeft: 10 }),
    record: async () => undefined,
  };
  const card = (result: TurnResult) => {
    if (result.kind !== "suggestions") throw new Error(result.kind);
    return result;
  };

  it("a typed 'Tuesday instead' beats the chips' 'every monday': one chore, on Tuesday", async () => {
    const first = card(await runKakakTurn(deps, null, "Ari mops the terrace every Monday at 9"));
    const chipped = refineChore(first.items[0] as Parameters<typeof refineChore>[0], { assignee: null });
    const second = card(await runKakakTurn(deps, first.history, `${refinementNote([chipped])} Tuesday instead`));
    expect(second.items).toHaveLength(1);
    expect(second.items[0]).toMatchObject({ kind: "chore", dueDate: "2026-11-17", dueTime: "09:00", assignedTo: null });
  });

  it("keeps the chips' 'one time' and 'for anyone' when the owner only changes the time", async () => {
    const first = card(await runKakakTurn(deps, null, "Ari mops the terrace every Monday at 9"));
    const chipped = refineChore(refineChore(first.items[0] as Parameters<typeof refineChore>[0], { recurrence: "none" }), { assignee: null });
    const second = card(await runKakakTurn(deps, first.history, `${refinementNote([chipped])} at 10 instead`));
    expect(second.items).toHaveLength(1);
    expect(second.items[0]).toMatchObject({ dueDate: "2026-11-16", dueTime: "10:00", recurrence: "none", assignedTo: null });
  });
});

describe("the Remind me chip is a refinement like the others", () => {
  const built = buildContext(rows, { today: "2026-11-11", now: "08:30", ownerLocale: "en", callerUserId: OWNER });
  const deps: TurnDeps = {
    client: practiceClient(built.household),
    model: "claude-opus-5-5",
    effort: "low",
    household: built.household,
    refs: built.refs,
    names: built.names,
    begin: async () => ({ ok: true, requestId: "00000000-0000-4000-8000-0000000000ae", callsLeft: 10 }),
    record: async () => undefined,
  };
  const card = (result: TurnResult) => {
    if (result.kind !== "suggestions") throw new Error(result.kind);
    return result;
  };
  type Chore = Parameters<typeof refineChore>[0];

  it("sets the reminder, and the result is still saveable", async () => {
    const first = card(await runKakakTurn(deps, null, "Ari mops the terrace every Monday at 9"));
    const three = refineChore(first.items[0] as Chore, { remindDaysBefore: 3 });
    expect(three.remindDaysBefore).toBe(3);
    expect(isSaveableSuggestion(three)).toBe(true);
  });

  it("a later typed change keeps the chip's reminder, and 'no reminder' turns off Kakak's", async () => {
    const first = card(await runKakakTurn(deps, null, "Ari mops the terrace every Monday at 9"));
    const chipped = refineChore(first.items[0] as Chore, { remindDaysBefore: 1 });
    const kept = card(await runKakakTurn(deps, first.history, `${refinementNote([chipped])} at 10 instead`));
    expect(kept.items[0]).toMatchObject({ dueTime: "10:00", remindDaysBefore: 1 });

    const asked = card(await runKakakTurn(deps, null, "Ari mops the terrace every Monday at 9, remind me the day before"));
    expect(asked.items[0]).toMatchObject({ remindDaysBefore: 1 });
    const off = refineChore(asked.items[0] as Chore, { remindDaysBefore: null });
    const after = card(await runKakakTurn(deps, asked.history, `${refinementNote([off])} at 10 instead`));
    expect(after.items[0]).toMatchObject({ dueTime: "10:00", remindDaysBefore: null });
  });
});
