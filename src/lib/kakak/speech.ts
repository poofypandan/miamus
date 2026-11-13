// Kakak's replies, rewritten for the ear before the phone's voice reads them
// (the "Read replies aloud" switch, src/components/kakak/kakak-voice.tsx).
// Her replies are written for the eye: "21.30", "·", "→", "HP",
// "Pengaturan → Staf". Any voice reads those like a machine, so this turns
// them into what a person would say: "jam setengah sepuluh malam",
// "Pengaturan, lalu Staf", "ha-pe". Pure, and unit-tested in
// tests/unit/kakak-speech.test.ts. The words on screen never change.

export type SpeechLocale = "en" | "id";

/** A touch slower than the voice's default: calmer, easier to follow. */
export const SPEECH_RATE = 0.93;
/** The breath between two sentences. */
export const SENTENCE_PAUSE_MS = 300;
/** A slightly longer breath after a short opener ("Baik.", "Done."). */
export const OPENER_PAUSE_MS = 500;
/** At most this many sentences are read, besides a short opener. */
export const MAX_SENTENCES = 2;

// ---- Numbers ---------------------------------------------------------------

const ID_ONES = ["nol", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];

/** 0–99 in Indonesian words. */
function idNumber(n: number): string {
  if (n < 10) return ID_ONES[n];
  if (n === 10) return "sepuluh";
  if (n === 11) return "sebelas";
  if (n < 20) return `${ID_ONES[n - 10]} belas`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const t = tens === 1 ? "sepuluh" : `${ID_ONES[tens]} puluh`;
  return ones ? `${t} ${ID_ONES[ones]}` : t;
}

const EN_SMALL = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty"];

/** 0–59 in English words. */
function enNumber(n: number): string {
  if (n < 20) return EN_SMALL[n];
  const ones = n % 10;
  return ones ? `${EN_TENS[Math.floor(n / 10)]}-${EN_SMALL[ones]}` : EN_TENS[Math.floor(n / 10)];
}

/** The hour on a 12-hour clock: 0 and 12 are twelve. */
const twelve = (hour: number) => hour % 12 || 12;

// ---- Times -----------------------------------------------------------------

/** The part of the day an Indonesian says after the hour. */
function idPartOfDay(hour: number): string {
  if (hour >= 18 || hour < 3) return "malam";
  if (hour < 11) return "pagi";
  if (hour < 15) return "siang";
  return "sore";
}

/**
 * A time as Indonesians say it: 21.30 is "jam setengah sepuluh malam"
 * (setengah X is half an hour before X), 07.15 "jam tujuh lewat
 * seperempat pagi", 09.45 "jam sepuluh kurang seperempat pagi". `part`
 * keeps the part of the day the reply itself named ("jam 6 sore").
 */
export function idTime(hour: number, minute: number, part: string = idPartOfDay(hour)): string {
  const now = idNumber(twelve(hour));
  const next = idNumber(twelve(hour + 1));
  if (minute === 0) return `jam ${now} ${part}`;
  if (minute === 30) return `jam setengah ${next} ${part}`;
  if (minute === 15) return `jam ${now} lewat seperempat ${part}`;
  if (minute === 45) return `jam ${next} kurang seperempat ${part}`;
  if (minute >= 50) return `jam ${next} kurang ${idNumber(60 - minute)} ${part}`;
  return `jam ${now} lewat ${idNumber(minute)} ${part}`;
}

/**
 * A twelve-hour time with the part of the day written after it, on the
 * 24-hour clock: "7.30 malam" is 19.30, "1.00 siang" 13.00, "12.00 malam"
 * midnight. A 24-hour time (13 and up) is already unambiguous.
 */
function idHour(hour: number, part: string | undefined): number {
  if (!part || hour > 12) return hour;
  switch (part) {
    case "pagi":
      return hour === 12 ? 0 : hour;
    case "siang":
      return hour >= 1 && hour <= 5 ? hour + 12 : hour;
    case "sore":
      return hour < 12 ? hour + 12 : hour;
    case "malam":
      if (hour === 12) return 0;
      return hour >= 5 ? hour + 12 : hour; // "jam 1 malam" is 01.00
    default:
      return hour;
  }
}

function enPartOfDay(hour: number): string {
  if (hour < 5) return "at night";
  if (hour < 12) return "in the morning";
  if (hour < 18) return "in the afternoon";
  return "in the evening";
}

