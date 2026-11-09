"use client";

import { useMemo, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { MAX_SPOT_LENGTH, cleanSpot, sameSpot, spotsUsed } from "@/lib/room-picker";
import { cn } from "@/lib/utils";

/**
 * "Spot (optional)": the part of the room a chore is for — the sink in a
 * bathroom, the AC in a bedroom (Phase 158 PR B2; migrations/129's
 * household_tasks.spot). Shown once a room is chosen, as chips of the spots
 * already used there plus "+ New spot". Tapping the chosen chip again
 * clears it: no spot means the whole room, as before.
 */
export function SpotField({
  value,
  onChange,
  placeIds,
}: {
  value: string | null;
  onChange: (spot: string | null) => void;
  /** The chosen room(s): their spots become the chips. */
  placeIds: string[];
}) {
  const { householdTasks } = useHousehold();
  const t = useT();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");

  const used = useMemo(() => spotsUsed(householdTasks, placeIds), [householdTasks, placeIds]);
  // A spot typed just now (or on a chore whose room has no other) is a chip too.
  const chips = value && !used.some((spot) => sameSpot(spot, value)) ? [value, ...used] : used;

  function addDraft() {
    const spot = cleanSpot(draft);
    if (spot) onChange(spot);
    setDraft("");
    setTyping(false);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Spot", "Bagian")}>
        {chips.map((spot) => {
          const on = sameSpot(spot, value);
          return (
            <button
              key={spot.toLowerCase()}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? null : spot)}
              className={cn(
                "flex min-h-[40px] items-center gap-1 rounded-full border px-3 text-sm",
                on ? "border-amber-700 bg-amber-50 font-medium text-amber-900" : "bg-background active:bg-muted"
              )}
            >
              {on && <Check className="size-3.5" />}
              {spot}
            </button>
          );
        })}
        {!typing && (
          <button
            type="button"
            onClick={() => setTyping(true)}
            className="flex min-h-[40px] items-center gap-1 rounded-full border border-dashed px-3 text-sm text-primary active:bg-muted"
          >
            <Plus className="size-3.5" /> {t("New spot", "Bagian baru")}
          </button>
        )}
      </div>
      {typing && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={draft}
            maxLength={MAX_SPOT_LENGTH}
            aria-label={t("New spot", "Bagian baru")}
            placeholder={t("e.g. Sink", "mis. Wastafel")}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Never submits the dialog from under a half-typed spot.
                e.preventDefault();
                addDraft();
              }
            }}
            onBlur={addDraft}
            className="min-h-[44px] min-w-0 flex-1"
          />
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        {t(
          "For one thing in the room, like the sink. Leave empty for the whole room.",
          "Untuk satu bagian ruangan, misalnya wastafel. Kosongkan untuk seluruh ruangan."
        )}
      </p>
    </div>
  );
}
