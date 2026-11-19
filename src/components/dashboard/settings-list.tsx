"use client";

import type { ComponentType, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * The Settings tab's list rows (Phase 155), shared by its list
 * (staff-tab.tsx) and the pages that list things the same way, like How
 * Miamus works (Phase 180 H2).
 */

/** A rounded group of rows, like a section of iPhone Settings (Phase 155). */
export function SettingsGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">{children}</div>;
}

export function SettingsRow({
  icon: Icon,
  label,
  detail,
  waiting = false,
  wrap = false,
  onPress,
}: {
  /** Optional: a plain list (How Miamus works) has none. */
  icon?: ComponentType<{ className?: string }>;
  label: string;
  detail?: string;
  /** Amber: something is waiting for the owner (Phase 153 colour rule). */
  waiting?: boolean;
  /** A label that may run to two lines (a guide entry's title) wraps instead of being cut. */
  wrap?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`flex min-h-[52px] items-center gap-3 px-4 text-left text-sm active:bg-muted${wrap ? " py-3" : ""}`}
    >
      {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" />}
      <span className={`min-w-0 flex-1 font-medium text-gray-900 ${wrap ? "leading-snug" : "truncate"}`}>{label}</span>
      {detail && (
        <span className={waiting ? "text-xs font-medium text-amber-700" : "text-xs text-muted-foreground"}>
          {detail}
        </span>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
