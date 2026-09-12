"use client";

import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthRecordCard } from "@/components/dashboard/health-record-card";
import { HealthUploadDialog } from "@/components/dashboard/health-upload-dialog";
import { useHousehold } from "@/context/household-context";

export default function HealthPage() {
  const { pets, medicalRecords, activePetId, loading } = useHousehold();
  const activePet = pets.find((p) => p.id === activePetId) ?? null;

  const filtered = useMemo(() => {
    if (!activePet) return [];
    return [...medicalRecords]
      .filter((r) => r.entity_id === activePet.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [medicalRecords, activePet]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (!activePet) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">Health Passport</h1>
        <p className="pt-8 text-center text-sm text-muted-foreground">
          {pets.length === 0
            ? "No pets yet. Add a pet above to start their health passport."
            : "Select a pet above to view their health passport."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Health Passport</h1>
        <HealthUploadDialog entityId={activePet.id} />
      </div>

      {filtered.length === 0 ? (
        <p className="pt-8 text-center text-sm text-muted-foreground">No health records yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((record) => (
            <HealthRecordCard key={record.id} record={record} dogName={activePet.name} />
          ))}
        </div>
      )}
    </div>
  );
}
