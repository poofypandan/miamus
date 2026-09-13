"use client";

import { useEffect, useMemo, useRef } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_LABELS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

interface DateRibbonProps {
  value: Date;
  onChange: (date: Date) => void;
}

// Google Calendar-style day picker: a 2-week horizontal ribbon centered on
// `value`, plus a native date input (masked as a calendar icon button) for
// jumping months or years away instantly. Shared by the Owner Timeline
// (schedules page) and the Staff "Jadwal", both driven by the same global
// `selectedDate` in HouseholdContext.
export function DateRibbon({ value, onChange }: DateRibbonProps) {
  const today = useMemo(() => new Date(), []);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const days = useMemo(() => Array.from({ length: 15 }, (_, i) => addDays(value, i - 7)), [value]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [value]);

  return (
    <div className="flex items-center gap-2">
      <div
        data-no-swipe="true"
        className="flex flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {days.map((d) => {
          const isSelected = isSameDay(d, value);
          const isToday = isSameDay(d, today);
          return (
            <button
              key={d.toISOString()}
              ref={isSelected ? selectedRef : undefined}
              type="button"
              onClick={() => onChange(d)}
              className={cn(
                "flex min-h-[48px] min-w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border px-3 py-2 text-xs transition-colors",
                isSelected
                  ? "border-black bg-black text-white"
                  : isToday
                    ? "border-primary text-primary"
                    : "border-border bg-card text-foreground hover:bg-muted"
              )}
            >
              <span className="font-medium">{DAY_LABELS_ID[d.getDay()]}</span>
              <span className="text-lg font-semibold">{format(d, "d")}</span>
            </button>
          );
        })}
      </div>

      <label
        className="relative flex min-h-[48px] w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"
        aria-label="Jump to date"
      >
        <CalendarDays className="size-5" />
        <input
          type="date"
          value={format(value, "yyyy-MM-dd")}
          onChange={(e) => {
            if (!e.target.value) return;
            const [y, m, d] = e.target.value.split("-").map(Number);
            onChange(new Date(y, m - 1, d));
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
