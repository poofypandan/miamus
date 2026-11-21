"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One option in a row of content filters — narrowing what a list shows, as
 * opposed to SegmentedControl, which moves between views. The Pets tab's
 * photo categories, and the Agenda's All | Pets | Chores (Phase 134), which
 * moved here from beside Day | Week so both lists filter the same way.
 */
export function FilterPill({
  label,
  icon: Icon,
  count,
  active,
  onClick,
}: {
  label: string;
  icon?: LucideIcon;
  /** Left out where a count would only be another number (the Kitchen's shelves). */
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        // Lifted paper when chosen, the warm track colour when not (21 Nov,
        // the visual direction's PR 2): black is for the action only.
        "press flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold",
        active
          ? "bg-card text-foreground shadow-[0_1px_2px_rgb(60_40_20/0.1),0_3px_8px_-3px_rgb(60_40_20/0.14)]"
          : "bg-muted text-muted-foreground active:bg-muted/70"
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" />}
      {label}
      {count !== undefined && (
        <span className={cn("text-xs tabular-nums", active ? "text-muted-foreground" : "text-subtle-foreground")}>
          {count}
        </span>
      )}
    </button>
  );
}
