"use client";

import { useMemo } from "react";
import { HealthRecordCard } from "@/components/dashboard/health-record-card";
import { useHousehold } from "@/context/household-context";

export function UnifiedHealthList() {
  const { pets, medicalRecords } = useHousehold();
  const petById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);

  const records = useMemo(
    () =>
      medicalRecords
        .filter((r) => petById.has(r.entity_id))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [medicalRecords, petById]
  );

  if (records.length === 0) {
    return <p className="pt-8 text-center text-sm text-muted-foreground">No health records yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {records.map((record) => {
        const pet = petById.get(record.entity_id);
        return (
          <HealthRecordCard
            key={record.id}
            record={record}
            dogName={pet?.name ?? "Unknown"}
            pet={pet}
          />
        );
      })}
    </div>
  );
}
