"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus, Stethoscope } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { PetFormDialog } from "@/components/dashboard/pet-form-dialog";
import { useHousehold } from "@/context/household-context";
import { getPetMeta, isAdmitted } from "@/lib/pets";

/**
 * The pet directory: who lives here, and the way into each one's profile.
 *
 * Deliberately not a daily view (Phase 101). Until now this tab also carried a
 * date ribbon, the day's timeline and the day's photo feed — all of which the
 * Agenda tab had already become the home for, so the same information was in
 * two places and the two could disagree about what "today" meant. Daily
 * tracking lives on the Agenda; this is the static side: who they are, their
 * medical history, their routines, their settings.
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary. The
 * rows open PetProfileSheet, which is where every pet mutation already lives.
 */
export function PetsTab() {
  const {
    pets,
    medicalRecords,
    loading,
    setActivePetId,
    userRole,
    createEntity,
    updateEntity,
    deleteEntity,
  } = useHousehold();
  const [addOpen, setAddOpen] = useState(false);
  const canManagePets = userRole === "owner";

  // How much history each pet has, so a profile with records to read is
  // distinguishable from an empty one before it is opened.
  const recordCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of medicalRecords) {
      counts.set(record.entity_id, (counts.get(record.entity_id) ?? 0) + 1);
    }
    return counts;
  }, [medicalRecords]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 px-4">
        <Skeleton className="h-8 w-32 rounded-lg" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">
      <h2 className="text-sm font-semibold text-gray-900">Pets</h2>

      {pets.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card px-3 py-6 text-center text-sm text-muted-foreground">
          No pets yet. Add one to start building their profile and routines.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {pets.map((pet) => {
            const meta = getPetMeta(pet);
            const records = recordCounts.get(pet.id) ?? 0;
            return (
              <button
                key={pet.id}
                type="button"
                onClick={() => setActivePetId(pet.id)}
                className="flex min-h-[72px] w-full items-center gap-3 rounded-xl border bg-card px-3 py-2.5 text-left active:bg-muted/60"
              >
                <MiniPetAvatar pet={pet} className="size-12" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-sm font-medium">{pet.name}</span>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {meta.breed && (
                      <span className="truncate text-xs text-muted-foreground">{meta.breed}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {records === 0
                        ? "No medical records"
                        : `${records} medical record${records === 1 ? "" : "s"}`}
                    </span>
                    {/* The one status worth seeing before opening a profile:
                        an admitted dog's routines are paused. */}
                    {isAdmitted(pet) && (
                      <Badge className="h-5 gap-1 bg-indigo-100 px-1.5 text-[10px] text-indigo-900">
                        <Stethoscope className="size-3" /> At the clinic
                      </Badge>
                    )}
                  </span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-gray-400" />
              </button>
            );
          })}
        </div>
      )}

      {canManagePets && (
        <>
          {/* Moved here from the summary card on the Agenda (Phase 101):
              adding a pet is directory work, and the Agenda is for the day. */}
          <Button
            onClick={() => setAddOpen(true)}
            variant="outline"
            className="min-h-[48px] w-full rounded-xl border-zinc-200 bg-white text-sm font-medium text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700"
          >
            <Plus /> Add Pet
          </Button>

          <PetFormDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            pet={null}
            createEntity={createEntity}
            updateEntity={updateEntity}
            deleteEntity={deleteEntity}
          />
        </>
      )}

      <p className="px-1 text-[11px] text-muted-foreground">
        Open a pet to edit their details, routines and medical records. Today&apos;s tasks and
        photos live on the Agenda.
      </p>
    </div>
  );
}
