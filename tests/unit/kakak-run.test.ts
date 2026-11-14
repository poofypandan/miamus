// The runner's conversation loop against a fake Anthropic API: checks the
// exact requests it sends (caching, strict tools, thinking, answers sent back
// as tool results) without a key or any cost.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { KakakHousehold } from "@/lib/kakak/household";
import { gradeCase } from "../kakak/grade";
import { makeClient, playConversation, type Variant } from "../kakak/run-core";
import type { KakakTestSet } from "../kakak/types";

const root = join(__dirname, "..", "kakak");
const household = JSON.parse(readFileSync(join(root, "household.json"), "utf8")) as KakakHousehold;
const testSet = JSON.parse(readFileSync(join(root, "test-set.json"), "utf8")) as KakakTestSet;
const k013 = testSet.cases.find((c) => c.id === "K013")!;

type Body = Record<string, unknown> & { messages: { role: string; content: unknown }[] };

function fakeApi(replies: { content: unknown[]; stop_reason: string }[]) {
  const bodies: Body[] = [];
  const fetch = async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body)) as Body);
    const reply = replies[bodies.length - 1];
    if (!reply) throw new Error("unexpected extra call");
    return new Response(
      JSON.stringify({
        id: `msg_${bodies.length}`,
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5-5",
        content: reply.content,
        stop_reason: reply.stop_reason,
        stop_sequence: null,
        usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 2500, cache_creation_input_tokens: 0 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new Anthropic({ apiKey: "test-key", authToken: null, baseURL: "http://fake.test", maxRetries: 0, fetch });
  return { client, bodies };
}

const thinking = { type: "thinking", thinking: "", signature: "sig-1" };
const question = {
  type: "tool_use",
  id: "toolu_q",
  name: "ask_question",
  input: { question: "Mbak Yanti atau Mbak Yati?", answers: ["Mbak Yanti", "Mbak Yati"], allow_typing: false },
};
const chore = (assignee: string) => ({
  type: "tool_use",
  id: `toolu_${assignee}`,
  name: "create_chore",
  input: {
    title: "Bereskan dapur",
    title_en: null,
    category: "cleaning",
    assignee,
    due_date: "2026-11-11",
    due_time: "16:00",
    recurrence: "none",
    recurrence_until: null,
    requires_supervision: false,
    room: "R2",
    new_room_name: null,
    notes: null,
  },
});

const sonnet: Variant = { model: "claude-sonnet-5-5", effort: "low", thinking: "adaptive" };

describe("makeClient", () => {
  it("always uses api.anthropic.com, whatever the shell says", () => {
    const saved = { key: process.env.ANTHROPIC_API_KEY, base: process.env.ANTHROPIC_BASE_URL };
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_BASE_URL = "http://elsewhere.test";
    try {
      expect(makeClient().baseURL).toBe("https://api.anthropic.com");
    } finally {
      if (saved.key === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = saved.key;
      if (saved.base === undefined) delete process.env.ANTHROPIC_BASE_URL;
      else process.env.ANTHROPIC_BASE_URL = saved.base;
    }
  });
});

describe("playConversation", () => {
  it("asks, sends the tapped answer back, and grades the suggestion", async () => {
    const { client, bodies } = fakeApi([
      { content: [thinking, question], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "Kakak siapkan untuk Mbak Yati." }, chore("S5")], stop_reason: "tool_use" },
    ]);
    const result = await playConversation(client, sonnet, household, k013, k013.sentence);

    expect(result.error).toBeUndefined();
    expect(result.turns.map((t) => t.kind)).toEqual(["question", "suggestions"]);
    expect(gradeCase(household, k013, result.turns)).toMatchObject({ pass: true, mustNever: [] });

    const first = bodies[0];
    expect(first.model).toBe("claude-sonnet-5-5");
    expect(first.thinking).toEqual({ type: "adaptive" });
    expect(first.output_config).toEqual({ effort: "low" });
    expect(first.tool_choice).toEqual({ type: "auto" });
    expect(first).not.toHaveProperty("temperature");
    const tools = first.tools as { name: string; strict: boolean }[];
    expect(tools.map((t) => t.name)).toEqual([
      "create_chore",
      "add_to_shopping_list",
      "add_pet_routine",
      "add_food",
      "put_away_ingredient",
      "set_staff_areas",
      "ask_question",
    ]);
    expect(tools.filter((t) => t.strict).map((t) => t.name)).toEqual(["create_chore", "add_pet_routine", "ask_question"]);
    const system = first.system as { text: string; cache_control?: unknown }[];
    // The route's own blocks: instructions, the guide in the owner's language, the household.
    expect(system).toHaveLength(3);
    expect(system.every((block) => block.cache_control)).toBe(true);
    expect(system[1].text).toContain("# Guide to Miamus");
    expect(system[1].text).toContain("Untuk apa Miamus");
    expect(system[2].text).toContain("Owner's chosen language: Bahasa Indonesia (id).");
    expect(first.messages).toEqual([{ role: "user", content: k013.sentence }]);

    // Second call: the assistant turn comes back unchanged (thinking block and
    // signature included), then the tapped answer as the question's result.
    const second = bodies[1];
    expect(second.messages[1]).toEqual({ role: "assistant", content: [thinking, question] });
    expect(second.messages[2]).toEqual({
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_q", content: "Mbak Yati" }],
    });
    expect(result.calls).toHaveLength(2);
    // Sonnet: 900 × $2 + 300 × $10 + 2,500 × $0.10 per million.
    expect(result.calls[0].costMicroUsd).toBe(5_050);
  });

  it("sends a failed check back once as an error, then accepts the fix", async () => {
    const { client, bodies } = fakeApi([
      { content: [chore("S9")], stop_reason: "tool_use" },
      { content: [chore("S5")], stop_reason: "tool_use" },
    ]);
    const result = await playConversation(client, sonnet, household, k013, k013.sentence);
    expect(result.calls[0].rejected?.[0]).toMatch(/assignee "S9" is not a reference/);
    const retry = bodies[1].messages[2] as { content: { is_error: boolean; content: string }[] };
    expect(retry.content[0].is_error).toBe(true);
    expect(retry.content[0].content).toMatch(/^Not accepted: /);
    expect(result.turns.map((t) => t.kind)).toEqual(["suggestions"]);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].beforeTurn).toBe(0);
    const grade = gradeCase(household, k013, result.turns, result.rejected);
    // Picking Yati without asking is still a must-never for this sentence…
    expect(grade.mustNever.join(" ")).toMatch(/without asking/);
    // …and so is the invented S9, even though the retry corrected it.
    expect(grade.mustNever.join(" ")).toMatch(/rejected reply before turn 1: invented reference assignee="S9"/);
  });

  it("gives up after a second failed check", async () => {
    const { client } = fakeApi([
      { content: [chore("S9")], stop_reason: "tool_use" },
      { content: [chore("S8")], stop_reason: "tool_use" },
    ]);
    const result = await playConversation(client, sonnet, household, k013, k013.sentence);
    expect(result.turns).toHaveLength(1);
    expect(result.turns[0].kind).toBe("invalid");
    expect(gradeCase(household, k013, result.turns).pass).toBe(false);
  });

  it("turns thinking off only on Sonnet, and tells an English owner's household so", async () => {
    const { client, bodies } = fakeApi([{ content: [{ type: "text", text: "Which one?" }], stop_reason: "end_turn" }]);
    const english = { ...k013, ownerLocale: "en" as const };
    await playConversation(client, { ...sonnet, thinking: "between_tools" }, household, english, "x");
    expect(bodies[0].thinking).toEqual({ type: "between_tools" });
    expect((bodies[0].system as { text: string }[])[1].text).toContain("What Miamus is for");
    expect((bodies[0].system as { text: string }[])[2].text).toContain("English (en)");
    await expect(
      playConversation(client, { model: "claude-opus-5-5", effort: "low", thinking: "between_tools" }, household, k013, "x"),
    ).rejects.toThrow(/only on Sonnet/);
  });

  it("sends a plain reply that can't be shown back once, as the route does, and grades the second", async () => {
    const about = testSet.cases.find((c) => c.id === "K131")!;
    const long = "Miamus keeps the running of your home in one place. ".repeat(10).trim();
    const good = "Miamus keeps your home's chores, pets and kitchen in one place, so you only hear about what didn't happen.";
    const { client, bodies } = fakeApi([
      { content: [{ type: "text", text: long }], stop_reason: "end_turn" },
      { content: [{ type: "text", text: good }], stop_reason: "end_turn" },
    ]);
    const result = await playConversation(client, sonnet, household, about, about.sentence);
    expect(result.calls).toHaveLength(2);
    expect(result.calls[0].rejected).toEqual(["reply not shown: too_long"]);
    expect(result.turns).toEqual([{ kind: "message", calls: [], text: good }]);
    expect(String(bodies[1].messages[2].content)).toMatch(/^\(From Miamus, not the owner:/);
    expect(gradeCase(household, about, result.turns, result.rejected).pass).toBe(true);
  });

  it("records a refusal as a failed turn", async () => {
    const { client } = fakeApi([{ content: [], stop_reason: "refusal" }]);
    const result = await playConversation(client, sonnet, household, k013, k013.sentence);
    expect(result.error).toBe("refusal");
    expect(gradeCase(household, k013, result.turns).pass).toBe(false);
  });
});
