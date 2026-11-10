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

    // Ten minutes ago (runKakakTurn checks against the real clock).
    const first = new Date(Date.now() - 10 * 60 * 1000).toISOString();
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
    expect(en.map((e) => e.kind)).toEqual(["chore", "shopping", "reminder", "pet", "food"]);
    expect(en[0].text).toBe("Ari waters the plants every Monday at 8");
    expect(en[3].text).toBe("Feed Mochi at 7 am and 5 pm");
    const id = kakakExamples({ locale: "id", staffNames: ["Ari"], petNames: ["Mochi"] });
    expect(id[0].text).toBe("Ari siram tanaman setiap Senin jam 8");
    expect(id[2].text).toMatch(/^Ingatkan saya/);
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
        // A question (the food's date) or a card; never "I can't do that".
        expect([example.kind, result.kind]).toEqual([example.kind, example.kind === "food" ? "question" : "suggestions"]);
        if (result.kind === "suggestions" && example.kind === "reminder") {
          expect(result.items[0]).toMatchObject({ kind: "chore", assignedTo: id(3), dueTime: "19:00" });
          expect((result.items[0] as { title: string }).title).toMatch(/^Bersihkan filter AC/);
        }
      }
    });
  }
});
