// The rows a confirmed pet routine card writes (Phase 173 PR B, D8). Pure,
// so it is unit-tested; the phone hands the result to createSchedulesBatch,
// the same HouseholdProvider action the Add routine sheet uses, so RLS (only
// admins write routines, migrations/144) and the database's checks decide
// exactly as for a routine made by hand.
//
// Meals and potty are written as Kakak always wrote them: one row per pet
// and time, no kind. Every other kind goes through planRoutineSave, the
// sheet's own planner: one group id, a row per pet and time, the kind, days,
// end, person, note, proof and the two switches on every row. A pet that
// already had a time keeps it and gets no second row (the card said so).

import type { CreateScheduleInput } from "@/lib/data/types";
import { planRoutineSave, type RoutineDraft } from "@/lib/routine-groups";
import type { RoutineKind } from "@/types/database";
import type { PetRoutineSuggestion } from "./suggestions";

export function petRoutineRows(
  item: PetRoutineSuggestion,
  { groupId, today, nowIso }: { groupId: string; today: string; nowIso: string },
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
  const draft: RoutineDraft = {
    kind: item.routine as RoutineKind,
    title: item.title ?? "",
    petIds: pets.map((p) => p.petId),
    times: [...new Set(pets.flatMap((p) => p.times.map((t) => t.time)))].sort(),
    repeat: item.days ? "days" : "daily",
    days: item.days ?? [],
    onceDate: today,
    endsOn: item.until,
    staffId: item.staffId,
    note: item.note ?? "",
    proof: item.proof ?? "photo",
    remindStaff: item.remindStaff,
    alertOwners: item.alertOwners,
  };
  const plan = planRoutineSave({ draft, existing: [], groupId, onceStart: nowIso, nowIso, today });
  // Only each pet's own new times: one that pet already has isn't written again.
  const wanted = new Map(pets.map((p) => [p.petId, new Set(p.times.map((t) => t.time))]));
  return plan.create.filter((row) => wanted.get(row.entity_id)?.has(row.fixed_times?.[0] ?? "") ?? false);
}
