"use client";

import { useMemo, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { HealthRecordCard } from "@/components/dashboard/health-record-card";
import { HealthUploadDialog } from "@/components/dashboard/health-upload-dialog";
import { useHousehold } from "@/context/household-context";
import { cn } from "@/lib/utils";

export default function HealthPage() {
  const { entities, medicalRecords, loading } = useHousehold();
  const [filter, setFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    const records =
      filter === "all" ? medicalRecords : medicalRecords.filter((r) => r.entity_id === filter);
    return [...records].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [medicalRecords, filter]);

  const entityById = new Map(entities.map((e) => [e.id, e]));

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Health Passport</h1>
        <HealthUploadDialog defaultEntityId={filter !== "all" ? filter : undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        {entities.map((e) => (
          <FilterChip
            key={e.id}
            label={e.name}
            active={filter === e.id}
            onClick={() => setFilter(e.id)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="pt-8 text-center text-sm text-muted-foreground">No health records yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((record) => (
            <HealthRecordCard
              key={record.id}
              record={record}
              dogName={entityById.get(record.entity_id)?.name ?? "Unknown"}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-foreground hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}