/** A time as English speakers say it: 21:30 is "nine thirty in the evening". */
export function enTime(hour: number, minute: number): string {
  if (minute === 0 && hour === 12) return "noon";
  if (minute === 0 && hour === 0) return "midnight";
  const mins = minute === 0 ? "" : minute < 10 ? ` oh ${enNumber(minute)}` : ` ${enNumber(minute)}`;
  return `${enNumber(twelve(hour))}${mins} ${enPartOfDay(hour)}`;
}

// A clock time, not part of a bigger number or an amount: "21.30" but not
// "1.250.000", "2.5", "13/11.30", "Rp 12.50" or "12.50 kg".
const NOT_AFTER = String.raw`(?<![\d.,:/$])(?<!(?:Rp|IDR|USD|SGD)\s?)`;
const NOT_BEFORE = String.raw`(?![\d]|[.:,]\d)`;
const NOT_AMOUNT = String.raw`(?!\s*(?:%|(?:kg|kilos?|g|gr|grams?|l|lt|liters?|litres?|ml|cc|mm|cm|m|km|pcs|lbs?|oz|cups?|units?|buah|butir|bungkus|ikat|porsi|rupiah|dollars?)(?![A-Za-z])))`;
const ID_TIME = new RegExp(
  String.raw`(?:\b(?:[Jj]am|[Pp]ukul)\s+)?${NOT_AFTER}([01]?\d|2[0-3])[.:]([0-5]\d)${NOT_BEFORE}${NOT_AMOUNT}(?:\s+(pagi|siang|sore|malam)\b)?(?:\s+WIB\b)?`,
  "g"
);
// English: 9:30 or 21:30, or a dotted 21.30 with a two-digit hour; an
// optional am/pm sets the half of the day.
const EN_TIME = new RegExp(
  String.raw`(?:\b(at|by|until|till|from|before|after|around|between)\s+)?${NOT_AFTER}(?:([01]?\d|2[0-3]):([0-5]\d)|([01]\d|2[0-3])\.([0-5]\d))${NOT_BEFORE}${NOT_AMOUNT}(?:\s?([AaPp])\.?[Mm]\.?(?![A-Za-z]))?`,
  "g"
);

function speakTimes(text: string, locale: SpeechLocale): string {
  // A range, "07.00–09.00": "from one until the other".
  const until = locale === "id" ? "sampai" : "until";
  const ranged = text.replace(/(\d{1,2}[.:]\d{2})\s*[–—-]\s*(?=\d{1,2}[.:]\d{2})/g, `$1 ${until} `);
  if (locale === "id") {
    // Indonesian writes decimals with a comma, so a dotted h.mm is a time.
    return ranged.replace(ID_TIME, (_, h: string, m: string, part?: string) =>
      idTime(idHour(Number(h), part), Number(m), part)
    );
  }
  return ranged.replace(
    EN_TIME,
    (match: string, pre?: string, h1?: string, m1?: string, h2?: string, m2?: string, half?: string) => {
      let hour = Number(h1 ?? h2);
      const minute = Number(m1 ?? m2);
      // In English a dotted "12.50" is more often an amount than a time: read
      // it as a time only when something says so (a leading zero, a 24-hour
      // hour, am/pm, or "at", "until"... before it).
      if (h2 !== undefined && !half && !pre && !h2.startsWith("0") && hour < 13) return match;
      if (half) {
        if (hour < 1 || hour > 12) return match;
        hour = (hour % 12) + (half.toLowerCase() === "p" ? 12 : 0);
      }
      const said = enTime(hour, minute);
      return pre ? `${pre} ${said}` : said;
    }
  );
}

// ---- Dates -----------------------------------------------------------------

