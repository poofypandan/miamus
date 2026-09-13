"use client";

import { ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { UnifiedHealthList } from "@/components/dashboard/unified-health-list";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { useHousehold } from "@/context/household-context";
import { useRequireOwner } from "@/hooks/use-require-owner";

export function HealthTab() {
  const { pets, setActivePetId, loading } = useHousehold();
  const isOwner = useRequireOwner();

  if (!isOwner) return null;

  if (loading) {
    return (
      <div className="-mt-2 flex flex-col gap-4">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className="-mt-2 flex flex-col gap-4">
        <p className="pt-8 text-center text-sm text-muted-foreground">
          No pets yet. Add a pet above to start their health passport.
        </p>
      </div>
    );
  }

  return (
    <div className="-mt-2 flex flex-col gap-4">
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
