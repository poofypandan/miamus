"use client";

import { useEffect, useMemo, useRef } from "react";
import { addDays, format, isSameDay } from "date-fns";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

const DAY_LABELS_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

interface DateRibbonProps {
  value: Date;
  onChange: (date: Date) => void;
  // Any change to this re-runs the centering. The owner dashboard keeps both
  // tab panels mounted at once, so arriving on the Schedule tab neither
  // remounts this component nor changes `value` — without a nudge, a ribbon
  // the user had scrolled sideways stays exactly where they left it.
  recenterKey?: string | number;
}

// Google Calendar-style day picker: a 2-week horizontal ribbon centered on
// `value`, plus a native date input (masked as a calendar icon button) for
// jumping months or years away instantly. Shared by the Owner Timeline
// (schedules page) and the Staff "Jadwal", both driven by the same global
// `selectedDate` in HouseholdContext.
export function DateRibbon({ value, onChange, recenterKey }: DateRibbonProps) {
  const today = useMemo(() => new Date(), []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const days = useMemo(() => Array.from({ length: 15 }, (_, i) => addDays(value, i - 7)), [value]);

  useEffect(() => {
    // Deliberately not Element.scrollIntoView() — on the Owner Dashboard,
    // this ribbon sits inside the swipeable tab canvas, which keeps the
    // whole page positioned via a CSS transform on an overflow-x:hidden
    // ancestor. Calling scrollIntoView() on a descendant of that ancestor
    // corrupts its hit-testing (confirmed live: dragging the canvas stops
    // registering pointer events afterward), in every `behavior` mode, not
    // just "smooth". Setting scrollLeft directly gets the same "center the
    // selected day" result without going through that API.
    const btn = selectedRef.current;
    const container = scrollRef.current;
    if (!btn || !container) return;

    // Measured with rects rather than offsetLeft. offsetLeft is relative to
    // the nearest *positioned* ancestor, which here is the carousel wrapper,
    // not this scroll box — so on the Schedule tab it silently included the
    // 420px that the second panel sits into the w-[200%] track, overshooting
    // by a whole panel width and pinning the ribbon at its maximum scroll.
    // The delta between two rects inside the same transformed subtree is
    // unaffected by that transform, so this stays correct while the canvas is
    // mid-swipe or parked off-screen.
    const btnRect = btn.getBoundingClientRect();
    const boxRect = container.getBoundingClientRect();
    const delta = btnRect.left + btnRect.width / 2 - (boxRect.left + boxRect.width / 2);
    container.scrollLeft += delta;
  }, [value, recenterKey]);

  return (
    <div className="flex items-center gap-2">
      <div
        ref={scrollRef}
        data-no-swipe="true"
        onPointerDownCapture={(e) => e.stopPropagation()}
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
