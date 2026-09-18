"use client";

import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A `-` / `+` counter with the number itself typeable, because a tray of 30
 * eggs is thirty taps otherwise. Never goes below zero.
 *
 * Shared by the Indonesian stock check and the English receive-stock dialog,
 * so the button labels are passed in rather than written here.
 */
export function NumberStepper({
  label,
  value,
  onChange,
  disabled,
  decrementLabel,
  incrementLabel,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  decrementLabel: string;
  incrementLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={disabled || value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
          aria-label={decrementLabel}
        >
          <Minus />
        </Button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            const parsed = parseInt(e.target.value.replace(/\D/g, ""), 10);
            onChange(Number.isNaN(parsed) ? 0 : parsed);
          }}
          aria-label={label}
          className="h-11 w-full min-w-0 rounded-md border bg-background text-center text-base font-semibold tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={disabled}
          onClick={() => onChange(value + 1)}
          aria-label={incrementLabel}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
