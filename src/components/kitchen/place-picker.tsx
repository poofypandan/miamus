"use client";

import { Archive, Refrigerator, Snowflake, Utensils } from "lucide-react";
import { FOOD_PLACES, FOOD_PLACE_LABELS, type FoodLocale } from "@/lib/food";
import { cn } from "@/lib/utils";
import type { FoodPlace } from "@/types/database";

const PLACE_ICONS: Record<FoodPlace, typeof Refrigerator> = {
  fridge: Refrigerator,
  freezer: Snowflake,
  pantry: Archive,
  counter: Utensils,
};

/**
 * Where something is kept, as four buttons (Phase 176; plan section 5b):
 * Fridge, Freezer, Cupboard, Counter, the current one outlined. A tap calls
 * `onChange`; the caller saves (at once, in the ingredient and food sheets).
 * The same look as the food form's own picker, which keeps its copy for now.
 * Shared by owner and staff screens: staff screens pass locale "id".
 */
export function PlacePicker({
  value,
  onChange,
  locale,
  disabled = false,
  legend,
}: {
  value: FoodPlace;
  onChange: (place: FoodPlace) => void;
  locale: FoodLocale;
  disabled?: boolean;
  /** Defaults to "Where is it kept?" / "Disimpan di mana?". */
  legend?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">
        {legend ?? (locale === "id" ? "Disimpan di mana?" : "Where is it kept?")}
      </legend>
      <div className="grid grid-cols-4 gap-2">
        {FOOD_PLACES.map((place) => {
          const Icon = PLACE_ICONS[place];
          const on = value === place;
          return (
            <button
              key={place}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (!on) onChange(place);
              }}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-1 text-xs font-medium disabled:opacity-50",
                on ? "border-2 border-primary text-foreground" : "text-gray-700 active:bg-muted"
              )}
            >
              <Icon className="size-5" strokeWidth={on ? 2.25 : 1.75} aria-hidden />
              {FOOD_PLACE_LABELS[locale][place]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
