import type { OwnerLocale } from "@/lib/owner-locale";
import { repairStage, visitsOf, type RepairStage } from "@/lib/repairs";
import { walkInsOf } from "@/lib/repair-walkins";
import type { HouseholdTask, Repair, RepairWalkIn } from "@/types/database";

/**
 * Send to the developer (Phase 174 PR C, D7 A; docs/phase-174-repairs-walkin-plan.md,
 * mockup 7): the open repairs as one tidy list an owner shares from their own
 * phone, through the share sheet (WhatsApp) or a page saved as PDF. Miamus
 * sends nothing itself and makes no public link. Pure rules here, tested
 * without a browser; the sheet and the print page are in
 * components/repairs/developer-list-sheet.tsx.
 *
 * The message is in Bahasa Indonesia by default (the developer is
 * Indonesian), with English one tap away. Its language is the message's,
 * not the owner's screen language.
 */

/** At most this many photos per repair: the problem, and how it looks at the latest visit. */
export const PHOTOS_PER_REPAIR = 2;

export interface DeveloperPhoto {
  url: string;
  kind: "problem" | "latest";
}

export interface DeveloperItem {
  repair: Repair;
  /** Where it is, as the rooms list names it ("LT2 · Kamar Tamu 1 · Wastafel"), or null. */
  place: string | null;
  stage: RepairStage;
  photos: DeveloperPhoto[];
}

/**
 * The photos to send with a repair: the problem photo, then the latest
 * visit's (its after photo when there is one: how it looks now; else its
 * before photo). Walk-ins and scheduled visits both count. Never the same
 * photo twice.
 */
export function developerPhotos(
  repair: Repair,
  visits: readonly HouseholdTask[],
  walkIns: readonly RepairWalkIn[]
): DeveloperPhoto[] {
  const photos: DeveloperPhoto[] = [];
  if (repair.photo_url) photos.push({ url: repair.photo_url, kind: "problem" });

  const candidates: { at: string; url: string }[] = [];
  for (const v of walkInsOf(repair.id, walkIns)) {
    const url = v.after_photo_url ?? v.before_photo_url;
    if (url) candidates.push({ at: v.left_at ?? v.arrived_at, url });
  }
  for (const v of visitsOf(repair.id, [...visits])) {
    const url = v.after_photo_url ?? v.photo_url ?? v.before_photo_url;
    if (url) candidates.push({ at: v.completed_at ?? `${v.due_date}T23:59:59`, url });
  }
  const latest = candidates.sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  if (latest && !photos.some((p) => p.url === latest.url)) photos.push({ url: latest.url, kind: "latest" });
  return photos.slice(0, PHOTOS_PER_REPAIR);
}

/** The open repairs, in the Repairs list's order, ready for the sheet. */
export function developerItems(
  open: readonly Repair[],
  visits: readonly HouseholdTask[],
  walkIns: readonly RepairWalkIn[],
  placeName: (locationId: string | null, spot: string | null) => string | null,
  today?: string
): DeveloperItem[] {
  return open.map((repair) => ({
    repair,
    place: placeName(repair.location_id, repair.spot) || null,
    stage: repairStage(repair, [...visits], today, walkIns),
    photos: developerPhotos(repair, visits, walkIns),
  }));
}

