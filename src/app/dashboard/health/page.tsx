"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthRecordCard } from "@/components/dashboard/health-record-card";
import { HealthUploadDialog } from "@/components/dashboard/health-upload-dialog";
import { UnifiedHealthList } from "@/components/dashboard/unified-health-list";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { PetDetailHeader } from "@/components/dashboard/pet-detail-header";
import { useHousehold } from "@/context/household-context";
import { useRequireOwner } from "@/hooks/use-require-owner";
import type { MedicalRecord, TaskEntity } from "@/types/database";

export default function HealthPage() {
  const { pets, medicalRecords, activePetId, setActivePetId, loading } = useHousehold();
  const isOwner = useRequireOwner();
  const activePet = pets.find((p) => p.id === activePetId) ?? null;

  if (!isOwner) return null;

  if (loading) {
    return (
      <div className="mt-2 flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className="mt-2 flex flex-col gap-4">
        <p className="pt-8 text-center text-sm text-muted-foreground">
          No pets yet. Add a pet above to start their health passport.
        </p>
      </div>
    );
  }

  if (!activePet) {
    return (
      <div className="mt-2 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          {pets.map((pet) => (
            <button
              key={pet.id}
              type="button"
              onClick={() => setActivePetId(pet.id)}
              className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left active:bg-gray-50"
            >
              <span className="flex items-center gap-2 text-lg font-medium">
                <MiniPetAvatar pet={pet} className="size-12" />
                {pet.name}
              </span>
              <ChevronRight className="ml-auto size-5 shrink-0 text-gray-400" />
            </button>
          ))}
        </div>
        <UnifiedHealthList />
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-col gap-4">
      <PetDetailHeader pet={activePet} />
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Records
        </h2>
        <HealthUploadDialog entityId={activePet.id} />
      </div>
      <PetHealthRecords pet={activePet} medicalRecords={medicalRecords} />
    </div>
  );
}

function PetHealthRecords({
  pet,
  medicalRecords,
}: {
  pet: TaskEntity;
  medicalRecords: MedicalRecord[];
}) {
  const filtered = useMemo(
    () =>
      [...medicalRecords]
        .filter((r) => r.entity_id === pet.id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [medicalRecords, pet]
  );

  if (filtered.length === 0) {
    return <p className="pt-8 text-center text-sm text-muted-foreground">No health records yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {filtered.map((record) => (
        <HealthRecordCard key={record.id} record={record} dogName={pet.name} />
      ))}
    </div>
  );
}
