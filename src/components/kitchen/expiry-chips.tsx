"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { EXPIRY_CHOICES, addDaysTo, type FoodLocale } from "@/lib/food";
import { cn } from "@/lib/utils";

/**
 * A use-by date in one tap (Phase 176; plan section 5b): Today, Tomorrow,
 * 3 days, 1 week, Pick a date, No date. A chip calls `onChange` with its date
 * (or null); "Pick a date" only shows the date field, and `onChange` runs
 * once a date is chosen, so no date is ever written that nobody gave. The
 * chip matching `value` is selected; a date no chip matches shows as Pick a
 * date with the field open. The same look as the food form's chips, which
 * keeps its copy for now. Shared by owner and staff screens: staff screens
 * pass locale "id".
 */
export function ExpiryChips({
  value,
  onChange,
  today,
  locale,
  disabled = false,
  legend,
}: {
  /** YYYY-MM-DD, or null for no date. */
  value: string | null;
  onChange: (date: string | null) => void;
  /** The phone's calendar day, YYYY-MM-DD (useToday + formatDateLocal). */
  today: string;
  locale: FoodLocale;
  disabled?: boolean;
  /** Defaults to "Expires" / "Kedaluwarsa". */
  legend?: string;
}) {
  const id = locale === "id";
  const [picking, setPicking] = useState(false);
  const matchesChip = value !== null && EXPIRY_CHOICES.some((c) => addDaysTo(today, c.days) === value);
  const showPicker = picking || (value !== null && !matchesChip);

  function choose(date: string | null) {
    setPicking(false);
    if (date !== value) onChange(date);
  }

  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-sm font-medium">{legend ?? (id ? "Kedaluwarsa" : "Expires")}</legend>
      <div className="flex flex-wrap gap-2">
        {EXPIRY_CHOICES.map((choice) => {
          const date = addDaysTo(today, choice.days);
          return (
            <Chip key={choice.days} on={!showPicker && value === date} onClick={() => choose(date)}>
              {choice.label[locale]}
            </Chip>
          );
        })}
        <Chip on={showPicker} onClick={() => setPicking(true)}>
          {id ? "Pilih tanggal" : "Pick a date"}
        </Chip>
        <Chip on={!showPicker && value === null} onClick={() => choose(null)}>
          {id ? "Tidak ada" : "No date"}
        </Chip>
      </div>
      {showPicker && (
        <Input
          type="date"
          aria-label={id ? "Tanggal kedaluwarsa" : "Expiry date"}
          value={value ?? ""}
          onChange={(e) => {
            // Cleared: nothing is saved; No date is the way to remove one.
            if (e.target.value && e.target.value !== value) onChange(e.target.value);
          }}
          className="mt-1 min-h-12 rounded-xl"
        />
      )}
    </fieldset>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-10 rounded-full border px-3.5 text-sm disabled:opacity-50",
        on ? "border-primary bg-primary text-primary-foreground" : "text-gray-700 active:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
