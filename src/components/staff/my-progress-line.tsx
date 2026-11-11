"use client";

import { ClipboardList, PawPrint } from "lucide-react";
import { useStaffProgress } from "@/hooks/use-staff-progress";

/**
 * A staff phone's own progress (staff progress on Today): "Rumah 3/5 ·
 * Hewan 4/6", only the kinds this person has, only their own. Nobody else's
 * numbers ever reach this line; the owner's rows are on the owner's Today.
 *
 * Numbers and two words, no explanation (stop rule: no new reading for
 * staff). Always neutral: the cards below already show what is late or
 * couldn't be done, and a red bar on their own phone would read as a
 * telling-off; the colours are the owner's. Hidden on leave (the leave
 * banner says it), with nothing to count, and for a phone with no roster
 * row. Staff-facing, so Bahasa Indonesia.
 */
export function MyProgressLine({ staffId }: { staffId: string | null }) {
  const progress = useStaffProgress();
  const me = staffId ? progress?.people.find((p) => p.id === staffId) : null;
  if (!me || me.onLeave || (!me.house && !me.pets)) return null;

  return (
    <div
      role="group"
      aria-label="Progres Anda"
      data-testid="my-progress"
      className="flex items-center gap-4 rounded-xl border bg-card px-3 py-2 text-sm font-medium text-gray-900 tabular-nums"
    >
      {me.house && (
        <span className="flex items-center gap-1.5">
          <ClipboardList className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Rumah {me.house.done}/{me.house.total}
        </span>
      )}
      {me.pets && (
        <span className="flex items-center gap-1.5">
          <PawPrint className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          Hewan {me.pets.done}/{me.pets.total}
        </span>
      )}
    </div>
  );
}
