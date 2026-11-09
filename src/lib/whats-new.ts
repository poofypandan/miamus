import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * Short tutorials for new features (owner, 2026-11-09: "when new features
 * come to the app, please give a short tutorial for owners and staff, if it
 * impacts them"). One entry per feature, newest first. Each is shown once as
 * a card where the feature lives, then stays readable in Household → What's
 * new.
 *
 * Owner entries carry both languages (docs/indonesian-glossary.md); a staff
 * entry, when a feature changes staff screens, is Indonesian only.
 */
export interface WhatsNewEntry {
  id: string;
  /** When it reached the app, for the list. */
  date: string;
  audience: "owner";
  title: Record<OwnerLocale, string>;
  steps: Record<OwnerLocale, string[]>;
  /** The card's button that opens the feature. */
  tryLabel: Record<OwnerLocale, string>;
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    id: "floors-2026-11",
    date: "2026-11-09",
    audience: "owner",
    title: { en: "New: floors and spots", id: "Baru: lantai dan bagian" },
    steps: {
      en: [
        "In Chores → Rooms, tap Sort rooms once: your rooms are grouped by floor, and Undo is there if you change your mind.",
        "Rooms that were really parts of one room (toilet, sink) become one room, with each part kept on its chores.",
        "Rename, move or add floors and rooms any time in Household → Rooms.",
      ],
      id: [
        "Di Tugas → Ruangan, ketuk Kelompokkan sekali: ruangan Anda dikelompokkan per lantai, dan ada Batalkan kalau berubah pikiran.",
        "Ruangan yang sebenarnya bagian dari satu ruangan (toilet, wastafel) jadi satu ruangan, dengan bagiannya tetap di tugasnya.",
        "Ubah nama, pindahkan, atau tambah lantai dan ruangan kapan saja di Rumah → Ruangan.",
      ],
    },
    tryLabel: { en: "Got it", id: "Mengerti" },
  },
  {
    id: "rooms-2026-11",
    date: "2026-11-09",
    audience: "owner",
    title: { en: "New: Rooms", id: "Baru: Ruangan" },
    steps: {
      en: [
        "Chores now has Rooms: tap it to see every room and what's set up there.",
        "Tap Vacuum (or Mop, Dust…) to see which rooms have it and which don't.",
        "Tap Add next to a room to set it up there.",
      ],
      id: [
        "Tugas sekarang punya Ruangan: ketuk untuk melihat setiap ruangan dan tugasnya.",
        "Ketuk Vakum (atau Pel, Lap debu…) untuk melihat ruangan mana yang sudah dan belum.",
        "Ketuk Tambah di samping ruangan untuk menambahkannya.",
      ],
    },
    tryLabel: { en: "Show me Rooms", id: "Lihat Ruangan" },
  },
];

export function whatsNewEntry(id: string): WhatsNewEntry | undefined {
  return WHATS_NEW.find((entry) => entry.id === id);
}

/** This phone has closed the card (a convenience, so storage may fail). */
export function storageKey(id: string): string {
  return `miamus.whats-new.${id}`;
}
