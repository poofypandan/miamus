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
      variant="outline"
      size="sm"
      onClick={jumpToToday}
      className="min-h-9 shrink-0 gap-1.5 rounded-lg px-3"
    >
      <CalendarCheck className="size-4" />
      {locale === "en" ? "Today" : "Hari ini"}
    </Button>
  );
}
