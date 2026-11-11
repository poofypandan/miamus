// What Kakak's card says about each suggestion, in the owner's language
// (plan, screen 5): one fact per line — What, Who, When, Repeats, Room.
// Pure, so the wording is unit-tested in both languages.

import { remindLabel } from "@/lib/chore-reminders";
import { routineKindInfo } from "@/lib/pet-routine-kinds";
import type { RoutineKind, RoutineProof } from "@/types/database";
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
      const newRoom = item.newRoomName
        ? item.newRoomFloorName
          ? `${item.newRoomFloorName} · ${item.newRoomName}`
          : item.newRoomName
        : null;
      const room = item.roomName ?? newRoom;
      if (room) {
        rows.push({
          label: t("Room", "Ruangan"),
          value: newRoom ? t(`${room} (new room)`, `${room} (ruangan baru)`) : room,
        });
      }
      if (item.requiresSupervision) rows.push({ label: t("You", "Anda"), value: t("Need to be there", "Harus ada") });
      if (item.notes) rows.push({ label: t("Notes", "Catatan"), value: item.notes });
      if (item.remindDaysBefore != null) {
        rows.push({ label: t("Remind me", "Ingatkan saya"), value: remindLabel(item.remindDaysBefore, locale) });
      }
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
    case "pet_routine":
      return describePetRoutine(item, locale, t);
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
          ? petRoutineSummary(first, locale)
          : first.name;
  const more = items.length > 1 ? t(` and ${items.length - 1} more`, ` dan ${items.length - 1} lainnya`) : "";
  return t(`Saved — ${name}${more}`, `Tersimpan — ${name}${more}`);
}

/** Whether saving this card would add anything (a routine whose times all exist adds nothing). */
export function addsSomething(item: KakakSuggestion): boolean {
  return item.kind !== "pet_routine" || item.pets.some((p) => p.times.length > 0);
}

type PetRoutine = Extract<KakakSuggestion, { kind: "pet_routine" }>;

/** "Mocha & Matcha", "Mocha, Matcha & Coco". */
export function petList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

/** What the owner calls the routine: the kind in their language, or the saved title. */
function routineName(item: PetRoutine, locale: Locale): string {
  const info = routineKindInfo(item.routine as RoutineKind);
  if (item.routine === "other" || !info) {
    const title = item.title ?? "";
    return locale === "en" && item.titleEn ? item.titleEn : title;
  }
  return locale === "en" ? info.en : (item.title ?? info.id);
}

/** "Every day", "Mon, Wed, Fri", "…, until Friday 13 Nov". */
function routineRepeats(item: PetRoutine, locale: Locale, t: T): string {
  const base = item.days
    ? item.days.map((d) => SHORT_WEEKDAYS[locale][d % 7]).join(", ")
    : t("Every day", "Setiap hari");
  return item.until ? `${base}, ${t("until", "sampai")} ${cardDate(item.until, locale)}` : base;
}

const SHORT_WEEKDAYS: Record<Locale, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
};

const PROOFS: Record<RoutineProof, [string, string]> = {
  three: ["3 photos (start, there, back)", "3 foto (mulai, sampai, pulang)"],
  photo: ["A photo", "Foto"],
  tick: ["A tick", "Centang"],
};

/** "07.00 is already there." for one pet; "Matcha: 21.30 is already there." when there are several. */
function alreadyNote(item: PetRoutine, locale: Locale, t: T): string | undefined {
  const withSome = item.pets.filter((p) => p.alreadyThere.length > 0);
  if (withSome.length === 0) return undefined;
  const one = (times: string[]) =>
    t(
      `${times.map((x) => cardTime(x, locale)).join(", ")} ${times.length === 1 ? "is" : "are"} already there.`,
      `${times.map((x) => cardTime(x, locale)).join(", ")} sudah ada.`,
    );
  if (item.pets.length === 1) return one(withSome[0].alreadyThere);
  return withSome.map((p) => `${p.petName}: ${one(p.alreadyThere)}`).join(" ");
}

function describePetRoutine(item: PetRoutine, locale: Locale, t: T): CardItem {
  const names = petList(item.pets.map((p) => p.petName));
  const note = alreadyNote(item, locale, t);
  const kept = item.pets.filter((p) => p.times.length > 0);
  const times = [...new Set(kept.flatMap((p) => p.times.map((x) => x.time)))].sort();
  if (item.routine === "meal" || item.routine === "potty") {
    const potty = item.routine === "potty";
    const what = potty ? t("Potty breaks", "Pipis & Pup") : t("Meals", "Makan");
    return {
      heading: `${what} · ${names}`,
      rows: times.map((time) => {
        const having = kept.filter((p) => p.times.some((x) => x.time === time));
        const title = potty ? t("Potty break", "Pipis & Pup") : (having[0]?.times.find((x) => x.time === time)?.title ?? "");
        // Only when the pets differ is the time's pet named.
        const who = item.pets.length > 1 && having.length < item.pets.length ? ` · ${petList(having.map((p) => p.petName))}` : "";
        return { label: cardTime(time, locale), value: `${title}${who}` };
      }),
      note,
    };
  }
  const rows: CardRow[] = [];
  const name = routineName(item, locale);
  rows.push({
    label: t("What", "Apa"),
    // An English-speaking owner also sees what staff will read.
    value: locale === "en" && item.title && item.title !== name ? `${name} (${item.title})` : name,
  });
  if (kept.length > 0 && kept.length < item.pets.length) {
    rows.push({ label: t("For", "Untuk"), value: petList(kept.map((p) => p.petName)) });
  }
  if (times.length > 0) rows.push({ label: t("When", "Kapan"), value: times.map((x) => cardTime(x, locale)).join(", ") });
  rows.push({ label: t("Repeats", "Ulangi"), value: routineRepeats(item, locale, t) });
  rows.push({ label: t("Who", "Siapa"), value: item.staffName ?? t("Anyone", "Siapa saja") });
  if (item.note) rows.push({ label: t("Note for staff", "Catatan untuk staf"), value: item.note });
  if (item.proof) rows.push({ label: t("Proof", "Bukti"), value: t(...PROOFS[item.proof]) });
  if (item.remindStaff) rows.push({ label: t("Remind staff", "Ingatkan staf"), value: t("At this time", "Di jam ini") });
  if (item.alertOwners) {
    rows.push({ label: t("Tell us", "Kabari kami"), value: t("If it's not done", "Jika belum dikerjakan") });
  }
  return { heading: `${t("Routine", "Rutinitas")} · ${names}`, rows, note };
}

/** The toast's name for a routine: "Lights off · Mocha & Matcha", or "Mochi 07:00, 12:00" for meals. */
function petRoutineSummary(item: PetRoutine, locale: Locale): string {
  const kept = item.pets.filter((p) => p.times.length > 0);
  const names = petList((kept.length ? kept : item.pets).map((p) => p.petName));
  if (item.routine === "meal" || item.routine === "potty") {
    const times = [...new Set(kept.flatMap((p) => p.times.map((x) => x.time)))].sort();
    return `${names} ${times.map((x) => cardTime(x, locale)).join(", ")}`;
  }
  return `${routineName(item, locale)} · ${names}`;
}
