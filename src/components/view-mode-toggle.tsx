"use client";

import { cn } from "@/lib/utils";
import type { ViewMode } from "@/lib/week-agenda";

const COPY = {
  en: { day: "Day", week: "Week", label: "View mode" },
  id: { day: "Harian", week: "Mingguan", label: "Mode tampilan" },
} as const;

// Segmented Day/Week control. Locale-driven rather than forked so the owner
// dashboard stays English and the staff view stays Bahasa Indonesia from one
// component — the Phase 46 language boundary.
export function ViewModeToggle({
  value,
  onChange,
  locale,
  className,
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  locale: "en" | "id";
  className?: string;
}) {
  const t = COPY[locale];

  return (
    <div
      role="group"
      aria-label={t.label}
      className={cn("flex shrink-0 gap-0.5 rounded-lg bg-gray-100 p-0.5", className)}
    >
      {(["day", "week"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={cn(
            "min-h-[32px] rounded-md px-3 text-xs font-medium transition-colors",
            value === mode ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          )}
        >
          {t[mode]}
        </button>
      ))}
    </div>
  );
}
