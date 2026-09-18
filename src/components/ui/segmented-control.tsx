"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Optional trailing count, e.g. how many stock checks are due. */
  badge?: ReactNode;
}

/**
 * An iOS-style two-or-more-way switch: a shaded track with the active option
 * lifted out as a primary-coloured pill. Used where one screen holds two
 * unrelated jobs (chores vs. inventory) that should never be on screen at once.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex w-full gap-1 rounded-full bg-muted p-1", className)}
    >
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              "flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground active:bg-background/60"
            )}
          >
            {segment.label}
            {segment.badge != null && (
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-background text-foreground"
                )}
              >
                {segment.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
