"use client";

import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";

interface DateStripProps {
  value: string; // "YYYY-MM-DD"
  onChange: (date: string) => void;
}

const DAY_LABELS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function DateStrip({ value, onChange }: DateStripProps) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - 3 + i);
    return d;
  });
  const todayIso = formatDateLocal(today);

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {days.map((d) => {
        const iso = formatDateLocal(d);
        const isSelected = iso === value;
        const isToday = iso === todayIso;
        return (
          <button
            key={iso}
            type="button"
            onClick={() => onChange(iso)}
            className={cn(
              "flex min-w-14 shrink-0 flex-col items-center gap-0.5 rounded-xl border px-3 py-2 text-xs transition-colors",
              isSelected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted"
            )}
          >
            <span className="font-medium">{isToday ? "Hari Ini" : DAY_LABELS_ID[d.getDay()]}</span>
            <span className="text-lg font-semibold">{d.getDate()}</span>
          </button>
        );
      })}
    </div>
  );
}
