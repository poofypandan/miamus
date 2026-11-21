"use client";

import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";

/**
 * The way home from anywhere in the calendar (Phase 115): back to today, in
 * whichever view is showing — today's list in Day, this week in Week. In the
 * sticky header, so it is in reach however far the day or the weeks have
 * been scrolled.
 *
 * Always shown, rather than only once someone has wandered off: a button
 * that comes and goes moves the header around it, and tapping it on today
 * still does something useful — it scrolls the strip and the grid back to
 * now.
 */
export function TodayButton({ locale }: { locale: "en" | "id" }) {
  const { jumpToToday } = useHousehold();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={jumpToToday}
      // Icon only since Phase 153, to leave the header room for the
      // Overview | Staff switch; the label is still there for screen readers.
      // A plain round icon (21 Nov, PR 2), like the date ribbon's calendar,
      // so the header has one kind of shape beside the lifted pill.
      aria-label={locale === "en" ? "Today" : "Hari ini"}
      title={locale === "en" ? "Today" : "Hari ini"}
      className="size-11 shrink-0 rounded-full p-0 text-muted-foreground active:bg-muted"
    >
      <CalendarCheck className="size-5" />
    </Button>
  );
}
