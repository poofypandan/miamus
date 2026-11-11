// The rows a confirmed pet routine card writes (Phase 173 PR B, D8). Pure,
// so it is unit-tested; the phone hands the result to createSchedulesBatch,
// the same HouseholdProvider action the Add routine sheet uses, so RLS (only
// admins write routines, migrations/144) and the database's checks decide
// exactly as for a routine made by hand.
//
// Meals and potty are written as Kakak always wrote them: one row per pet
// and time, no kind. Every other kind goes through planRoutineSave, the
// sheet's own planner: a row per pet and time, the kind, days, end, person,
// note, proof and the two switches on every row. A pet that already had a
// time keeps it and gets no second row (the card said so); pets left with
// different times go in separate groups, so each group stays rectangular.

import type { CreateScheduleInput } from "@/lib/data/types";
import { planRoutineSave, type RoutineDraft } from "@/lib/routine-groups";
import type { RoutineKind } from "@/types/database";
import type { PetRoutineSuggestion } from "./suggestions";

export function petRoutineRows(
  item: PetRoutineSuggestion,
  { newGroupId, today, nowIso }: { newGroupId: () => string; today: string; nowIso: string },
): CreateScheduleInput[] {
  const pets = item.pets.filter((p) => p.times.length > 0);
  if (pets.length === 0) return [];
  if (item.routine === "meal" || item.routine === "potty") {
    return pets.flatMap((pet) =>
      pet.times.map(({ time, title }) => ({
        entity_id: pet.petId,
        module: "pet" as const,
        frequency_type: "fixed_time" as const,
        fixed_times: [time],
        title,
      })),
    );
  }
  // Every group must be rectangular, every pet at every time: the editor
  // reopens a group as the union of its pets and times, so a pet missing a
  // time would get it on the next save (Codex, PR #100). Pets whose new times
  // differ (one already had 06:30) go in a group of their own, one group per
  // set of times, in the card's order.
  const bySet = new Map<string, { petIds: string[]; times: string[] }>();
  for (const pet of pets) {
    const times = [...new Set(pet.times.map((t) => t.time))].sort();
    const key = times.join(",");
    const group = bySet.get(key) ?? { petIds: [], times };
    group.petIds.push(pet.petId);
    bySet.set(key, group);
  }
  return [...bySet.values()].flatMap(({ petIds, times }) => {
    const draft: RoutineDraft = {
      kind: item.routine as RoutineKind,
      title: item.title ?? "",
      petIds,
      times,
      repeat: item.days ? "days" : "daily",
      days: item.days ?? [],
      onceDate: today,
      endsOn: item.until,
      staffId: item.staffId,
      note: item.note ?? "",
      // The proof the card showed, for every group.
      proof: item.proof ?? "photo",
      remindStaff: item.remindStaff,
      alertOwners: item.alertOwners,
    };
    return planRoutineSave({ draft, existing: [], groupId: newGroupId(), onceStart: nowIso, nowIso, today }).create;
  });
}
