// Kakak's practice mode (owner, 2026-11-09: "can we test without actually
// using up API tokens?"). A stand-in for the Anthropic client: it answers
// messages.create() with scripted tool calls built from the owner's words
// and this household's own people, rooms, pets and shopping items, so the
// whole route — the history checks, validation, references, the cards,
// saving and Undo — runs exactly as for real, with nothing sent to the AI
// and no tokens used.
//
// It is not clever, and isn't meant to be: it recognises days, times, names,
// rooms, "buy", food words, pet routines (meals, potty, walks, lights off…),
// a listed ingredient put in a place and a new one it can name in
// Indonesian (each with an amount, if given), asks one question when the
// day, a food's date or a thawed ingredient's date is missing, and otherwise
// suggests. A question about Miamus gets the guide's own entry, and thanks
// get a thank-you. What it
// tests is the app around Kakak, never Kakak's judgement — that needs the
// real eval (tests/kakak).
//
// Never on production: practiceAllowed() refuses when Vercel says so.
import type Anthropic from "@anthropic-ai/sdk";
import { GUIDE, GUIDE_PLACES, type GuideEntry } from "@/lib/guide";
import { addDays, weekdayIndex, type KakakHousehold } from "./household";
import { splitRefinementNote } from "./refine";
import { CORRECTION_PREFIX } from "./reply-guard";
import { routineKindInfo } from "@/lib/pet-routine-kinds";
import type { RoutineKind } from "@/types/database";
import type { PetRoutineToolKind } from "./tools";
import { newPetTimes } from "./validate";

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

/**
 * "09:00", "9.30", "9:00 pm", "jam 9", "at 9", "9am", "3 pm". Each pattern
 * uses up what it read, so "9:00 pm" is 21:00 only: the later patterns can't
 * read its "00 pm" again (Codex, PR #31). 12 am is midnight throughout.
 */
