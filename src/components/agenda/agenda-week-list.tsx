"use client";

import { ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ChoreTimelineRow } from "@/components/dashboard/chore-timeline-row";
import { TimelineRow } from "@/components/dashboard/timeline-row";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import type { AgendaDay } from "@/hooks/use-agenda-week";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import { dayLabel } from "@/lib/date-label";
import { cn } from "@/lib/utils";

const COPY = {
  en: {
    locale: "en-US",
    empty: "Nothing scheduled",
    count: (n: number) => `${n} item${n === 1 ? "" : "s"}`,
    open: (label: string) => `Open ${label} in Day view`,
  },
  id: {
    locale: "id-ID",
    empty: "Tidak ada jadwal",
    count: (n: number) => `${n} tugas`,
    open: (label: string) => `Buka ${label} di tampilan Hari`,
  },
} as const;

/**
 * The Agenda's Week view (Phase 112): seven days, one compact card each, in a
 * single vertical scroll. Each day is the same merge the Day view draws —
 * anytime chores on top, then the timed run — just in the dense timeline row
 * rather than the full card, so a week fits in a few thumb-flicks.
 *
 * A week is for planning; doing happens in Day view. So each day's header
 * opens that day there, and on a staff phone that is also the only way in —
 * the rows here are read-only, because logging a feed or proving a chore
 * belongs on the full card with its camera and its undo.
 */
export function AgendaWeekList({
  days,
  locale,
  onOpenDay,
  onChorePress,
  assigneeName,
  readOnly = false,
}: {
  days: AgendaDay[];
  locale: "en" | "id";
  onOpenDay: (day: Date) => void;
  /** The owner's way into the chore editor. Omitted on staff phones. */
  onChorePress?: (occurrence: ChoreOccurrence) => void;
  assigneeName: (occurrence: ChoreOccurrence) => string | null;
  /** Avatars as plain pictures — the staff view mounts no pet profile. */
  readOnly?: boolean;
}) {
  const { pets } = useHousehold();
  const today = useToday();
  const t = COPY[locale];

  return (
    <div className="flex flex-col gap-4">
      {days.map(({ date, day, entries }) => {
        const relative = dayLabel(day, today, locale);
        const weekday = day.toLocaleDateString(t.locale, { weekday: "long" });
        const full = day.toLocaleDateString(t.locale, { day: "numeric", month: "short" });
        // "Today · Friday 2 Oct", or just "Monday 5 Oct" once it is far
        // enough out that the relative word is the date itself.
        const heading = relative === full ? `${weekday} ${full}` : `${relative} · ${weekday} ${full}`;
        const isToday = relative === dayLabel(today, today, locale);

        return (
          <section key={date} className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onOpenDay(day)}
              aria-label={t.open(heading)}
              className="flex min-h-[36px] items-center justify-between gap-2 text-left"
            >
              <span
                className={cn(
                  "text-sm font-semibold",
                  isToday ? "text-gray-900" : "text-gray-700"
                )}
              >
                {heading}
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted-foreground">
                {entries.length > 0 && t.count(entries.length)}
                <ChevronRight className="size-4" />
              </span>
            </button>

            {entries.length === 0 ? (
              <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">
                {t.empty}
              </p>
            ) : (
              <Card className="gap-3 py-3">
                <CardContent className="flex flex-col gap-1.5 px-3">
                  {entries.map((entry) =>
                    entry.kind === "routine" ? (
                      <TimelineRow
                        key={entry.key}
                        group={entry.group}
                        pets={pets}
                        locale={locale}
                        readOnly={readOnly}
                      />
                    ) : (
                      <ChoreTimelineRow
                        key={entry.key}
                        occurrence={entry.occurrence}
                        assigneeName={assigneeName(entry.occurrence)}
                        locale={locale}
                        // Without an editor to open, a chore row takes you to
                        // its day — where the staff card can claim and prove it.
                        onPress={() =>
                          onChorePress ? onChorePress(entry.occurrence) : onOpenDay(day)
                        }
                      />
                    )
                  )}
                </CardContent>
              </Card>
            )}
          </section>
        );
      })}
    </div>
  );
}
