import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { KakakHousehold } from "@/lib/kakak/household";
import { KAKAK_TOOLS } from "@/lib/kakak/tools";
import { validateToolCall } from "@/lib/kakak/validate";

// Anthropic's limits on strict tools in one request ("Structured outputs",
// https://platform.claude.com/docs/en/build-with-claude/structured-outputs):
// at most 20 strict tools, 24 optional parameters and 16 parameters with a
// union type (anyOf, or a type array such as ["string", "null"]) across all
// strict schemas together. Past them every request fails with a 400, and
// practice mode never calls the API, so only this test would notice.
const MAX_STRICT_TOOLS = 20;
const MAX_UNION_PARAMETERS = 16;
const MAX_OPTIONAL_PARAMETERS = 24;

type Schema = Record<string, unknown>;

function isUnion(schema: Schema): boolean {
  return Array.isArray(schema.anyOf) || Array.isArray(schema.type);
}

/** Every parameter in a schema, at any depth: object properties, array items, anyOf branches. */
function walk(schema: Schema, visit: (parameter: Schema, optional: boolean) => void) {
  const properties = (schema.properties ?? {}) as Record<string, Schema>;
  const required = new Set((schema.required ?? []) as string[]);
  for (const [name, property] of Object.entries(properties)) {
    visit(property, !required.has(name));
    walk(property, visit);
  }
  if (schema.items && typeof schema.items === "object") walk(schema.items as Schema, visit);
  for (const branch of (schema.anyOf ?? []) as Schema[]) walk(branch, visit);
}

function count(tools: typeof KAKAK_TOOLS) {
  const strict = tools.filter((tool) => tool.strict === true);
  let unions = 0;
  let optional = 0;
  for (const tool of strict) {
    walk(tool.input_schema as Schema, (parameter, isOptional) => {
      if (isUnion(parameter)) unions += 1;
      if (isOptional) optional += 1;
    });
  }
  return { strict: strict.length, unions, optional };
}

describe("Kakak's strict tools fit the API's limits", () => {
  it("stays within strict tools, union-typed and optional parameters", () => {
    const totals = count(KAKAK_TOOLS);
    expect(totals.strict).toBeLessThanOrEqual(MAX_STRICT_TOOLS);
    expect(totals.unions).toBeLessThanOrEqual(MAX_UNION_PARAMETERS);
    expect(totals.optional).toBeLessThanOrEqual(MAX_OPTIONAL_PARAMETERS);
  });

  it("keeps the strict set as it is: put_away_ingredient (Phase 176) isn't strict", () => {
    // 15 of 16 unions; a new strict tool with a nullable field would break every request.
    expect(count(KAKAK_TOOLS)).toEqual({ strict: 3, unions: 15, optional: 0 });
    expect(KAKAK_TOOLS.filter((tool) => tool.strict).map((tool) => tool.name)).toEqual([
      "create_chore",
      "add_pet_routine",
      "ask_question",
    ]);
  });

  it("counts unions the way the API does, nested ones included", () => {
    const totals = count([
      {
        name: "probe",
        strict: true,
        input_schema: {
          type: "object",
          required: ["a", "list"],
          properties: {
            a: { anyOf: [{ type: "string" }, { type: "null" }] },
            b: { type: ["string", "null"] },
            list: {
              type: "array",
              items: { type: "object", required: [], properties: { c: { anyOf: [{ type: "integer" }, { type: "null" }] } } },
            },
          },
        },
      },
      { name: "loose", input_schema: { type: "object", properties: { d: { anyOf: [{ type: "string" }, { type: "null" }] } } } },
    ]);
    expect(totals).toEqual({ strict: 1, unions: 3, optional: 2 });
  });
});

describe("validateToolCall checks the whole shape of the tools that aren't strict", () => {
  const household = JSON.parse(
    readFileSync(join(__dirname, "..", "kakak", "household.json"), "utf8"),
  ) as KakakHousehold;
  const food = {
    name: "Rendang",
    kept_in: "fridge",
    expires_on: null,
    expiry_unknown: true,
    expiry_is_guess: false,
    source: "gift",
    from_whom: "Tante Rina",
    return_container: true,
    notes: null,
  };
  const newNote = { item: null, status: "low", note: "Gula 2 kg", pet: null };

  const ingredient = { item: "I10", kept_in: "fridge", expiry: "set", expires_on: "2026-11-12", expiry_is_guess: false };

  it("accepts a well-formed call", () => {
    expect(validateToolCall(household, "put_away_ingredient", ingredient)).toEqual({ ok: true });
    expect(validateToolCall(household, "add_food", food)).toEqual({ ok: true });
    expect(validateToolCall(household, "add_to_shopping_list", { items: [newNote] })).toEqual({ ok: true });
  });

  it("rejects missing or unknown fields", () => {
    const { notes: _notes, ...noNotes } = food;
    void _notes;
    expect(validateToolCall(household, "add_food", noNotes).ok).toBe(false);
    expect(validateToolCall(household, "add_food", { ...food, colour: "red" }).ok).toBe(false);
    const { pet: _pet, ...noPet } = newNote;
    void _pet;
    expect(validateToolCall(household, "add_to_shopping_list", { items: [noPet] }).ok).toBe(false);
    expect(validateToolCall(household, "add_to_shopping_list", { items: [newNote], extra: 1 }).ok).toBe(false);
    expect(validateToolCall(household, "add_to_shopping_list", { items: ["Gula"] }).ok).toBe(false);
    const { expiry: _expiry, ...noExpiry } = ingredient;
    void _expiry;
    expect(validateToolCall(household, "put_away_ingredient", noExpiry).ok).toBe(false);
    expect(validateToolCall(household, "put_away_ingredient", { ...ingredient, notes: null }).ok).toBe(false);
  });

  it("rejects values outside the enums and wrong types", () => {
    expect(validateToolCall(household, "add_food", { ...food, kept_in: "garage" }).ok).toBe(false);
    expect(validateToolCall(household, "add_food", { ...food, source: "found" }).ok).toBe(false);
    expect(validateToolCall(household, "add_food", { ...food, source: null })).toEqual({ ok: true });
    expect(validateToolCall(household, "add_food", { ...food, return_container: "yes" }).ok).toBe(false);
    expect(validateToolCall(household, "add_food", { ...food, name: 5 }).ok).toBe(false);
    expect(validateToolCall(household, "add_to_shopping_list", { items: [{ ...newNote, status: "soon" }] }).ok).toBe(false);
    expect(validateToolCall(household, "add_to_shopping_list", { items: [{ ...newNote, note: 3 }] }).ok).toBe(false);
    expect(validateToolCall(household, "put_away_ingredient", { ...ingredient, kept_in: "garage" }).ok).toBe(false);
    expect(validateToolCall(household, "put_away_ingredient", { ...ingredient, expiry: "later" }).ok).toBe(false);
    expect(validateToolCall(household, "put_away_ingredient", { ...ingredient, expires_on: null }).ok).toBe(false);
    expect(validateToolCall(household, "put_away_ingredient", { ...ingredient, item: "I2" }).ok).toBe(false);
  });
});
