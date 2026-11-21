"use client";

import { useState } from "react";
import { PawPrint, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { PetFormDialog } from "@/components/dashboard/pet-form-dialog";
import { AddRoutineSheet, type AddRoutineTarget } from "@/components/dashboard/add-routine-sheet";
import { StarterRoutinesSheet } from "@/components/dashboard/starter-routines-sheet";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { PetWall } from "@/components/pets/pet-wall";
import { WhatsNewCard } from "@/components/shared/whats-new";
import type { TaskEntity } from "@/types/database";

/**
 * The Pets tab (21 Nov; Fable's 08, section 5, accepted by the owner): every
 * pet at once on a wall, the same size, as large as the screen allows, down
 * to Kakak's pill. A tap opens the pet's page, which holds its day, its
 * photos and its health record; the day belongs there and to Today, so the
 * wall has no date.
 *
 * Adding a pet or a routine sits above the wall as two quiet buttons until
 * the one "+" at the top right (07, rule 3).
 *
 * Owner-facing, in the language the owner chose (Phase 149).
 */
export function PetsTab() {
  const { pets, loading, userRole, createEntity, updateEntity, deleteEntity } = useHousehold();
  const t = useT();
  const [addOpen, setAddOpen] = useState(false);
  // Add routine from here starts with every pet ticked (Phase 173, D1).
  const [routineTarget, setRoutineTarget] = useState<AddRoutineTarget | null>(null);
  // The pet just added, whose usual routines are offered (Phase 173 PR B, D9).
  const [starterPet, setStarterPet] = useState<TaskEntity | null>(null);
  const canManagePets = userRole === "owner";

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-2 px-4 pb-3">
        <Skeleton className="min-h-40 w-full flex-1 rounded-[24px]" />
        <Skeleton className="min-h-40 w-full flex-1 rounded-[24px]" />
      </div>
    );
  }

  const addDialog = canManagePets ? (
    <PetFormDialog
      open={addOpen}
      onOpenChange={setAddOpen}
      pet={null}
      createEntity={createEntity}
      updateEntity={updateEntity}
      deleteEntity={deleteEntity}
      onCreated={setStarterPet}
    />
  ) : null;

  return (
    <div className="flex flex-1 flex-col gap-3 px-4 pb-3">
      {addDialog}
      {/* Outside the wall: the first pet's sheet opens while the empty state is still showing. */}
      {canManagePets && <StarterRoutinesSheet pet={starterPet} onClose={() => setStarterPet(null)} />}

      {pets.length === 0 ? (
        <EmptyState
          icon={PawPrint}
          title={t("No pets yet", "Belum ada hewan")}
          description={t(
            "Add your first pet to start their profile, daily routines and photos. Your staff see them straight away.",
            "Tambahkan hewan pertama Anda untuk memulai profil, rutinitas harian dan fotonya. Staf Anda langsung melihatnya."
          )}
        >
          {canManagePets && (
            <Button className="min-h-[44px]" onClick={() => setAddOpen(true)}>
              <Plus /> {t("Add Pet", "Tambah Hewan")}
            </Button>
          )}
        </EmptyState>
      ) : (
        <>
          {canManagePets && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="min-h-10 min-w-fit flex-1 rounded-xl text-sm"
                onClick={() => setAddOpen(true)}
              >
                <Plus /> {t("Add Pet", "Tambah Hewan")}
              </Button>
              <Button
                variant="outline"
                className="min-h-10 min-w-fit flex-1 rounded-xl text-sm"
                onClick={() => setRoutineTarget({ petIds: pets.map((p) => p.id) })}
              >
                <Plus /> {t("Add routine", "Tambah rutinitas")}
              </Button>
            </div>
          )}
          <WhatsNewCard id="pets-wall-2026-11" />
          <PetWall pets={pets} />
          {canManagePets && <AddRoutineSheet target={routineTarget} onClose={() => setRoutineTarget(null)} />}
        </>
      )}
    </div>
  );
}
