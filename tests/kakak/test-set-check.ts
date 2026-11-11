// Checks the test set itself before any money is spent: ids, paths, field
// names that exist in the tool schemas, references that exist in the pretend
// household, and real dates. Pure; run by `--check` and by the unit tests.

import { householdRefs, type KakakHousehold } from "@/lib/kakak/household";
import { KAKAK_TOOLS, TOOL_WEEKDAYS } from "@/lib/kakak/tools";
import { isDay, isTime } from "@/lib/kakak/validate";
import type { ExpectedShoppingItem, FieldMatcher, KakakTestSet } from "./types";

const REF_FIELDS: Record<string, "people" | "pets" | "rooms" | "items"> = {
  assignee: "people",
  room: "rooms",
  pet: "pets",
  item: "items",
  staff: "people",
};

/** Fields whose sameSet lists references (add_pet_routine's pets, Phase 173 PR B). */
const REF_SET_FIELDS: Record<string, "people" | "pets" | "rooms" | "items"> = { pets: "pets" };

const DATE_FIELDS = new Set(["due_date", "recurrence_until", "expires_on", "until"]);
const TIME_FIELDS = new Set(["due_time"]);

function schemaFields(tool: string): Set<string> {
  const definition = KAKAK_TOOLS.find((t) => "name" in t && t.name === tool);
  if (!definition || !("input_schema" in definition)) return new Set();
  return new Set(Object.keys((definition.input_schema.properties ?? {}) as Record<string, unknown>));
}

function literals(matcher: FieldMatcher): unknown[] {
  if (matcher === null || typeof matcher !== "object") return [matcher];
  if ("anyOf" in matcher) return matcher.anyOf;
  return [];
}

export function checkTestSet(
  household: KakakHousehold,
  testSet: KakakTestSet,
  idPattern: RegExp = /^K\d{3}$/,
): string[] {
  const problems: string[] = [];
  const refs = householdRefs(household);
  const seen = new Set<string>();
  if (testSet.version !== 1) problems.push("version must be 1");

  const checkValue = (where: string, field: string, matcher: FieldMatcher) => {
    const kind = REF_FIELDS[field];
    for (const value of literals(matcher)) {
      if (kind && value !== null && !refs[kind].has(String(value))) {
        problems.push(`${where}: ${field} ${JSON.stringify(value)} is not in the household`);
      }
      if (DATE_FIELDS.has(field) && value !== null && !isDay(value)) {
        problems.push(`${where}: ${field} ${JSON.stringify(value)} is not a real date`);
      }
      if (TIME_FIELDS.has(field) && value !== null && !isTime(value)) {
        problems.push(`${where}: ${field} ${JSON.stringify(value)} is not HH:mm`);
      }
    }
    if (matcher !== null && typeof matcher === "object") {
      if ("dateBetween" in matcher) {
        const [from, to] = matcher.dateBetween;
        if (!isDay(from) || !isDay(to) || from > to) problems.push(`${where}: ${field} has a bad date range`);
      }
      if ("timeBetween" in matcher) {
        const [from, to] = matcher.timeBetween;
        if (!isTime(from) || !isTime(to) || from > to) problems.push(`${where}: ${field} has a bad time range`);
      }
      if ("sameSet" in matcher) {
        const setKind = REF_SET_FIELDS[field];
        if (setKind) {
          for (const value of matcher.sameSet) {
            if (!refs[setKind].has(value)) problems.push(`${where}: ${field} ${JSON.stringify(value)} is not in the household`);
          }
        } else if (field === "days") {
          if (!matcher.sameSet.every((d) => (TOOL_WEEKDAYS as readonly string[]).includes(d))) {
            problems.push(`${where}: days has a day that is not mon … sun`);
          }
        } else if (!matcher.sameSet.every(isTime)) {
          problems.push(`${where}: ${field} has a time that is not HH:mm`);
        }
      }
      if ("textHas" in matcher && (matcher.textHas.length === 0 || matcher.textHas.some((g) => g.length === 0))) {
        problems.push(`${where}: ${field} has an empty textHas group`);
      }
    }
  };

  for (const kakakCase of testSet.cases) {
    const where = kakakCase.id;
    if (!idPattern.test(kakakCase.id)) problems.push(`${where}: id must match ${idPattern}`);
    if (seen.has(kakakCase.id)) problems.push(`${where}: duplicate id`);
    seen.add(kakakCase.id);
    if (!kakakCase.sentence?.trim()) problems.push(`${where}: empty sentence`);
    if (!["id", "en"].includes(kakakCase.ownerLocale)) problems.push(`${where}: ownerLocale must be id or en`);
    if (!Array.isArray(kakakCase.paths) || kakakCase.paths.length === 0) {
      problems.push(`${where}: needs at least one path`);
      continue;
    }
    kakakCase.paths.forEach((path, p) => {
      if (path.length === 0) problems.push(`${where} path ${p + 1}: empty`);
      if (path.filter((t) => t.kind === "question").length > 3) problems.push(`${where} path ${p + 1}: more than 3 questions`);
      path.forEach((turn, t) => {
        const at = `${where} path ${p + 1} turn ${t + 1}`;
        if (turn.kind === "question") {
          if (!turn.reply?.trim()) problems.push(`${at}: a question needs a scripted reply`);
          if (t === path.length - 1) problems.push(`${at}: a path can't end with a question`);
          return;
        }
        if (t !== path.length - 1) problems.push(`${at}: only the last turn may be a ${turn.kind}`);
        if (turn.kind !== "suggestions") return;
        if (turn.calls.length === 0) problems.push(`${at}: suggestions need at least one call`);
        for (const call of turn.calls) {
          const fields = schemaFields(call.tool);
          if (fields.size === 0) {
            problems.push(`${at}: unknown tool ${call.tool}`);
            continue;
          }
          for (const [field, matcher] of Object.entries(call.fields)) {
            if (!fields.has(field)) problems.push(`${at}: ${call.tool} has no field ${field}`);
            if (field === "items" && matcher && typeof matcher === "object" && "items" in matcher) {
              matcher.items.forEach((item: ExpectedShoppingItem, i: number) => {
                checkValue(`${at} item ${i + 1}`, "item", item.item);
                if (item.pet !== undefined) checkValue(`${at} item ${i + 1}`, "pet", item.pet);
              });
            } else {
              checkValue(at, field, matcher);
            }
          }
          if (call.tool === "create_chore") {
            for (const required of ["title", "assignee", "due_date"]) {
              if (!(required in call.fields)) problems.push(`${at}: create_chore must list ${required}`);
            }
          }
        }
      });
    });
  }
  return problems;
}