const MONTHS: Record<SpeechLocale, string[]> = {
  id: ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

// Words that say the next "d/m" is a date, not a fraction.
const DATE_WORD = /\b(?:tanggal|tgl\.?|sejak|mulai|sampai|hingga|on|from|until|since|starting|starts)\s+$/i;
const DATE = new RegExp(String.raw`(?<![\d.,:/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])${NOT_AMOUNT}`, "g");

/**
 * "13/11" (day, month, as Miamus writes them) as "13 November". An amount
 * ("1/2 kg") is never a date, and a bare small fraction ("1/2", "3/4") is
 * read as a date only when a word before it says so ("tanggal 1/2").
 */
function speakDates(text: string, locale: SpeechLocale): string {
  return text.replace(
    DATE,
    (match: string, d: string, m: string, y: string | undefined, offset: number, whole: string) => {
      const day = Number(d);
      const month = Number(m);
      if (day < 1 || day > 31 || month < 1 || month > 12) return match;
      const fraction = !y && day < month && month <= 8;
      if (fraction && !DATE_WORD.test(whole.slice(Math.max(0, offset - 20), offset))) return match;
      const name = MONTHS[locale][month - 1];
      const year = y ? (y.length === 2 ? `20${y}` : y) : "";
      if (locale === "id") return `${day} ${name}${year ? ` ${year}` : ""}`;
      return `${name} ${day}${year ? `, ${year}` : ""}`;
    }
  );
}

// ---- Symbols and words -----------------------------------------------------

function speakSymbols(text: string, locale: SpeechLocale): string {
  const id = locale === "id";
  return (
    text
      // "Pengaturan → Staf": a path, read as steps.
      .replace(/\s*(?:→|->|⟶|➜|➔|⇒)\s*/g, id ? ", lalu " : ", then ")
      // An aside in brackets: a short pause either side.
      .replace(/\s*[([]\s*/g, ", ")
      .replace(/\s*[)\]]/g, ", ")
      // Separators a voice would name or rush through: a pause instead.
      .replace(/\s*[·•—–;]\s*/g, ", ")
      .replace(/\s+-\s+/g, ", ")
      // "Ari/Syam": either one.
      .replace(/(\p{L})\s*\/\s*(?=\p{L})/gu, `$1 ${id ? "atau" : "or"} `)
      .replace(/\s*&\s*/g, id ? " dan " : " and ")
      // "2x sehari": two times.
      .replace(/\b(\d+)\s?x\b/g, `$1 ${id ? "kali" : "times"}`)
      // Marks a voice reads out or stumbles on.
      .replace(/[“”"«»*_#]/g, " ")
  );
}

function speakWords(text: string, locale: SpeechLocale): string {
  if (locale !== "id") return text;
  // Indonesians say the letters of HP the Indonesian way.
  return text.replace(/\bHP(nya)?\b/g, (_, nya?: string) => (nya ? "ha-pe-nya" : "ha-pe"));
}

/** Commas and spaces left neat after the rewrites. */
function tidy(text: string): string {
  let out = text.replace(/\s+/g, " ");
  let before = "";
  while (before !== out) {
    before = out;
    out = out
      .replace(/\s+,/g, ",")
      .replace(/,(\s*,)+/g, ",")
      .replace(/,\s*([.!?:])/g, "$1")
      .replace(/([.!?:])\s*,\s*/g, "$1 ");
  }
  return out
    .replace(/,(?=\p{L})/gu, ", ")
    .replace(/^[\s,]+/, "")
    .replace(/[\s,]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Kakak's reply as a person would say it, for the phone's voice: times,
 * dates and symbols in words, and the pauses a reader would make.
 */
export function toSpeech(text: string, locale: SpeechLocale): string {
  if (!text) return "";
  let out = speakTimes(text, locale);
  out = speakDates(out, locale);
  out = speakSymbols(out, locale);
  out = speakWords(out, locale);
  return tidy(out);
}

// ---- Pacing ----------------------------------------------------------------

export interface SpokenPart {
  /** One sentence, ready for the voice. */
  text: string;
  /** The pause before the next sentence; 0 after the last. */
  pauseAfterMs: number;
}

/** A short opener such as "Baik.", "Beres." or "Of course.". */
function isOpener(sentence: string): boolean {
  return /[.!]$/.test(sentence) && sentence.split(/\s+/).length <= 2;
}

/**
 * What the voice reads, sentence by sentence: a short opener, then at most
 * MAX_SENTENCES sentences. When the reply ends with a question that would
 * be cut, the question is kept instead, since the owner has to answer it.
 */
export function speechPlan(text: string, locale: SpeechLocale): SpokenPart[] {
  const spoken = toSpeech(text, locale);
  if (!spoken) return [];
  const sentences = spoken
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const opener = sentences.length > 1 && isOpener(sentences[0]) ? sentences[0] : null;
  const body = opener ? sentences.slice(1) : sentences;
  let kept = body.slice(0, MAX_SENTENCES);
  const last = body[body.length - 1];
  if (body.length > MAX_SENTENCES && last.endsWith("?")) kept = [...body.slice(0, MAX_SENTENCES - 1), last];
  const parts = opener ? [opener, ...kept] : kept;
  return parts.map((part, i) => ({
    text: part,
    pauseAfterMs: i === parts.length - 1 ? 0 : i === 0 && opener ? OPENER_PAUSE_MS : SENTENCE_PAUSE_MS,
  }));
}
