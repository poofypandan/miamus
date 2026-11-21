import { isLate } from "@/lib/staff-progress";
import type { AgendaItem } from "@/lib/scheduleEngine";
import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * The Pets tab as a wall of every pet at once (21 Nov; Fable's 08, section
 * 5, decisions 19–35, accepted by the owner): every pet the same size,
 * always. Bands up to three, the wall from four, the same grid scrolling
 * from seven. Pure, so it is unit-tested (tests/unit/pet-wall.test.ts).
 */
export interface WallLayout {
  columns: 1 | 2;
  /** Equal rows that share the space above Kakak's pill; null: fixed rows that scroll. */
  rows: number | null;
}

export function wallLayout(count: number): WallLayout {
  if (count <= 1) return { columns: 1, rows: 1 };
  if (count <= 3) return { columns: 1, rows: count };
  if (count === 4) return { columns: 2, rows: 2 };
  if (count <= 6) return { columns: 2, rows: 3 };
  return { columns: 2, rows: null };
}

/** The photo size a tile loads: full width 1280 (the stored photo), half width 640. */
export function tilePhotoWidth(layout: WallLayout): 640 | 1280 {
  return layout.columns === 1 ? 1280 : 640;
}

/**
 * The quiet line of facts under a pet's name: breed, age, sex, as many as are
 * known and fit (three on a full-width tile, two on a half). Only the breed
 * is stored today; the others join with the pet's optional facts.
 */
export function factsLine(
  facts: { breed?: string | null; age?: string | null; sex?: string | null },
  columns: 1 | 2
): string | null {
  const known = [facts.breed, facts.age, facts.sex].map((f) => f?.trim()).filter((f): f is string => !!f);
  const shown = known.slice(0, columns === 1 ? 3 : 2);
  return shown.length ? shown.join(" · ") : null;
}

/**
 * The earliest routine of this pet that is late, by Today's own rule
 * (lib/staff-progress isLate: past its time plus the grace), or null.
 */
export function earliestLate(items: readonly AgendaItem[], today: string, nowMinutes: number): AgendaItem | null {
  const late = items
    .filter((item) => item.status !== "completed" && isLate({ date: today, today, nowMinutes, time: item.time }))
    .sort((a, b) => a.time.localeCompare(b.time));
  return late[0] ?? null;
}

/** "Late: Makan malam" / "Makan malam terlambat": the routine's own name, in the owner's words around it. */
export function lateLine(item: Pick<AgendaItem, "title">, locale: OwnerLocale): string {
  return locale === "id" ? `${item.title} terlambat` : `Late: ${item.title}`;
}
