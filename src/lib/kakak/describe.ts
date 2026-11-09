// What Kakak's card says about each suggestion, in the owner's language
// (plan, screen 5): one fact per line — What, Who, When, Repeats, Room.
// Pure, so the wording is unit-tested in both languages.

import type { KakakSuggestion } from "./suggestions";

type Locale = "en" | "id";
type T = (en: string, id: string) => string;

export interface CardRow {
  label: string;
  value: string;
  /** "Kakak's guess — check it": shown in amber, with the safety line. */
  guess?: boolean;
}

export interface CardItem {
  heading: string;
  rows: CardRow[];
  /** One quiet line under the rows ("07.00 is already there"). */
  note?: string;
}

const WEEKDAYS: Record<Locale, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  id: ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"],
};
const MONTHS: Record<Locale, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"],
};

function translator(locale: Locale): T {
  return (en, id) => (locale === "id" ? id : en);
}

/** "2026-11-14" → "Saturday 14 Nov" / "Sabtu 14 Nov". */
export function cardDate(day: string, locale: Locale): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[locale][weekday]} ${d} ${MONTHS[locale][m - 1]}`;
}

/** "09:00" → "09.00" in Indonesian (glossary), "09:00" in English. */
export function cardTime(time: string, locale: Locale): string {
  return locale === "id" ? time.replace(":", ".") : time;
}

function repeats(item: Extract<KakakSuggestion, { kind: "chore" }>, locale: Locale, t: T): string | null {
  if (item.recurrence === "none") return null;
  const [y, m, d] = item.dueDate.split("-").map(Number);
  const weekday = WEEKDAYS[locale][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const base =
    item.recurrence === "daily"
      ? t("Every day", "Setiap hari")
      : item.recurrence === "weekly"
        ? t(`Every ${weekday}`, `Setiap ${weekday}`)
        : t(`Every month on the ${d}${ordinal(d)}`, `Setiap bulan tanggal ${d}`);
  return item.recurrenceUntil ? `${base}, ${t("until", "sampai")} ${cardDate(item.recurrenceUntil, locale)}` : base;
}

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

const PLACES: Record<string, [string, string]> = {
  fridge: ["Fridge", "Kulkas"],
  freezer: ["Freezer", "Freezer"],
  pantry: ["Cupboard", "Lemari"],
  counter: ["Counter", "Meja"],
};
const SOURCES: Record<string, [string, string]> = {
  home: ["Cooked at home", "Dimasak di rumah"],
  gift: ["From someone", "Dari orang"],
  bought: ["Bought", "Dibeli"],
};

export function describeSuggestion(item: KakakSuggestion, locale: Locale): CardItem {
  const t = translator(locale);
  switch (item.kind) {
    case "chore": {
      const rows: CardRow[] = [
        {
          label: t("What", "Apa"),
          value: locale === "en" && item.titleEn ? `${item.title} (${item.titleEn})` : item.title,
        },
        { label: t("Who", "Siapa"), value: item.assigneeName ?? t("Anyone", "Siapa saja") },
        {
          label: t("When", "Kapan"),
          value: item.dueTime
            ? `${cardDate(item.dueDate, locale)}, ${cardTime(item.dueTime, locale)}`
            : cardDate(item.dueDate, locale),
        },
      ];
      const repeat = repeats(item, locale, t);
      if (repeat) rows.push({ label: t("Repeats", "Ulangi"), value: repeat });
      const room = item.roomName ?? item.newRoomName;
      if (room) {
        rows.push({
          label: t("Room", "Ruangan"),
          value: item.newRoomName ? t(`${room} (new room)`, `${room} (ruangan baru)`) : room,
        });
      }
      if (item.requiresSupervision) rows.push({ label: t("You", "Anda"), value: t("Need to be there", "Harus ada") });
      if (item.notes) rows.push({ label: t("Notes", "Catatan"), value: item.notes });
      return { heading: t("Chore", "Tugas"), rows };
    }
    case "shopping":
      return {
        heading: t("Shopping list", "Daftar belanja"),
        rows: item.entries.map((entry) =>
          entry.type === "item"
            ? { label: entry.status === "out" ? t("Buy", "Beli") : t("Running low", "Hampir habis"), value: entry.name }
            : { label: t("Buy", "Beli"), value: entry.petName ? `${entry.note} · ${entry.petName}` : entry.note },
        ),
      };
    case "pet_routine": {
      const what = item.routine === "potty" ? t("Potty breaks", "Pipis & Pup") : t("Meals", "Makan");
      return {
        heading: `${what} · ${item.petName}`,
        rows: item.times.map(({ time, title }) => ({
          label: cardTime(time, locale),
          value: item.routine === "potty" ? t("Potty break", "Pipis & Pup") : title,
        })),
        note: item.alreadyThere.length
          ? t(
              `${item.alreadyThere.map((x) => cardTime(x, locale)).join(", ")} ${item.alreadyThere.length === 1 ? "is" : "are"} already there.`,
              `${item.alreadyThere.map((x) => cardTime(x, locale)).join(", ")} sudah ada.`,
            )
          : undefined,
      };
    }
    case "food": {
      const rows: CardRow[] = [
        { label: t("What", "Apa"), value: item.name },
        { label: t("Kept in", "Disimpan di"), value: t(...(PLACES[item.keptIn] ?? [item.keptIn, item.keptIn])) },
      ];
      if (item.expiresOn) {
        rows.push({
          label: t("Expires", "Kedaluwarsa"),
          value: item.expiryIsGuess
            ? `${cardDate(item.expiresOn, locale)} · ${t("Kakak's guess — check it", "Tebakan Kakak — cek lagi")}`
            : cardDate(item.expiresOn, locale),
          guess: item.expiryIsGuess,
        });
      } else {
        rows.push({ label: t("Expires", "Kedaluwarsa"), value: t("Don't know", "Tidak tahu") });
      }
      if (item.source) {
        const source = t(...(SOURCES[item.source] ?? [item.source, item.source]));
        rows.push({ label: t("From", "Dari"), value: item.fromWhom ? `${source} · ${item.fromWhom}` : source });
      }
      if (item.returnContainer) rows.push({
          label: t("Container", "Wadah"),
          value: item.fromWhom ? t(`Return to ${item.fromWhom}`, `Kembalikan wadah ke ${item.fromWhom}`) : t("Return it", "Kembalikan wadah"),
        });
      if (item.notes) rows.push({ label: t("Notes", "Catatan"), value: item.notes });
      return {
        heading: t("Food", "Makanan"),
        rows,
        note: item.expiryIsGuess
          ? t("If it smells or looks off, throw it away.", "Kalau baunya atau tampilannya aneh, buang saja.")
          : undefined,
      };
    }
  }
}

/** The toast after saving: "Saved — Mop the terrace, Sari". */
export function savedSummary(items: KakakSuggestion[], locale: Locale): string {
  const t = translator(locale);
  const first = items[0];
  const name =
    first.kind === "chore"
      ? [locale === "en" && first.titleEn ? first.titleEn : first.title, first.assigneeName].filter(Boolean).join(", ")
      : first.kind === "shopping"
        ? first.entries.map((e) => (e.type === "item" ? e.name : e.note)).join(", ")
        : first.kind === "pet_routine"
          ? `${first.petName} ${first.times.map((x) => cardTime(x.time, locale)).join(", ")}`
          : first.name;
  const more = items.length > 1 ? t(` and ${items.length - 1} more`, ` dan ${items.length - 1} lainnya`) : "";
  return t(`Saved — ${name}${more}`, `Tersimpan — ${name}${more}`);
}

/** Whether saving this card would add anything (a routine whose times all exist adds nothing). */
export function addsSomething(item: KakakSuggestion): boolean {
  return item.kind !== "pet_routine" || item.times.length > 0;
}
