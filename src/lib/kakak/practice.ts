// Kakak's practice mode (owner, 2026-11-09: "can we test without actually
// using up API tokens?"). A stand-in for the Anthropic client: it answers
// messages.create() with scripted tool calls built from the owner's words
// and this household's own people, rooms, pets and shopping items, so the
// whole route — the history checks, validation, references, the cards,
// saving and Undo — runs exactly as for real, with nothing sent to the AI
// and no tokens used.
//
// It is not clever, and isn't meant to be: it recognises days, times, names,
// rooms, "buy", food words and pet meal/potty times, asks one question when
// the day or a food's date is missing, and otherwise suggests. What it
// tests is the app around Kakak, never Kakak's judgement — that needs the
// real eval (tests/kakak).
//
// Never on production: practiceAllowed() refuses when Vercel says so.
import type Anthropic from "@anthropic-ai/sdk";
import { addDays, weekdayIndex, type KakakHousehold } from "./household";

/** Practice mode is on only when asked for, and never on production. */
export function practiceAllowed(env: Record<string, string | undefined>): boolean {
  return env.KAKAK_PRACTICE === "true" && env.VERCEL_ENV !== "production";
}

type Locale = "en" | "id";

const WEEKDAYS: Record<string, number> = {
  minggu: 0, sunday: 0, sun: 0,
  senin: 1, monday: 1, mon: 1,
  selasa: 2, tuesday: 2, tue: 2,
  rabu: 3, wednesday: 3, wed: 3,
  kamis: 4, thursday: 4, thu: 4,
  jumat: 5, "jum'at": 5, friday: 5, fri: 5,
  sabtu: 6, saturday: 6, sat: 6,
};

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}':]+/u).filter(Boolean);

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text.toLowerCase());
}

/** The next date (today included) that falls on this weekday. */
function nextWeekday(today: string, weekday: number): string {
  const diff = (weekday - weekdayIndex(today) + 7) % 7;
  return addDays(today, diff);
}

interface When {
  days: string[];
  recurrence: "none" | "daily" | "weekly";
}

/** "every Monday and Thursday", "setiap hari", "besok", "today"… or nothing. */
function whenFrom(text: string, today: string): When | null {
  const t = text.toLowerCase();
  const every = /\b(every|each|setiap|tiap|tiap2)\b/.test(t);
  if (/\b(every ?day|daily|setiap hari|tiap hari|tiap2 hari)\b/.test(t)) return { days: [today], recurrence: "daily" };
  const weekdays = [...new Set(words(t).filter((w) => w in WEEKDAYS).map((w) => WEEKDAYS[w]))];
  if (weekdays.length) {
    return { days: weekdays.map((d) => nextWeekday(today, d)), recurrence: every ? "weekly" : "none" };
  }
  if (/\b(tomorrow|besok)\b/.test(t)) return { days: [addDays(today, 1)], recurrence: "none" };
  if (/\b(today|hari ini|sekarang|now)\b/.test(t)) return { days: [today], recurrence: "none" };
  return null;
}

/** "09:00", "9.30", "jam 9", "at 9", "9am", "3 pm". */
function timesFrom(text: string): string[] {
  const t = text.toLowerCase();
  const found: string[] = [];
  const pad = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  for (const match of t.matchAll(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/g)) {
    let h = Number(match[1]);
    const m = Number(match[2]);
    if (match[3] === "pm" && h < 12) h += 12;
    if (match[3] === "am" && h === 12) h = 0;
    if (h < 24 && m < 60) found.push(pad(h, m));
  }
  for (const match of t.matchAll(/\b(?:jam|pukul|at)\s+(\d{1,2})(?!\s*[:.]\d)\s*(am|pm|pagi|siang|sore|malam)?\b/g)) {
    let h = Number(match[1]);
    if ((match[2] === "pm" || match[2] === "sore" || match[2] === "malam") && h < 12) h += 12;
    if (h < 24) found.push(pad(h, 0));
  }
  for (const match of t.matchAll(/\b(\d{1,2})\s*(am|pm)\b/g)) {
    let h = Number(match[1]);
    if (match[2] === "pm" && h < 12) h += 12;
    if (match[2] === "am" && h === 12) h = 0;
    if (h < 24) found.push(pad(h, 0));
  }
  return [...new Set(found)];
}

/** The longest household name the text contains, case-insensitively. */
function findRef<T extends { ref: string; name: string }>(list: T[], text: string): T | null {
  const t = ` ${text.toLowerCase()} `;
  const hits = list.filter((entry) => {
    const name = entry.name.toLowerCase().trim();
    return name.length >= 2 && t.includes(name);
  });
  return hits.sort((a, b) => b.name.length - a.name.length)[0] ?? null;
}

