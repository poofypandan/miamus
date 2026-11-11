"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * An on/off switch (role="switch"), the one the notification settings use
 * for owners and staff alike. `busy` swaps the knob for a spinner or any
 * other node while a change is saving.
 */
export function Switch({
  on,
  label,
  disabled,
  onToggle,
  busy,
  className,
}: {
  on: boolean;
  label: string;
  disabled?: boolean;
  onToggle: () => void;
  busy?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative flex h-7 w-12 shrink-0 items-center rounded-full disabled:opacity-50",
        on ? "bg-primary" : "bg-muted",
        className
      )}
    >
      {busy ?? (
        <span
          className={cn(
            "size-6 rounded-full bg-white shadow-sm transition-transform",
            on ? "translate-x-[22px]" : "translate-x-0.5"
          )}
        />
      )}
    </button>
  );
}
