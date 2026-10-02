"use client";

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Rounds away float noise: 0.1 + 0.2 shows as 0.3, not 0.30000000000000004. */
const tidy = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A `-` / `+` counter with the number itself typeable, because a tray of 30
 * eggs is thirty taps otherwise. Never goes below zero.
 *
 * Used by the Indonesian stock check, so the button labels are passed in
 * rather than written here.
 */
export function NumberStepper({
  label,
  value,
  onChange,
  disabled,
  decrementLabel,
  incrementLabel,
  step = 1,
  decimal = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  decrementLabel: string;
  incrementLabel: string;
  /** How far one tap moves the count — 100 for grams and millilitres. */
  step?: number;
  /** Accept 2.5 as well as 2, for things counted by the kilo or litre. */
  decimal?: boolean;
}) {
  // What is in the box, which is not always a number yet: "2." on the way to
  // "2.5" must survive the keystroke. Re-synced whenever the value changes
  // from outside the input (a tap of - or +).
  const [text, setText] = useState(String(value));
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setText(String(value));
  }

  function typed(raw: string) {
    const cleaned = decimal
      ? raw.replace(",", ".").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1")
      : raw.replace(/\D/g, "");
    setText(cleaned);
    const parsed = Number(cleaned);
    const next = cleaned === "" || Number.isNaN(parsed) ? 0 : parsed;
    setSynced(next);
    onChange(next);
  }

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
          onClick={() => onChange(tidy(Math.max(0, value - step)))}
          aria-label={decrementLabel}
        >
          <Minus />
        </Button>
        <input
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          value={text}
          disabled={disabled}
          onFocus={(e) => e.target.select()}
          onChange={(e) => typed(e.target.value)}
          aria-label={label}
          className="h-11 w-full min-w-0 rounded-md border bg-background text-center text-base font-semibold tabular-nums"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          disabled={disabled}
          onClick={() => onChange(tidy(value + step))}
          aria-label={incrementLabel}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