function formatDay(iso: string, lang: OwnerLocale, withYear: boolean): string {
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat(lang === "id" ? "id-ID" : "en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
    .format(date)
    .replace(/\./g, "");
}

/** "11 Nov 2026" (both languages; id-ID's "Agu", "Des", "Mei" for its months). */
export function listDate(now: Date, lang: OwnerLocale): string {
  return formatDay(now.toISOString(), lang, true);
}

/** "9 Nov": when the problem was first reported. */
export function reportedDay(repair: Pick<Repair, "created_at">, lang: OwnerLocale): string {
  return formatDay(repair.created_at, lang, false);
}

/**
 * Where it stands, in words for the developer (not the owners' own stage
 * text, which says "check the photos" to an owner):
 *   not started yet · not finished, needs another visit · being worked on
 *   now · scheduled for 12 Nov · work done, we're still checking it.
 */
export function developerStatus(
  repair: Repair,
  stage: RepairStage,
  walkIns: readonly RepairWalkIn[],
  lang: OwnerLocale
): string {
  const id = lang === "id";
  switch (stage.kind) {
    case "working":
      return id ? "Sedang dikerjakan" : "Being worked on now";
    case "scheduled":
      return id ? `Dijadwalkan ${formatDay(stage.next.due_date, lang, false)}` : `Scheduled for ${formatDay(stage.next.due_date, lang, false)}`;
    case "check":
      return id ? "Sudah dikerjakan, masih kami cek" : "Work done, we're still checking it";
    case "fixed":
      return id ? "Sudah diperbaiki" : "Fixed";
    case "dismissed":
      return id ? "Tidak perlu" : "Not needed";
    default: {
      // Someone came and said they'd be back: say so, not "not started".
      const comeBack = walkInsOf(repair.id, walkIns).some((v) => v.outcome === "come_back");
      if (comeBack) return id ? "Belum selesai, perlu datang lagi" : "Not finished, needs another visit";
      return id ? "Belum dikerjakan" : "Not started yet";
    }
  }
}

/** "Selamat pagi" … "Selamat malam" / "Good morning" … "Good evening", by the phone's hour. */
export function greeting(hour: number, lang: OwnerLocale): string {
  if (lang === "id") {
    if (hour >= 4 && hour < 11) return "Selamat pagi";
    if (hour >= 11 && hour < 15) return "Selamat siang";
    if (hour >= 15 && hour < 18) return "Selamat sore";
    return "Selamat malam";
  }
  if (hour >= 4 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "Daftar perbaikan, Rumah Kenanga, 11 Nov 2026: 3 item" (the plan's head line). */
export function listHeading(houseName: string, now: Date, count: number, lang: OwnerLocale): string {
  const date = listDate(now, lang);
  return lang === "id"
    ? `Daftar perbaikan, ${houseName}, ${date}: ${count} item`
    : `Repair list, ${houseName}, ${date}: ${count} item${count === 1 ? "" : "s"}`;
}

/** The longest details line the message carries; the rest is in the photos and the PDF. */
const DETAILS_IN_TEXT = 160;

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** "1. Keran bocor (darurat)". */
export function itemTitle(index: number, repair: Pick<Repair, "title" | "urgent">, lang: OwnerLocale): string {
  const urgent = repair.urgent ? (lang === "id" ? " (darurat)" : " (urgent)") : "";
  return `${index + 1}. ${repair.title.trim()}${urgent}`;
}

/** "Dilaporkan 9 Nov · Belum dikerjakan". */
export function itemMeta(item: DeveloperItem, walkIns: readonly RepairWalkIn[], lang: OwnerLocale): string {
  const reported = lang === "id" ? `Dilaporkan ${reportedDay(item.repair, lang)}` : `Reported ${reportedDay(item.repair, lang)}`;
  return `${reported} · ${developerStatus(item.repair, item.stage, walkIns, lang)}`;
}

/**
 * The message, short and polite: a homeowner writing to a developer who
 * fixes things for free (materials only). A greeting and one line of
 * request, the plan's head line, a numbered list, then thanks. "Pak/Bu"
 * because nobody has told Miamus who the developer is; the owner can change
 * it in WhatsApp before sending.
 *
 * `withPhotos`: the photos go with the message as files named by number
 * ("perbaikan-1a.jpg"), so the closing line says how to match them.
 */
export function developerListText({
  houseName,
  now,
  items,
  walkIns,
  lang,
  withPhotos,
}: {
  houseName: string;
  now: Date;
  items: readonly DeveloperItem[];
  walkIns: readonly RepairWalkIn[];
  lang: OwnerLocale;
  withPhotos: boolean;
}): string {
  const id = lang === "id";
  const hello = id
    ? `${greeting(now.getHours(), lang)}, Pak/Bu. Mohon bantuannya untuk perbaikan berikut.`
    : `${greeting(now.getHours(), lang)}. Could you please help us with the repairs below?`;
  const blocks = items.map((item, index) => {
    const lines = [itemTitle(index, item.repair, lang)];
    if (item.place) lines.push(`   ${item.place}`);
    if (item.repair.details?.trim()) lines.push(`   ${clip(item.repair.details, DETAILS_IN_TEXT)}`);
    lines.push(`   ${itemMeta(item, walkIns, lang)}`);
    return lines.join("\n");
  });
  const photos = withPhotos
    ? id
      ? "Fotonya terlampir, nomornya sesuai daftar ini."
      : "Photos attached, numbered to match this list."
    : null;
  const thanks = id ? "Terima kasih banyak atas bantuannya, Pak/Bu." : "Thank you very much for your help.";
  return [hello, listHeading(houseName, now, items.length, lang), blocks.join("\n\n"), [photos, thanks].filter(Boolean).join("\n")].join(
    "\n\n"
  );
}

/** "perbaikan-1a.jpg" / "repair-1b.png": the item's number and the photo's letter. */
export function photoFileName(index: number, photoIndex: number, mime: string, lang: OwnerLocale): string {
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return `${lang === "id" ? "perbaikan" : "repair"}-${index + 1}${String.fromCharCode(97 + photoIndex)}.${ext}`;
}

/** The caption under a photo on the print page. */
export function photoLabel(photo: DeveloperPhoto, index: number, photoIndex: number, lang: OwnerLocale): string {
  const tag = `${index + 1}${String.fromCharCode(97 + photoIndex)}`;
  if (photo.kind === "problem") return lang === "id" ? `${tag} · Kerusakan` : `${tag} · The problem`;
  return lang === "id" ? `${tag} · Kunjungan terakhir` : `${tag} · Latest visit`;
}

/** wa.me with the text, for a phone or computer without a share sheet. */
export function whatsAppUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
