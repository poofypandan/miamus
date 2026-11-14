// What Kakak's card says about each suggestion, in the owner's language
// (plan, screen 5): one fact per line — What, Who, When, Repeats, Room.
// Pure, so the wording is unit-tested in both languages.

import { remindLabel } from "@/lib/chore-reminders";
import { defaultPlace } from "@/lib/ingredients";
import { clean, formatAmount, unitLabel } from "@/lib/kitchen-units";
import { routineKindInfo } from "@/lib/pet-routine-kinds";
import { ownerAlertTimeAllowed, reminderTimeAllowed } from "@/lib/routine-alerts";
import type { RoutineKind, RoutineProof } from "@/types/database";
import type { KakakSuggestion } from "./suggestions";

type Locale = "en" | "id";
type T = (en: string, id: string) => string;

export interface CardRow {
  label: string;
  value: string;
  /** "Kakak's guess — check it": shown in amber, with the safety line. */
  guess?: boolean;
  /**
   * A pet routine's PR C switch (migrations/150): the card shows it as a
   * switch the owner can flip before saving, with no call to Kakak.
   * `allowed` is false when none of the routine's times can use it.
   */
  toggle?: { field: "remindStaff" | "alertOwners"; on: boolean; allowed: boolean };
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
    case "ingredient": {
      const place = (p: string) => t(...(PLACES[p] ?? [p, p]));
      const rows: CardRow[] = [{ label: t("What", "Apa"), value: item.name }];
      const notes: string[] = [];
      const amount = item.amount ?? null;
      if (amount) {
        const now = formatAmount(amount.value, amount.unit, locale);
        if (amount.mode === "add") {
          // A purchase: what comes in, then what that makes.
          const total = amount.before === null ? null : formatAmount(clean(amount.before + amount.value), amount.unit, locale);
          rows.push({ label: t("Amount", "Jumlah"), value: total ? t(`+${now} · ${total} in all`, `+${now} · jadi ${total}`) : `+${now}` });
        } else if (amount.mode === "set") {
          const was = amount.before !== null && amount.before !== amount.value ? formatAmount(amount.before, amount.unit, locale) : null;
          rows.push({ label: t("Amount", "Jumlah"), value: was ? t(`${now} (was ${was})`, `${now} (sebelumnya ${was})`) : now });
        } else {
          rows.push({ label: t("Amount", "Jumlah"), value: now });
          notes.push(t("Miamus keeps count of it from now on.", "Mulai sekarang jumlahnya dicatat."));
        }
      }
      const skipped = item.amountSkipped ?? null;
      if (skipped) {
        const given = formatAmount(skipped.value, skipped.unit, locale);
        notes.push(
          skipped.itemUnit
            ? t(
                `The ${given} isn't added: here ${item.name} is counted in ${unitLabel(skipped.itemUnit, locale)}.`,
                `${given} tidak ditambahkan: di sini ${item.name} dicatat dalam ${unitLabel(skipped.itemUnit, locale)}.`,
              )
            : t(`The ${given} isn't added. Set the amount on the ingredient itself.`, `${given} tidak ditambahkan. Atur jumlahnya langsung di bahannya.`),
        );
      }
      if (item.keptIn) {
        const moved = item.fromPlace && item.fromPlace !== item.keptIn;
        rows.push({
          label: t("Kept in", "Disimpan di"),
          value: moved
            ? t(`${place(item.keptIn)} (was ${place(item.fromPlace!)})`, `${place(item.keptIn)} (sebelumnya ${place(item.fromPlace!)})`)
            : place(item.keptIn),
        });
      }
      if (item.expiry === "set" && item.expiresOn) {
        rows.push({
          label: t("Expires", "Kedaluwarsa"),
          value: item.expiryIsGuess
            ? `${cardDate(item.expiresOn, locale)} · ${t("Kakak's guess — check it", "Tebakan Kakak — cek lagi")}`
            : cardDate(item.expiresOn, locale),
          guess: item.expiryIsGuess,
        });
      } else if (item.expiry === "clear") {
        rows.push({ label: t("Expires", "Kedaluwarsa"), value: t("No date", "Tidak ada") });
      }
      if (item.expiryIsGuess) notes.push(t("If it smells or looks off, throw it away.", "Kalau baunya atau tampilannya aneh, buang saja."));
      return { heading: t("Ingredient", "Bahan masakan"), rows, note: notes.length ? notes.join(" ") : undefined };
    }
    case "new_ingredient": {
      const place = (p: string) => t(...(PLACES[p] ?? [p, p]));
      // An English-speaking owner also sees what staff will read.
      const gloss = locale === "en" && item.nameEn && item.nameEn.toLowerCase() !== item.name.toLowerCase() ? item.nameEn : null;
      const rows: CardRow[] = [{ label: t("What", "Apa"), value: gloss ? `${item.name} (${gloss})` : item.name }];
      if (item.amount) rows.push({ label: t("Amount", "Jumlah"), value: formatAmount(item.amount.value, item.amount.unit, locale) });
      // With no place said, the shelf's usual one, as Add ingredient shows it.
      rows.push({ label: t("Kept in", "Disimpan di"), value: place(item.keptIn ?? defaultPlace(item.category)) });
      if (item.expiresOn) {
        rows.push({
          label: t("Expires", "Kedaluwarsa"),
          value: item.expiryIsGuess
            ? `${cardDate(item.expiresOn, locale)} · ${t("Kakak's guess — check it", "Tebakan Kakak — cek lagi")}`
            : cardDate(item.expiresOn, locale),
          guess: item.expiryIsGuess,
        });
      }
      return {
        heading: t("New ingredient", "Bahan masakan baru"),
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
          : first.kind === "new_ingredient" && locale === "en" && first.nameEn
            ? first.nameEn
            : first.name;
  const more = items.length > 1 ? t(` and ${items.length - 1} more`, ` dan ${items.length - 1} lainnya`) : "";
  return t(`Saved — ${name}${more}`, `Tersimpan — ${name}${more}`);
}

/**
 * Whether saving this card would add anything: a routine whose times all
 * exist adds nothing, and neither does an ingredient whose only news was an
 * amount that can't be written (its note says why).
 */
export function addsSomething(item: KakakSuggestion): boolean {
  if (item.kind === "pet_routine") return item.pets.some((p) => p.times.length > 0);
  if (item.kind === "ingredient") return item.keptIn !== null || item.expiry !== "keep" || Boolean(item.amount);
  return true;
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
  // The two switches are always on the card, so the owner sees them and can flip them.
  const remindAllowed = times.length === 0 || times.some(reminderTimeAllowed);
  const alertAllowed = times.length === 0 || times.some(ownerAlertTimeAllowed);
  rows.push({
    label: t("Remind staff", "Ingatkan staf"),
    value: !remindAllowed
      ? t("Too late for a reminder", "Terlalu malam untuk pengingat")
      : item.remindStaff
        ? t("At this time", "Di jam ini")
        : t("Off", "Tidak"),
    toggle: { field: "remindStaff", on: item.remindStaff && remindAllowed, allowed: remindAllowed },
  });
  rows.push({
    label: t("Tell us", "Kabari kami"),
    value: !alertAllowed
      ? t("Too late for an alert", "Terlalu malam untuk kabar")
      : item.alertOwners
        ? t("If it's not done", "Jika belum dikerjakan")
        : t("Off", "Tidak"),
    toggle: { field: "alertOwners", on: item.alertOwners && alertAllowed, allowed: alertAllowed },
  });
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

/**
 * What Kakak says once a card with a pet routine is saved (Phase 173 PR B):
 * the benefit, not the mechanics. "Done. Syam gets a reminder at 21:30;
 * you'll only hear from me if it isn't done." Null when the card held no
 * routine with a kind (meals and potty keep the toast).
 */
export function savedBenefit(items: KakakSuggestion[], locale: Locale): string | null {
  const t = translator(locale);
  const routines = items.filter(
    (item): item is PetRoutine => item.kind === "pet_routine" && item.routine !== "meal" && item.routine !== "potty",
  );
  if (routines.length === 0) return null;
  const item = routines[0];
  const kept = item.pets.filter((p) => p.times.length > 0);
  const times = [...new Set(kept.flatMap((p) => p.times.map((x) => x.time)))].sort();
  const at = times.map((x) => cardTime(x, locale)).join(", ");
  const who = item.staffName;
  const first = item.remindStaff
    ? who
      ? t(`${who} gets a reminder at ${at}`, `${who} diingatkan jam ${at}`)
      : t(`Staff get a reminder at ${at}`, `Staf diingatkan jam ${at}`)
    : who
      ? t(`${who} sees it on Today at ${at}`, `${who} melihatnya di Hari ini jam ${at}`)
      : t(`Staff see it on Today at ${at}`, `Staf melihatnya di Hari ini jam ${at}`);
  const second = item.alertOwners
    ? t("you'll only hear from me if it isn't done", "Kakak hanya mengabari Anda jika belum dikerjakan")
    : item.proof === "tick"
      ? t("it's ticked off when it's done", "dicentang setelah selesai")
      : t("a photo comes back each time", "fotonya masuk setiap kali");
  return t(`Done. ${first}; ${second}.`, `Beres. ${first}; ${second}.`);
}

/**
 * The routine as the owner will find it in the pet's routines, for the one
 * line under Kakak's "Done": "Matikan lampu · 21.30" over "Mocha & Matcha ·
 * Every day". Null for meals and potty.
 */
export function routineListLine(item: KakakSuggestion, locale: Locale): { title: string; detail: string } | null {
  if (item.kind !== "pet_routine" || item.routine === "meal" || item.routine === "potty") return null;
  const t = translator(locale);
  const kept = item.pets.filter((p) => p.times.length > 0);
  const times = [...new Set(kept.flatMap((p) => p.times.map((x) => x.time)))].sort();
  return {
    title: `${item.title ?? ""} · ${times.map((x) => cardTime(x, locale)).join(", ")}`,
    detail: `${petList(kept.map((p) => p.petName))} · ${routineRepeats(item, locale, t)}`,
  };
}
