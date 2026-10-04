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
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium",
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-zinc-100 text-zinc-600 active:bg-zinc-200"
      )}
    >
      {Icon && <Icon className="size-3.5 shrink-0" />}
      {label}
      <span className={cn("text-xs tabular-nums", active ? "text-white/70" : "text-zinc-400")}>
        {count}
      </span>
    </button>
  );
}
