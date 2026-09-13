"use client";

import { useState } from "react";
import { ChevronLeft, Edit2 } from "lucide-react";
import { PetFormDialog } from "@/components/dashboard/pet-form-dialog";
import { useHousehold } from "@/context/household-context";
import type { TaskEntity } from "@/types/database";

// Sits above a pet's detail view in each of the three main tabs (Daily
// Feed, Schedules, Health Passport) — "Overview" always returns to the
// Unified Overview (activePetId: null), "Edit Pet" opens the same form
// dialog the Overview's "Add / Manage Pets" button uses, pre-filled for
// this pet.
export function PetDetailHeader({ pet }: { pet: TaskEntity }) {
  const { setActivePetId, userRole, createEntity, updateEntity, deleteEntity } = useHousehold();
  const [editOpen, setEditOpen] = useState(false);
  const canManagePets = userRole === "owner";

  return (
    <div className="mb-6 flex items-center justify-between">
      <button
        type="button"
        onClick={() => setActivePetId(null)}
        className="flex items-center text-sm font-medium text-gray-500 transition-colors hover:text-black"
      >
        <ChevronLeft className="mr-1 size-4" /> Overview
      </button>
      {canManagePets && (
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="flex items-center text-sm font-medium text-gray-500 transition-colors hover:text-black"
        >
          <Edit2 className="mr-1 size-4" /> Edit Pet
        </button>
      )}

      {canManagePets && (
        <PetFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          pet={pet}
          createEntity={createEntity}
          updateEntity={updateEntity}
          deleteEntity={deleteEntity}
        />
      )}
    </div>
  );
}