/** A person by first name ("Ari" in "Ari pel teras"). */
function findPerson(household: KakakHousehold, text: string): string | null {
  const t = words(text);
  const people = [...household.people, household.owner];
  const hit = people.find((p) => t.includes(p.name.toLowerCase().split(/\s+/)[0]));
  return hit?.ref ?? null;
}

function clip(text: string, max: number): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
}

/** The chore's own words: the sentence without who, when and what time. */
function choreTitle(household: KakakHousehold, sentence: string): string {
  const people = [...household.people, household.owner].map((p) => p.name.toLowerCase().split(/\s+/)[0]);
  return sentence
    .replace(/\b(?:jam|pukul|at)\s+\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm|pagi|siang|sore|malam)?\b/gi, " ")
    .replace(/\b\d{1,2}[:.]\d{2}\s*(?:am|pm)?\b/gi, " ")
    .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, " ")
    .split(/\s+/)
    .filter((w) => {
      const lower = w.toLowerCase().replace(/[^\p{L}']/gu, "");
      return !(lower in WEEKDAYS) && !people.includes(lower) &&
        !["every", "each", "setiap", "tiap", "on", "hari", "and", "dan", "tomorrow", "besok", "today", "ini", "daily"].includes(lower);
    })
    .join(" ")
    .replace(/\s+([,.])/g, "$1")
    .trim();
}

// Common English chore words and their Indonesian (docs/indonesian-glossary.md),
// so a practice chore typed in English is still saved in Bahasa Indonesia:
// chore titles are what staff read (Codex, PR #31). Longest first.
const EN_TASKS: [RegExp, string, boolean][] = [
  // [pattern, Indonesian, takes an object ("Pel teras") or stands alone]
  [/\btakes? out the (?:trash|rubbish|garbage)\b/, "Buang sampah", false],
  [/\bwaters? the plants\b/, "Siram tanaman", false],
  [/\bchanges? the (?:bed )?sheets\b/, "Ganti seprai", false],
  [/\bchanges? the towels\b/, "Ganti handuk", false],
  [/\b(?:vacuums?|vacuuming)\b/, "Vakum", true],
  [/\b(?:mops?|mopping)\b/, "Pel", true],
  [/\b(?:sweeps?|sweeping)\b/, "Sapu", true],
  [/\b(?:dusts?|dusting)\b/, "Lap debu", true],
  [/\b(?:wipes?|wiping)\b/, "Lap", true],
  [/\b(?:cleans?|cleaning)\b/, "Bersihkan", true],
  [/\b(?:wash(?:es)?|washing)\b/, "Cuci", true],
  [/\b(?:irons?|ironing)\b/, "Setrika", true],
  [/\b(?:tid(?:y|ies)(?: up)?)\b/, "Rapikan", true],
  [/\b(?:fix(?:es)?|repairs?)\b/, "Perbaiki", true],
];
const EN_THINGS: [RegExp, string][] = [
  [/\bliving room\b/, "ruang tamu"],
  [/\bbathroom\b/, "kamar mandi"],
  [/\bbedroom\b/, "kamar tidur"],
  [/\bterrace\b/, "teras"],
  [/\bkitchen\b/, "dapur"],
  [/\bwindows?\b/, "jendela"],
  [/\bfloors?\b/, "lantai"],
  [/\bstairs\b/, "tangga"],
  [/\bgarage\b/, "garasi"],
  [/\bgarden\b/, "taman"],
  [/\bcar\b/, "mobil"],
  [/\bfridge\b/, "kulkas"],
  [/\b(?:carpet|rug)\b/, "karpet"],
  [/\bsofa\b/, "sofa"],
  [/\bdishes\b/, "piring"],
  [/\bclothes\b/, "baju"],
];
const ENGLISH = /\b(the|every|each|and|on|at|please|mops?|cleans?|vacuums?|sweeps?|wash(?:es)?|wipes?)\b/;

/**
 * An Indonesian title for a chore the owner typed in English: the task word
 * plus the room (as the household named it) or a known thing. Indonesian
 * text comes back as it is. Null when it's English the list doesn't know:
 * practice mode then says what it can do rather than save English.
 */
function indonesianTitle(sentence: string, roomName: string | null): string | null {
  const t = sentence.toLowerCase();
  if (!ENGLISH.test(t)) return sentence;
  const task = EN_TASKS.find(([pattern]) => pattern.test(t));
  if (!task) return null;
  const [, word, takesObject] = task;
  if (!takesObject) return word;
  const thing = roomName ?? EN_THINGS.find(([pattern]) => pattern.test(t))?.[1] ?? null;
  return thing ? `${word} ${thing}` : word;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type Intent = "shopping" | "food" | "pet" | "chore";

function intentOf(household: KakakHousehold, text: string): Intent {
  if (has(text, /\b(beli|belikan|buy|habis|abis|out of|running low|restock)\b/)) return "shopping";
  if (
    findRef(household.pets, text) &&
    has(text, /\b(makan|meal|meals|feed|feeding|sarapan|breakfast|dinner|pipis|pup|potty|walk|jalan)\b/) &&
    timesFrom(text).length
  ) {
    return "pet";
  }
  if (has(text, /\b(kulkas|fridge|freezer|kue|lauk|sisa|leftover|leftovers|dikasih|oleh-oleh|gift|cake|soup|sup|rendang|dari tante|from)\b/)) {
    return "food";
  }
  return "chore";
}

interface Conversation {
  /** Everything the owner said, oldest first. */
  said: string[];
  /** How many questions Kakak already asked. */
  asked: number;
  /** The last turn was the engine telling Kakak a suggestion was invalid. */
  corrected: boolean;
}

function readConversation(messages: Anthropic.MessageParam[]): Conversation {
  const said: string[] = [];
  let asked = 0;
  let corrected = false;
  messages.forEach((message, index) => {
    const last = index === messages.length - 1;
    if (message.role === "assistant") {
      if (Array.isArray(message.content) && message.content.some((b) => b.type === "tool_use" && b.name === "ask_question")) asked += 1;
      return;
    }
    if (typeof message.content === "string") {
      said.push(message.content);
      return;
    }
    for (const block of message.content) {
      if (block.type !== "tool_result") continue;
      const content = typeof block.content === "string" ? block.content : "";
      if (block.is_error) {
        if (last) corrected = true;
        continue;
      }
      const owner = content.replace(/^Not saved\. The owner says: /, "").replace(/\n\(That was the third question[\s\S]*$/, "");
      if (owner && owner !== "Not saved.") said.push(owner);
    }
  });
  return { said, asked, corrected };
}

let counter = 0;
function toolUse(name: string, input: Record<string, unknown>): Anthropic.ToolUseBlock {
  counter += 1;
  return { type: "tool_use", id: `toolu_practice_${Date.now().toString(36)}_${counter}`, name, input } as Anthropic.ToolUseBlock;
}

function message(model: string, content: Anthropic.ContentBlock[]): Anthropic.Message {
  return {
    id: `msg_practice_${Date.now().toString(36)}`,
    type: "message",
    role: "assistant",
    model,
    content,
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Message;
}

const text = (value: string) => ({ type: "text", text: value, citations: null }) as unknown as Anthropic.TextBlock;

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    here: "(Practice) Here's what I'd add:",
    whichDay: "Which day?",
    today: "Today",
    tomorrow: "Tomorrow",
    everyDay: "Every day",
    expiry: "When does it need eating by?",
    in3: "In 3 days",
    dunno: "Don't know",
    stuck: "(Practice) I can't set that up in practice mode. Try: \"Ari mops the terrace every Monday at 9\".",
  },
  id: {
    here: "(Latihan) Ini yang akan Kakak tambahkan:",
    whichDay: "Hari apa?",
    today: "Hari ini",
    tomorrow: "Besok",
    everyDay: "Setiap hari",
    expiry: "Harus dimakan kapan?",
    in3: "3 hari lagi",
    dunno: "Tidak tahu",
    stuck: "(Latihan) Ini belum bisa di mode latihan. Coba: \"Ari pel teras setiap Senin jam 9\".",
  },
};

function respond(household: KakakHousehold, model: string, messages: Anthropic.MessageParam[]): Anthropic.Message {
  const copy = COPY[household.ownerLocale];
  const { said, asked, corrected } = readConversation(messages);
  // The engine refused the last suggestion: don't loop, explain.
  if (corrected || said.length === 0) return message(model, [text(copy.stuck)]);
  const first = said[0];
  const all = said.join(" · ");
  const intent = intentOf(household, first);
  const canAsk = asked < 1;

  if (intent === "shopping") {
    const body = first.replace(/\b(tolong|please|beli|belikan|buy|habis|abis|out of|running low|restock|kita|we're|we are|are|is)\b/gi, " ");
    const parts = body
      .split(/,|\bdan\b|\band\b|&|\+/i)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0)
      .slice(0, 10);
    const items = (parts.length ? parts : [first]).map((part) => {
      const existing = findRef(household.items, part);
      return existing
        ? { item: existing.ref, status: "out", note: null, pet: null }
        : { item: null, status: "out", note: clip(capitalise(part), 120), pet: null };
    });
    return message(model, [text(copy.here), toolUse("add_to_shopping_list", { items })]);
  }

  if (intent === "pet") {
    const pet = findRef(household.pets, first)!;
    const potty = has(first, /\b(pipis|pup|potty|walk|jalan)\b/);
    const existing = new Set(potty ? pet.potty : pet.meals);
    const times = timesFrom(first).filter((t) => !existing.has(t)).slice(0, 12);
    if (times.length === 0) return message(model, [text(copy.stuck)]);
    return message(model, [
      text(copy.here),
      toolUse("add_pet_routine", { pet: pet.ref, kind: potty ? "potty" : "meal", times, label: null }),
    ]);
  }

  if (intent === "food") {
    const t = all.toLowerCase();
    const unknown = /\b(don't know|dont know|tidak tahu|nggak tahu|gak tahu|ga tau)\b/.test(t);
    let expires: string | null = null;
    if (/\b(in 3 days|3 hari)\b/.test(t)) expires = addDays(household.today, 3);
    else if (/\b(tomorrow|besok)\b/.test(t)) expires = addDays(household.today, 1);
    else if (/\b(today|hari ini)\b/.test(t)) expires = household.today;
    if (!expires && !unknown && canAsk) {
      return message(model, [
        toolUse("ask_question", {
          question: copy.expiry,
          answers: [copy.today, copy.tomorrow, copy.in3, copy.dunno],
          allow_typing: true,
        }),
      ]);
    }
    const from = /\b(?:dari|from)\s+([\p{L}][\p{L}\s.]{0,40}?)(?:[,.]|$|\s+(?:di|in|ada|is)\b)/iu.exec(first)?.[1]?.trim() ?? null;
    const name = clip(
      capitalise(first.replace(/\b(?:dari|from)\s+.*$/i, "").replace(/\b(di kulkas|in the fridge|di freezer|in the freezer)\b/gi, "")),
      80,
    ) || clip(first, 80);
    return message(model, [
      text(copy.here),
      toolUse("add_food", {
        name,
        kept_in: has(first, /\bfreezer\b/) ? "freezer" : has(first, /\b(lemari|pantry|cupboard)\b/) ? "pantry" : "fridge",
        expires_on: unknown ? null : (expires ?? addDays(household.today, 2)),
        expiry_unknown: unknown || false,
        expiry_is_guess: !unknown && !expires,
        source: from ? "gift" : null,
        from_whom: from ? clip(from, 60) : null,
        return_container: false,
        notes: null,
      }),
    ]);
  }

  // A chore: ask for the day once if it's missing.
  const when = whenFrom(all, household.today);
  if (!when && canAsk) {
    return message(model, [
      toolUse("ask_question", {
        question: copy.whichDay,
        answers: [copy.today, copy.tomorrow, copy.everyDay],
        allow_typing: true,
      }),
    ]);
  }
  const plan = when ?? { days: [household.today], recurrence: "none" as const };
  const time = timesFrom(all)[0] ?? null;
  const room = findRef(household.rooms, all);
  const typed = clip(capitalise(choreTitle(household, first)), 80) || clip(capitalise(first), 80);
  const indonesian = indonesianTitle(typed, room?.name ?? null);
  if (indonesian === null) return message(model, [text(copy.stuck)]);
  const title = clip(capitalise(indonesian), 80);
  const englishTyped = indonesian !== typed;
  const calls = plan.days.map((day) =>
    toolUse("create_chore", {
      title,
      // The owner's English, when they typed it; the title itself is Indonesian.
      title_en: englishTyped ? typed : household.ownerLocale === "en" ? title : null,
      category: has(first, /\b(perbaiki|benerin|repair|fix|servis|service)\b/) ? "maintenance" : "cleaning",
      assignee: findPerson(household, all),
      due_date: day,
      due_time: time,
      recurrence: plan.recurrence,
      recurrence_until: null,
      requires_supervision: false,
      room: room?.ref ?? null,
      new_room_name: null,
      notes: null,
    }),
  );
  return message(model, [text(copy.here), ...calls]);
}

/** The stand-in client: only messages.create, which is all the engine uses. */
export function practiceClient(household: KakakHousehold): Anthropic {
  return {
    messages: {
      create: async (params: { model: string; messages: Anthropic.MessageParam[] }) =>
        respond(household, params.model, params.messages),
    },
  } as unknown as Anthropic;
}
