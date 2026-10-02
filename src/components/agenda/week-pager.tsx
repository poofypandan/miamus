"use client";

import { addDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { useToday } from "@/hooks/use-today";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { AGENDA_WEEK_DAYS, weekStartOf } from "@/lib/unified-agenda";

const COPY = {
  en: { locale: "en-US", prev: "Previous week", next: "Next week", thisWeek: "This week" },
  id: { locale: "id-ID", prev: "Minggu sebelumnya", next: "Minggu berikutnya", thisWeek: "Minggu ini" },
} as const;

/**
 * The Week view's title and its way to the next and previous weeks (Phase
 * 115), in place of the date strip, which the grid's own day headers made
 * redundant: "Sep 27 – Oct 3" between two arrows, as a calendar app titles a
 * week. Endless both ways — the arrows only move the selected day by seven.
 *
 * The bar itself also takes a swipe, which is the easiest place on a phone to
 * flick the week without the grid's sideways scroll getting in the way.
 */
export function WeekPager({
  date,
  locale,
  onShift,
}: {
  /** Any day of the week shown. */
  date: Date;
  locale: "en" | "id";
  /** -1 for the week before, 1 for the week after. */
  onShift: (weeks: -1 | 1) => void;
}) {
  const t = COPY[locale];
  const start = weekStartOf(date);
  const end = addDays(start, AGENDA_WEEK_DAYS - 1);
  const today = useToday();
  const isThisWeek = formatDateLocal(weekStartOf(today)) === formatDateLocal(start);
  const swipe = useHorizontalSwipe({ onPrev: () => onShift(-1), onNext: () => onShift(1) });

  // The year only when the week is not all this year's, and on both ends
  // only when it crosses New Year.
  const year = today.getFullYear();
  const withYear = start.getFullYear() !== year || end.getFullYear() !== year;
  const fmt = (d: Date, showYear: boolean) =>
    d.toLocaleDateString(t.locale, {
      month: "short",
      day: "numeric",
      ...(showYear ? { year: "numeric" } : {}),
    });
  const label = `${fmt(start, withYear && start.getFullYear() !== end.getFullYear())} – ${fmt(end, withYear)}`;

  return (
    <div className="flex items-center gap-2" {...swipe}>
      <Button
        variant="outline"
        size="icon"
        className="size-11 shrink-0 rounded-lg"
        aria-label={t.prev}
        onClick={() => onShift(-1)}
      >
        <ChevronLeft />
      </Button>
      <div className="flex min-w-0 flex-1 flex-col items-center" aria-live="polite">
        <h2 className="truncate text-sm font-semibold text-gray-900 tabular-nums">{label}</h2>
        {isThisWeek && <span className="text-[11px] text-muted-foreground">{t.thisWeek}</span>}
      </div>
      <Button
        variant="outline"
        size="icon"
        className="size-11 shrink-0 rounded-lg"
        aria-label={t.next}
        onClick={() => onShift(1)}
      >
        <ChevronRight />
      </Button>
    </div>
  );
}
