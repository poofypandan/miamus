import type { MasterSchedule, MedicalRecord } from "@/types/database";

/**
 * A pet's facts that Miamus can already work out (21 Nov; Fable's 08,
 * section 5, the page's card): the latest weight, the next vaccine, and who
 * looks after it. Pure, so it is unit-tested (tests/unit/pet-facts.test.ts).
 * A fact that isn't known is null, and the card leaves it out.
 */

const when = (record: MedicalRecord) => record.administered_at ?? record.created_at;

/** The newest weight log, in kg, and the day it was taken. */
export function latestWeight(records: readonly MedicalRecord[]): { kg: number; on: string } | null {
  const weights = records
    .filter((r) => r.record_type === "weight" && typeof r.value === "number" && r.value > 0)
    .sort((a, b) => when(b).localeCompare(when(a)));
  const latest = weights[0];
  return latest ? { kg: latest.value as number, on: when(latest).slice(0, 10) } : null;
}

/**
 * The next vaccine due: each vaccine's newest record (so a renewed one no
 * longer counts as late), then the earliest next due date among them. `late`
 * when that date has passed.
 */
export function nextVaccine(
  records: readonly MedicalRecord[],
  today: string
): { title: string; due: string; late: boolean } | null {
  const newest = new Map<string, MedicalRecord>();
  for (const record of records) {
    if (record.record_type !== "vaccine") continue;
    const key = record.title.trim().toLocaleLowerCase();
    const seen = newest.get(key);
    if (!seen || when(record) > when(seen)) newest.set(key, record);
  }
  const due = [...newest.values()]
    .filter((r): r is MedicalRecord & { next_due_date: string } => !!r.next_due_date)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date));
  const next = due[0];
  return next ? { title: next.title.trim(), due: next.next_due_date.slice(0, 10), late: next.next_due_date.slice(0, 10) < today } : null;
}

/**
 * Who looks after the pet: whoever most of its routines are for. Null when
 * they are for anyone, or for nobody in particular more than another.
 */
export function lookedAfterBy(schedules: readonly MasterSchedule[], petId: string): string | null {
  const counts = new Map<string, number>();
  for (const schedule of schedules) {
    if (schedule.entity_id !== petId || !schedule.staff_id || schedule.is_active === false) continue;
    counts.set(schedule.staff_id, (counts.get(schedule.staff_id) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) return null;
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

/** A first name, for "Looked after by": never a photo, never a surname. */
export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}
