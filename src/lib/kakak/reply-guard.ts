// What Kakak's own words must never show the owner. Anything the model writes
// outside a tool is shown word for word, and at low effort it sometimes writes
// notes to itself there, in English, with the household block's references:
// "Eggs I1 already in fridge; set expiry 2026-11-25." The route drops such
// text (engine.ts) and the eval counts it as a must-never (tests/kakak/grade.ts).
//
// Every tell but the language check is language-independent: nothing a person
// would say to the owner contains a reference, an ISO date or a tool's field
// name. The language check is deliberately rough and only fires on text that
// is clearly in the other language.

import type { KakakLocale } from "./household";
import { KAKAK_TOOLS, KAKAK_TOOL_NAMES } from "./tools";

/** The household block's references: M1 (the owner), S people, P pets, R rooms, I items (context.ts). */
export const REFERENCE = /\b[MSPRI]\d+\b/;
export const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;
/** Longer than Kakak's one or two short sentences: a note or an explanation. */
export const MAX_REPLY_CHARS = 200;

function propertyNames(schema: unknown, into: Set<string>): Set<string> {
  if (!schema || typeof schema !== "object") return into;
  const node = schema as { properties?: Record<string, unknown>; items?: unknown };
  for (const [name, child] of Object.entries(node.properties ?? {})) {
    into.add(name);
    propertyNames(child, into);
  }
  propertyNames(node.items, into);
  return into;
}

/**
 * The tools' names and their snake_case field names (kept_in, due_time…),
 * plus the two plain-word fields no one says to an owner. Ordinary words that
 * are also fields (title, note, room, days) are left out.
 */
export const INTERNAL_NAMES: readonly string[] = [
  ...KAKAK_TOOL_NAMES,
  ...[...KAKAK_TOOLS.reduce((all, tool) => propertyNames(tool.input_schema, all), new Set<string>())].filter((n) =>
    n.includes("_"),
  ),
  "assignee",
  "expiry",
];
const INTERNAL_NAME = new RegExp(`\\b(?:${[...new Set(INTERNAL_NAMES)].join("|")})\\b`, "i");

const ID_WORDS = new Set(
  "yang dan untuk ini itu tidak apa akan sudah bisa saya anda dengan ke di dari hari besok siapa mana atau tolong mau jam kapan tanggal ya boleh perlu ingin belum masih saja juga lagi".split(" "),
);
const EN_WORDS = new Set(
  "the and for this that what which will would you your with to is are can when who or please tomorrow day should do does it on at of a an".split(" "),
);

/** Rough language check: true when the text is clearly in the other language. */
export function looksLikeWrongLanguage(text: string, locale: KakakLocale): boolean {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  let id = 0;
  let en = 0;
  for (const word of words) {
    if (ID_WORDS.has(word)) id += 1;
    if (EN_WORDS.has(word)) en += 1;
  }
  return locale === "id" ? en >= 3 && en > id * 2 : id >= 3 && id > en * 2;
}

export type NoteTell = "reference" | "date" | "internal_name";
export type ReplyTell = NoteTell | "too_long" | "language";

/** Tells of a note to self, in any language: a reference, an ISO date, a tool or field name. */
export function noteTells(text: string): NoteTell[] {
  const tells: NoteTell[] = [];
  if (REFERENCE.test(text)) tells.push("reference");
  if (ISO_DATE.test(text)) tells.push("date");
  if (INTERNAL_NAME.test(text)) tells.push("internal_name");
  return tells;
}

/** Every reason the text must not reach the owner; empty when it may. */
export function replyTells(text: string, locale: KakakLocale): ReplyTell[] {
  const tells: ReplyTell[] = noteTells(text);
  if (text.length > MAX_REPLY_CHARS) tells.push("too_long");
  if (looksLikeWrongLanguage(text, locale)) tells.push("language");
  return tells;
}

/** Said instead of a plain reply that failed the guard. */
export function safeReplyLine(locale: KakakLocale): string {
  return locale === "id"
    ? "Maaf, Kakak belum paham. Bisa Anda katakan dengan cara lain?"
    : "Sorry, I didn't catch that. Could you say it another way?";
}

export interface GuardedText {
  text: string;
  /** Why the model's text was replaced; empty when it was kept (or there was none). */
  tells: ReplyTell[];
}

/**
 * The text the owner sees for a turn. A question's text is always dropped
 * (the question says it); a card's is kept only when it passes, otherwise
 * empty, and the sheet says "Ini yang akan Kakak tambahkan:"; a plain reply
 * that fails becomes the safe line.
 */
export function guardReplyText(kind: "question" | "suggestions" | "message", text: string, locale: KakakLocale): GuardedText {
  const trimmed = text.trim();
  if (kind === "question") return { text: "", tells: [] };
  if (!trimmed) return { text: "", tells: [] };
  const tells = replyTells(trimmed, locale);
  if (tells.length === 0) return { text: trimmed, tells };
  return { text: kind === "message" ? safeReplyLine(locale) : "", tells };
}