function timesFrom(text: string): string[] {
  let rest = text.toLowerCase();
  const found: string[] = [];
  const pad = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  const hour = (raw: string, suffix: string | undefined) => {
    let h = Number(raw);
    if ((suffix === "pm" || suffix === "sore") && h < 12) h += 12;
    // "jam 1 siang" is 13:00; "jam 11 siang" stays 11:00.
    if (suffix === "siang" && h <= 5) h += 12;
    if (suffix === "malam") h = h === 12 ? 0 : h < 12 ? h + 12 : h;
    if (suffix === "am" && h === 12) h = 0;
    return h;
  };
  const take = (pattern: RegExp, read: (match: RegExpMatchArray) => string | null) => {
    rest = rest.replace(pattern, (...args) => {
      const value = read(args.slice(0, -2) as unknown as RegExpMatchArray);
      if (value) found.push(value);
      return " ";
    });
  };
  take(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|pagi|siang|sore|malam)?\b/g, (m) => {
    const h = hour(m[1], m[3]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? pad(h, min) : null;
  });
  take(/\b(?:jam|pukul|at)\s+(\d{1,2})\s*(am|pm|pagi|siang|sore|malam)?\b/g, (m) => {
    const h = hour(m[1], m[2]);
    return h < 24 ? pad(h, 0) : null;
  });
  take(/\b(\d{1,2})\s*(am|pm)\b/g, (m) => {
    const h = hour(m[1], m[2]);
    return h < 24 ? pad(h, 0) : null;
  });
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

/**
 * Every pet the text names ("Mocha dan Matcha"), or every dog for "the dogs"
 * / "anjing-anjing" / "both dogs", in the household's order.
 */
function findPets(household: KakakHousehold, text: string): KakakHousehold["pets"] {
  if (has(text, /\b(the dogs|both dogs|anjing-anjing|kedua anjing|semua anjing)\b/)) {
    return household.pets.filter((pet) => pet.kind === "dog");
  }
  const t = ` ${text.toLowerCase()} `;
  return household.pets.filter((pet) => {
    const name = pet.name.toLowerCase().trim();
    return name.length >= 2 && t.includes(name);
  });
}

/** The routine a sentence is about; a meal unless it names another (Phase 173 PR B). */
function petRoutineKind(text: string): PetRoutineToolKind {
  if (has(text, /\b(lampu|lights?)\b/)) return "lights";
  if (has(text, /\b(jalan-jalan|jalan pagi|jalan sore|walks?)\b/)) return "walk";
  if (has(text, /\b(air minum|fresh water|water)\b/)) return "water";
  if (has(text, /\b(sikat gigi|teeth)\b/)) return "teeth";
  if (has(text, /\b(ajak main|play)\b/)) return "play";
  if (has(text, /\b(pipis|pup|potty|jalan)\b/)) return "potty";
  return "meal";
}

/**
 * Practice mode's one warm sentence for a routine card, as the real Kakak is
 * told to write it (prompt.ts): "(Latihan) Baik. Kakak siapkan: Syam matikan
 * lampu untuk Mocha dan Matcha setiap hari jam 21.30."
 */
function warmLine(
  household: KakakHousehold,
  { kind, pets, times, staff }: { kind: PetRoutineToolKind; pets: KakakHousehold["pets"]; times: string[]; staff: string | null },
): string {
  const id = household.ownerLocale === "id";
  const info = routineKindInfo(kind as RoutineKind);
  const who = staff ? household.people.find((p) => p.ref === staff)?.name ?? null : null;
  const names = pets.map((p) => p.name);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} ${id ? "dan" : "and"} ${names[names.length - 1]}` : names[0];
  const at = times.map((t) => (id ? t.replace(":", ".") : t)).join(", ");
  if (id) {
    const what = (info?.title ?? "Rutinitas").toLowerCase();
    return `(Latihan) Baik. Kakak siapkan: ${who ? `${who} ` : ""}${what} untuk ${list} setiap hari jam ${at}.`;
  }
  const what = (info?.en ?? "the routine").toLowerCase();
  return `(Practice) Of course. I'll set up ${what} for ${list} every day at ${at}${who ? `, done by ${who}` : ""}.`;
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

/**
 * "Remind me the day before" / "ingatkan sehari sebelumnya" (migrations/137):
 * the days of warning asked for, longest phrase first, or null. "Remind me"
 * with no lead time is on the day, as the real Kakak is told.
 */
const REMIND_LEADS: [RegExp, number][] = [
  [/\b(?:a|1|one) week before\b|\b(?:seminggu|1 minggu) sebelum(?:nya)?\b|\bh-7\b/i, 7],
  [/\b(?:3|three) days before\b|\b3 hari sebelum(?:nya)?\b|\bh-3\b/i, 3],
  [/\bthe day before\b|\b(?:1|one) day before\b|\b(?:sehari|1 hari) sebelum(?:nya)?\b|\bh-1\b/i, 1],
  [/\bon the day\b|\bpada harinya\b|\bremind me\b|\bingatkan saya\b/i, 0],
];

/** -1: the card chips' note turned the reminder off ("no reminder"). */
function remindFrom(text: string): number | null {
  if (/\bno reminder\b/i.test(text)) return -1;
  return REMIND_LEADS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

/** "Ingatkan saya …" / "Remind me to …": a chore for the owner (M1), as the real Kakak does. */
const REMIND_ME = /\b(?:ingatkan saya(?: untuk)?|remind me(?: to)?)\b/i;

/** The chore's own words: the sentence without who, when and what time. */
function choreTitle(household: KakakHousehold, sentence: string): string {
  const people = [...household.people, household.owner].map((p) => p.name.toLowerCase().split(/\s+/)[0]);
  return sentence
    .replace(/,?\s*(?:remind me|ingatkan saya)\s+(?:a week|one week|1 week|3 days|three days|the day|1 day|one day)\s+before\b/gi, " ")
    .replace(/,?\s*ingatkan saya\s+(?:seminggu|1 minggu|3 hari|sehari|1 hari)\s+sebelum(?:nya)?\b/gi, " ")
    .replace(/,?\s*(?:remind me|ingatkan saya)\s+(?:on the day|pada harinya)\b/gi, " ")
    .replace(REMIND_ME, " ")
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
  [/\b(?:ac|air ?con(?:ditioner)?)(?: filters?)?\b/, "filter AC"],
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
// Indonesian chore words: a title with one of these is already Indonesian.
const ID_TASK =
  /\b(pel|ngepel|mengepel|sapu|nyapu|menyapu|vakum|vacuum|sedot|lap|lap2|bersihkan|bersihin|cuci|nyuci|setrika|nyetrika|rapikan|rapihkan|beresin|beres|siram|buang|ganti|perbaiki|benerin|servis|sikat|kuras|jemur|angkat|lipat|masak|antar|jemput|bawa|isi|cek|periksa|tuang|semprot|potong)\b/;

/**
 * An Indonesian title for a chore the owner typed in English: the task word
 * plus the room (as the household named it) or a known thing. Text with an
 * Indonesian chore word comes back as it is. Null for anything else:
 * practice mode then says what it can do rather than save a title it can't
 * vouch for.
 */
function indonesianTitle(sentence: string, roomName: string | null): string | null {
  const t = sentence.toLowerCase();
  // English task words it knows come first, whatever else is in the sentence.
  const task = EN_TASKS.find(([pattern]) => pattern.test(t));
  if (!task) {
    // Otherwise only a sentence with an Indonesian chore word is used as is;
    // anything else is declined, so English never reaches a staff screen
    // (Codex, PR #31).
    return ID_TASK.test(t) ? sentence : null;
  }
  const [, word, takesObject] = task;
  if (!takesObject) return word;
  const thing = roomName ?? EN_THINGS.find(([pattern]) => pattern.test(t))?.[1] ?? null;
  return thing ? `${word} ${thing}` : word;
}

// Groceries and supplies: English to the Indonesian shops use, longest first
// (Codex, PR #31: shopping notes are shown on staff screens).
const EN_GROCERIES: [RegExp, string][] = [
  [/\bbrown rice\b/, "Beras merah"],
  [/\bchicken breasts?\b/, "Dada ayam"],
  [/\bdish(?:washing)? soap\b/, "Sabun cuci piring"],
  [/\btoilet (?:paper|rolls?)\b/, "Tisu toilet"],
  [/\bcooking oil\b/, "Minyak goreng"],
  [/\bdog food\b/, "Makanan anjing"],
  [/\bcat food\b/, "Makanan kucing"],
  [/\btrash bags?\b/, "Kantong sampah"],
  [/\bpee pads?\b/, "Pee pad"],
  [/\bdrinking water|water gallon|gallon\b/, "Air galon"],
  [/\btoothpaste\b/, "Pasta gigi"],
  [/\bgarlic\b/, "Bawang putih"],
  [/\bonions?\b/, "Bawang merah"],
  [/\bsugar\b/, "Gula"],
  [/\beggs?\b/, "Telur"],
  [/\brice\b/, "Beras"],
  [/\bmilk\b/, "Susu"],
  [/\bsalt\b/, "Garam"],
  [/\bbread\b/, "Roti"],
  [/\bcoffee\b/, "Kopi"],
  [/\btea\b/, "Teh"],
  [/\bflour\b/, "Tepung"],
  [/\bnoodles?\b/, "Mi"],
  [/\bchicken\b/, "Ayam"],
  [/\bfish\b/, "Ikan"],
  [/\bbeef|meat\b/, "Daging"],
  [/\bvegetables?\b/, "Sayur"],
  [/\bfruits?\b/, "Buah"],
  [/\bchil(?:l)?i(?:es)?\b/, "Cabai"],
  [/\bsoap\b/, "Sabun"],
  [/\bshampoo\b/, "Sampo"],
  [/\bdetergent|laundry soap\b/, "Deterjen"],
  [/\btissues?\b/, "Tisu"],
  [/\bgas\b/, "Gas LPG"],
];
const ID_GROCERY =
  /\b(gula|telur|beras|susu|garam|roti|kopi|teh|tepung|mi|mie|ayam|ikan|daging|sayur|buah|cabai|cabe|bawang|sabun|sampo|deterjen|pewangi|tisu|gas|galon|minyak|kecap|saus|tahu|tempe|makanan|pasir|pee|kantong|pasta|odol|sikat|plastik|baterai|lampu)\b/;

/**
 * A new shopping note in Indonesian: a known English item translated, with
 * its amount kept ("sugar 2 kg" → "Gula 2 kg"), or the owner's words when
 * they name a known Indonesian item. Null otherwise.
 */
function shoppingNote(part: string): string | null {
  const t = part.toLowerCase();
  const english = EN_GROCERIES.find(([pattern]) => pattern.test(t));
  if (english) {
    const amount = /(\d+(?:[.,]\d+)?\s*(?:kg|g|gr|l|liter|litre|ml|pcs|pack|packs|pak|box|kotak|botol|bottles?|rolls?|rol)?)\b/i.exec(t)?.[1]?.trim();
    return amount ? `${english[1]} ${amount}` : english[1];
  }
  return ID_GROCERY.test(t) ? capitalise(part) : null;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type Intent = "shopping" | "food" | "ingredient" | "new_ingredient" | "pet" | "chore" | "thanks" | "question";

type Place = "fridge" | "freezer" | "pantry" | "counter";

const PLACE_WORDS: [RegExp, Place][] = [
  [/\b(kulkas|fridge)\b/g, "fridge"],
  [/\bfreezer\b/g, "freezer"],
  [/\b(lemari|cupboard|pantry)\b/g, "pantry"],
  [/\b(meja|counter)\b/g, "counter"],
];

/** Where the text puts something: the last place named, after "dari freezer" / "out of the freezer". */
function placeFrom(text: string): Place | null {
  const t = text.toLowerCase().replace(/\b(?:dari|out of)(?: the)? (?:kulkas|fridge|freezer|lemari|cupboard|pantry|meja|counter)\b/g, " ");
  let best: { at: number; place: Place } | null = null;
  for (const [pattern, place] of PLACE_WORDS) {
    for (const match of t.matchAll(pattern)) if (!best || match.index > best.at) best = { at: match.index, place };
  }
  return best?.place ?? null;
}

/** A listed ingredient (Phase 176) the text names, while ingredients are on. */
function findIngredient(household: KakakHousehold, text: string): KakakHousehold["items"][number] | null {
  return household.ingredientsOn ? findRef(household.items.filter((item) => item.ingredient), text) : null;
}

// ---- Amounts (2026-11-14) -----------------------------------------------------

type Unit = "g" | "kg" | "ml" | "L" | "pcs" | "buah" | "butir" | "ikat" | "siung" | "lembar" | "batang" | "bungkus" | "sachet" | "pack" | "box" | "bottle" | "roll" | "tube";

const UNIT_WORDS: Record<string, Unit> = {
  kg: "kg", kilo: "kg", kilos: "kg", g: "g", gr: "g", gram: "g", grams: "g",
  l: "L", liter: "L", liters: "L", litre: "L", litres: "L", ml: "ml",
  pcs: "pcs", buah: "buah", butir: "butir", ikat: "ikat", siung: "siung", lembar: "lembar", batang: "batang",
  bungkus: "bungkus", sachet: "sachet", pack: "pack", packs: "pack", pak: "pack", box: "box", boxes: "box", kotak: "box",
  bottle: "bottle", bottles: "bottle", botol: "bottle", roll: "roll", rolls: "roll", rol: "roll", tube: "tube",
};
const AMOUNT = new RegExp(String.raw`(\d+(?:[.,]\d+)?)\s*(${Object.keys(UNIT_WORDS).sort((a, b) => b.length - a.length).join("|")})\b`, "i");

/** "2 kg", "1,5 liter", "30 butir": the number and its unit, or null. */
function amountFrom(text: string): { amount: number; unit: Unit } | null {
  const match = AMOUNT.exec(text);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  return amount > 0 ? { amount, unit: UNIT_WORDS[match[2].toLowerCase()] } : null;
}

/** "We have 3 kg", "tinggal 1 kg": what is there in all, not more coming in. */
function amountIsNow(text: string): boolean {
  return has(text, /\b(we have|there is|there are|left|tinggal|sisa|masih ada)\b/);
}

const ADDING = /\b(add|adding|tambah|tambahkan|put|taruh|simpan|masukkan|store|we have|ada)\b/;
const FRESH = /\b(ayam|ikan|daging|telur|sayur|buah|susu|tahu|tempe|cabai|cabe|bawang|tomat|udang|keju)\b/i;

/**
 * A new ingredient the text adds, named in Indonesian (2026-11-14): a known
 * English grocery translated ("brown rice" → "Beras merah"), or the owner's
 * own Indonesian words. Null for anything it can't vouch is Indonesian:
 * cooks read ingredient names.
 */
function newIngredientFrom(household: KakakHousehold, text: string): { name: string; nameEn: string | null } | null {
  if (!household.ingredientsOn || !has(text, ADDING)) return null;
  const t = text.toLowerCase();
  const english = EN_GROCERIES.find(([pattern]) => pattern.test(t));
  if (english) {
    const said = english[0].exec(t)?.[0] ?? "";
    return { name: english[1], nameEn: household.ownerLocale === "en" && said ? capitalise(said) : null };
  }
  if (!ID_GROCERY.test(t)) return null;
  const name = t
    .replace(AMOUNT, " ")
    .replace(/\b(tolong|please|terima kasih|makasih|thank you|thanks|tambah|tambahkan|taruh|simpan|masukkan|ada|ke|di|dalam|yang|ya)\b/g, " ")
    .replace(/\b(kulkas|freezer|lemari|meja)\b/g, " ")
    .replace(/[^\p{L}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return name ? { name: clip(capitalise(name), 60), nameEn: null } : null;
}

// ---- Questions about Miamus (Phase 180) ----------------------------------------

const THANKS = /^(?:ok(?:ay)?,?\s+)?(thanks|thank you|thank u|terima kasih|makasih|trims|hi|hello|halo|hai)\b[\s\p{L},!.]{0,24}$/iu;
const ASKING =
  /\?\s*$|^(what|how|where|why|who|which|can i|can you|could you tell|tell me about|explain|apa|apakah|bagaimana|gimana|cara|di mana|dimana|kenapa|mengapa|untuk apa|jelaskan)\b/i;

/** Words too common to tell one guide entry from another. */
const COMMON = new Set(
  "what how where why who which does this that with from your have about would describe tell explain like the are can you miamus apa bagaimana gimana cara yang untuk dengan dari anda saya bisa adalah itu ini seperti".split(" "),
);

/**
 * The guide entry a question is about: the one sharing most of its words,
 * by title first. "What is Miamus for?" is the entry about Miamus itself.
 */
function guideEntryFor(question: string, locale: Locale): GuideEntry | null {
  const asked = words(question).filter((w) => w.length >= 3 && !COMMON.has(w));
  if (/\b(miamus|miamis)\b/i.test(question) && asked.length <= 2) return GUIDE[0];
  let best: { entry: GuideEntry; score: number } | null = null;
  for (const entry of GUIDE) {
    const title = words(`${entry.title[locale]} ${entry.where ? GUIDE_PLACES[entry.where][locale] : ""}`);
    const body = words(entry.body[locale]);
    const near = (list: string[], w: string) => list.some((x) => x === w || (w.length >= 4 && (x.startsWith(w) || w.startsWith(x))));
    const score = asked.reduce((sum, w) => sum + (near(title, w) ? 3 : near(body, w) ? 1 : 0), 0);
    // One word from a body isn't enough to call it that entry's question.
    if (score >= 2 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry ?? null;
}

function intentOf(household: KakakHousehold, text: string): Intent {
  if (THANKS.test(text.trim())) return "thanks";
  // "Telur sudah di kulkas", "move the beef to the fridge": a listed
  // ingredient with a place or an amount, before "beli" makes it shopping.
  const listed = findIngredient(household, text);
  if (listed && (placeFrom(text) || has(text, /\b(dari|out of)( the)? freezer\b/) || (amountFrom(text) && has(text, ADDING)))) {
    return "ingredient";
  }
  // "Add 2 kg of brown rice into the pantry": one that isn't listed yet.
  if (!listed && newIngredientFrom(household, text) && (placeFrom(text) || amountFrom(text))) return "new_ingredient";
  // The same with a name it can't vouch is Indonesian ("2 kg of quinoa"):
  // it says it can't, rather than read it as a chore and ask which day.
  if (!listed && household.ingredientsOn && has(text, ADDING) && amountFrom(text) && !has(text, /\b(beli|belikan|buy)\b/)) {
    return "new_ingredient";
  }
  // A question, unless it is a request it knows how to set up.
  if (ASKING.test(text.trim()) && !has(text, /\b(beli|belikan|buy)\b/) && timesFrom(text).length === 0) return "question";
  if (has(text, /\b(beli|belikan|buy|habis|abis|out of|running low|restock)\b/)) return "shopping";
  if (
    findPets(household, text).length > 0 &&
    has(text, /\b(makan|meal|meals|feed|feeding|sarapan|breakfast|dinner|pipis|pup|potty|walk|jalan|lampu|lights?|air minum|water|sikat gigi|teeth|ajak main|play)\b/) &&
    timesFrom(text).length
  ) {
    return "pet";
  }
  // A chore word wins over a food word: "Bersihkan kulkas" is cleaning the
  // fridge, not food in it (Codex, PR #31).
  const t = text.toLowerCase();
  if (EN_TASKS.some(([pattern]) => pattern.test(t)) || ID_TASK.test(t)) return "chore";
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
  /** The owner typed a change after a suggestion card ("Ganti jam 10"). */
  changed: boolean;
}

/**
 * The owner's words, after the card chips' note when there is one: the note
 * goes in first, as if said earlier, so the newest-words-win reading below
 * lets "Tuesday instead" beat the chips' "every monday" (Codex, PR #68).
 */
function pushOwner(said: string[], text: string) {
  const { note, words } = splitRefinementNote(text);
  if (note) said.push(note);
  if (words) said.push(words);
}

function readConversation(messages: Anthropic.MessageParam[]): Conversation {
  const said: string[] = [];
  let asked = 0;
  let corrected = false;
  let changed = false;
  messages.forEach((message, index) => {
    const last = index === messages.length - 1;
    if (message.role === "assistant") {
      if (Array.isArray(message.content) && message.content.some((b) => b.type === "tool_use" && b.name === "ask_question")) asked += 1;
      return;
    }
    if (typeof message.content === "string") {
      // The route's note that a reply couldn't be shown isn't the owner's.
      if (!message.content.startsWith(CORRECTION_PREFIX)) pushOwner(said, message.content);
      return;
    }
    for (const block of message.content) {
      if (block.type !== "tool_result") continue;
      const content = typeof block.content === "string" ? block.content : "";
      if (block.is_error) {
        if (last) corrected = true;
        continue;
      }
      if (content.startsWith("Not saved. The owner says: ")) changed = true;
      const owner = content.replace(/^Not saved\. The owner says: /, "").replace(/\n\(That was the third question[\s\S]*$/, "");
      if (owner && owner !== "Not saved.") pushOwner(said, owner);
    }
  });
  return { said, asked, corrected, changed };
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
    expiryNow: "When does it expire now?",
    in3: "In 3 days",
    dunno: "Don't know",
    stuck: "(Practice) I can't set that up in practice mode. Try: \"Ari mops the terrace every Monday at 9\".",
    noChange: "(Practice) In practice mode I can only change a chore's day, time or person. Cancel and type the whole thing again.",
    already: "(Practice) That's already in your routines, at that time. Nothing to add.",
    welcome: "(Practice) You're welcome.",
    unsure: "(Practice) I'm not sure about that one. The people who make Miamus read what you send from Settings → Send feedback.",
  },
  id: {
    here: "(Latihan) Ini yang akan Kakak tambahkan:",
    whichDay: "Hari apa?",
    today: "Hari ini",
    tomorrow: "Besok",
    everyDay: "Setiap hari",
    expiry: "Harus dimakan kapan?",
    expiryNow: "Sekarang kapan kedaluwarsa?",
    in3: "3 hari lagi",
    dunno: "Tidak tahu",
    stuck: "(Latihan) Ini belum bisa di mode latihan. Coba: \"Ari pel teras setiap Senin jam 9\".",
    noChange: "(Latihan) Di mode latihan, Kakak hanya bisa mengubah hari, jam atau orang untuk tugas. Batalkan lalu ketik ulang semuanya.",
    already: "(Latihan) Itu sudah ada di rutinitas Anda, di jam itu. Tidak ada yang perlu ditambahkan.",
    welcome: "(Latihan) Sama-sama.",
    unsure: "(Latihan) Kakak belum yakin soal itu. Tim Miamus membaca yang Anda kirim lewat Pengaturan → Kirim masukan.",
  },
};

function respond(household: KakakHousehold, model: string, messages: Anthropic.MessageParam[]): Anthropic.Message {
  const copy = COPY[household.ownerLocale];
  const { said, asked, corrected, changed } = readConversation(messages);
  // The engine refused the last suggestion: don't loop, explain.
  if (corrected || said.length === 0) return message(model, [text(copy.stuck)]);
  const first = said[0];
  const all = said.join(" · ");
  const intent = intentOf(household, first);
  const practice = household.ownerLocale === "id" ? "(Latihan)" : "(Practice)";
  // Thanks, and questions about Miamus (Phase 180): a plain reply, no card.
  // A question is answered with the guide's own entry, word for word.
  if (intent === "thanks") return message(model, [text(copy.welcome)]);
  if (intent === "question") {
    const entry = guideEntryFor(first, household.ownerLocale);
    return message(model, [text(entry ? `${practice} ${entry.body[household.ownerLocale]}` : copy.unsure)]);
  }
  // Only chores take a typed change; anything else would come back unchanged
  // and look corrected (Codex, PR #31), so say so instead.
  if (changed && intent !== "chore") return message(model, [text(copy.noChange)]);
  // A chore's room is in its title ("Pel teras"), so a change of room would
  // leave the two disagreeing (Codex, PR #31): only day, time and person.
  if (changed) {
    const before = findRef(household.rooms, first);
    const after = findRef(household.rooms, said[said.length - 1]);
    if (after && after.ref !== before?.ref) return message(model, [text(copy.noChange)]);
  }
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
      if (existing) return { item: existing.ref, status: "out", note: null, pet: null };
      const note = shoppingNote(part);
      return note === null ? null : { item: null, status: "out", note: clip(note, 120), pet: null };
    });
    // A note it can't vouch is Indonesian is never saved: staff read them.
    if (items.some((item) => item === null)) return message(model, [text(copy.stuck)]);
    return message(model, [text(copy.here), toolUse("add_to_shopping_list", { items })]);
  }

  if (intent === "pet") {
    const pets = findPets(household, first);
    const kind = petRoutineKind(first);
    const asked = timesFrom(first).slice(0, 12);
    // Skips a time every named pet already has; the route drops the rest per pet.
    const times = asked.filter((time) => pets.some((pet) => newPetTimes(household, pet.ref, kind, [time]).length > 0));
    // Every named pet already has it at every time asked: say so, rather
    // than "can't do that in practice mode" (demo check P-21).
    if (times.length === 0 && pets.length > 0 && asked.length > 0) return message(model, [text(copy.already)]);
    if (times.length === 0) return message(model, [text(copy.stuck)]);
    const basic = kind === "meal" || kind === "potty";
    // A person, a reminder and an alert only on a routine (meals and potty are for anyone).
    const person = basic ? null : findPerson(household, first);
    const staff = person && person !== household.owner.ref ? person : null;
    const remind = !basic && has(first, /\b(ingatkan(?! saya)|remind (?!me)|reminder)\b/);
    const alert = !basic && has(first, /\b(kabari|kabarin|tell me|tell us|let me know)\b/);
    return message(model, [
      text(basic ? copy.here : warmLine(household, { kind, pets, times, staff })),
      toolUse("add_pet_routine", {
        pets: pets.map((pet) => pet.ref),
        kind,
        times,
        days: null,
        until: null,
        title: null,
        title_en: null,
        staff,
        note: null,
        remind_staff: remind,
        alert_owners: alert,
      }),
    ]);
  }

  if (intent === "new_ingredient") {
    const fresh = newIngredientFrom(household, first);
    if (!fresh) return message(model, [text(copy.stuck)]);
    const amount = amountFrom(first);
    const t = all.toLowerCase();
    let expires: string | null = null;
    if (/\b(in 3 days|3 hari)\b/.test(t)) expires = addDays(household.today, 3);
    else if (/\b(tomorrow|besok)\b/.test(t)) expires = addDays(household.today, 1);
    return message(model, [
      text(copy.here),
      toolUse("put_away_ingredient", {
        item: null,
        new_name: fresh.name,
        new_name_en: fresh.nameEn,
        shelf: FRESH.test(fresh.name) ? "fresh_food" : "pantry",
        kept_in: placeFrom(first),
        amount: amount?.amount ?? null,
        unit: amount?.unit ?? null,
        amount_is: "bought",
        expiry: expires ? "set" : "keep",
        expires_on: expires,
        expiry_is_guess: false,
      }),
    ]);
  }

  if (intent === "ingredient") {
    const item = findIngredient(household, first);
    if (!item) return message(model, [text(copy.stuck)]);
    const place = placeFrom(first);
    const amount = amountFrom(first);
    const t = all.toLowerCase();
    const unknown = /\b(don't know|dont know|tidak tahu|nggak tahu|gak tahu|ga tau)\b/.test(t);
    let expires: string | null = null;
    if (/\b(in 3 days|3 hari)\b/.test(t)) expires = addDays(household.today, 3);
    else if (/\b(tomorrow|besok)\b/.test(t)) expires = addDays(household.today, 1);
    else if (/\b(today|hari ini)\b/.test(t)) expires = household.today;
    // Out of the freezer with no date: ask once (Kakak's instructions, Ingredients).
    const thawed = (item.keptIn === "freezer" || has(first, /\b(dari|out of)( the)? freezer\b/)) && place !== "freezer";
    if (thawed && !expires && !unknown && canAsk) {
      return message(model, [
        toolUse("ask_question", {
          question: copy.expiryNow,
          answers: [copy.tomorrow, copy.in3, copy.dunno],
          allow_typing: true,
        }),
      ]);
    }
    return message(model, [
      text(copy.here),
      toolUse("put_away_ingredient", {
        item: item.ref,
        new_name: null,
        new_name_en: null,
        shelf: null,
        kept_in: place,
        amount: amount?.amount ?? null,
        unit: amount?.unit ?? null,
        amount_is: amount && amountIsNow(first) ? "now" : "bought",
        expiry: expires ? "set" : "keep",
        expires_on: expires,
        expiry_is_guess: false,
      }),
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
  // The newest words win: a correction ("Ganti jam 10") or an answer
  // replaces what the first sentence said (Codex, PR #31).
  const latest = <T,>(read: (words: string) => T | null): T | null => {
    for (let i = said.length - 1; i >= 0; i--) {
      const value = read(said[i]);
      if (value !== null) return value;
    }
    return null;
  };
  // The card chips' note says "one time" or "for anyone" (lib/kakak/refine.ts):
  // those count too, unless the owner's newer words name a day or a person.
  const ONE_TIME = /\bone time\b/i;
  const ANYONE = /\bfor anyone\b/i;
  const firstDay = (when ?? { days: [household.today] }).days[0];
  const plan =
    latest((w) => whenFrom(w, household.today) ?? (ONE_TIME.test(w) ? { days: [firstDay], recurrence: "none" as const } : null)) ??
    when ?? { days: [household.today], recurrence: "none" as const };
  const remind = latest((w) => remindFrom(w));
  const person = latest((w) => findPerson(household, w) ?? (ANYONE.test(w) ? "anyone" : null));
  const time = latest((w) => timesFrom(w)[0] ?? null);
  const room = latest((w) => findRef(household.rooms, w));
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
      assignee: person === "anyone" ? null : (person ?? (REMIND_ME.test(first) ? household.owner.ref : null)),
      due_date: day,
      due_time: time,
      recurrence: plan.recurrence,
      recurrence_until: null,
      requires_supervision: false,
      room: room?.ref ?? null,
      new_room_name: null,
      new_room_floor: null,
      notes: null,
      remind_days_before: remind === -1 ? null : remind,
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
