"use client";

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AgendaDay } from "@/hooks/use-agenda-week";
import { useHorizontalSwipe } from "@/hooks/use-horizontal-swipe";
import { useToday } from "@/hooks/use-today";
import { AGENDA_TONES, routineTone, type AgendaTone } from "@/lib/agenda-tones";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import type { ScheduleCategory } from "@/lib/schedule-categories";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";
import { hourOf, minutesOf } from "@/lib/week-grid";
import type { HouseholdTaskCategory } from "@/types/database";

// Geometry. An hour is at least 48px — room for one two-line block — and
// grows, across the whole week, when some day stacks more into it.
const HOUR_PX = 48;
const GUTTER_PX = 44;
// Seven columns this wide do not fit a phone, by design: the grid scrolls
// sideways, the way a calendar app's week does, rather than squeezing seven
// days into unreadable 45px slivers.
const COLUMN_MIN_PX = 96;
const HEADER_PX = 48;
// Anytime chores past this many in one day collapse into "+N", so one busy
// day cannot push the hours off the screen.
const ALL_DAY_VISIBLE = 3;
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const COPY = {
  en: {
    locale: "en-US",
    allDay: "All-day",
    more: (n: number) => `+${n} more`,
    medicines: (n: number) => `Medicines (${n})`,
    overdue: "Overdue",
  },
  id: {
    locale: "id-ID",
    allDay: "Kapan saja",
    more: (n: number) => `+${n} lagi`,
    medicines: (n: number) => `Obat & Vitamin (${n})`,
    overdue: "Terlambat",
  },
} as const;

// A glyph ahead of every title (Phase 114), so a block too narrow for its
// whole name still says what kind of job it is. Emoji rather than icons: they
// keep their meaning at 10px and on any of the three tones.
const ROUTINE_GLYPHS: Record<ScheduleCategory, string> = {
  medication: "💊",
  vet: "🩺",
  meal: "🍖",
  potty: "🐕",
  grooming: "🛁",
  temporary: "🐾",
};
const CHORE_GLYPHS: Record<HouseholdTaskCategory, string> = {
  cleaning: "🧹",
  maintenance: "🔧",
  errand: "📋",
  groceries: "🛒",
};
// Same tolerance as categoryIcon: a category this build has never seen still
// gets a mark.
const choreGlyph = (category: HouseholdTaskCategory) => CHORE_GLYPHS[category] ?? "📌";

interface GridEvent {
  key: string;
  time: string;
  glyph: string;
  title: string;
  tone: AgendaTone;
  done: boolean;
  onPress: () => void;
}

interface AllDayItem {
  key: string;
  title: string;
  glyph: string;
  overdue: boolean;
  done: boolean;
  onPress: () => void;
}

function hourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** Minutes past midnight, refreshed every minute — for the "now" line. */
function useMinuteOfDay(): number {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * The Agenda's Week view as a time grid (Phase 113): hours down the side, the
 * seven days across, every routine and chore a block at its time.
 *
 * Built like a calendar app's week, and for the same reason: a list grouped
 * by day says what is on, but only a grid shows when the day is crowded and
 * when it is free. The header and the "All-day" row stay pinned while the
 * hours scroll beneath them, and the hour gutter stays pinned while the days
 * scroll sideways.
 *
 * All-day is where anytime chores live — they have no hour to sit in — and,
 * on today, the overdue ones, which have an hour that has already passed.
 *
 * A block sits in the hour it starts in and fills it; nothing in the data
 * gives a duration, so an hour is what every task is drawn as. Several in one
 * hour stack top to bottom at full column width (Phase 114) instead of
 * splitting it side by side, which on a phone left each a sliver too narrow
 * for its title — and the hour grows, across all seven days, to fit them, so
 * the rows stay aligned with the gutter. No clock time inside a block: the
 * gutter already says it.
 *
 * Colours are the Agenda's three tones: red for a dog's health, grey for its
 * routine, amber for the house.
 */
export function AgendaWeekGrid({
  days,
  locale,
  onOpenDay,
  onChorePress,
  onShiftWeek,
}: {
  days: AgendaDay[];
  locale: "en" | "id";
  /** Opens a day in Day view — the header, routines, and (for staff) chores. */
  onOpenDay: (day: Date) => void;
  /** The owner's way into the chore editor. Omitted on staff phones. */
  onChorePress?: (occurrence: ChoreOccurrence) => void;
  /**
   * Turns the week (Phase 115): a swipe past the grid's own sideways scroll —
   * rightwards once Sunday is in view, leftwards once Saturday is.
   */
  onShiftWeek?: (weeks: -1 | 1) => void;
}) {
  const t = COPY[locale];
  const todayStr = formatDateLocal(useToday());
  const nowMinute = useMinuteOfDay();
  const scroller = useRef<HTMLDivElement>(null);

  const columns = useMemo(
    () =>
      days.map(({ date, day, entries }) => {
        const timed: GridEvent[] = [];
        const allDay: AllDayItem[] = [];
        const pressChore = (occurrence: ChoreOccurrence) => () =>
          onChorePress ? onChorePress(occurrence) : onOpenDay(day);

        for (const entry of entries) {
          if (entry.kind === "routine") {
            const { group } = entry;
            const consolidated = group.category === "medication" && group.titles.length > 1;
            timed.push({
              key: entry.key,
              time: group.time,
              glyph: ROUTINE_GLYPHS[group.category] ?? "🐾",
              title: consolidated ? t.medicines(group.titles.length) : group.title,
              tone: routineTone(group.category),
              done: group.items.length > 0 && group.items.every((i) => i.status === "completed"),
              onPress: () => onOpenDay(day),
            });
            continue;
          }
          const { occurrence } = entry;
          const done = occurrence.status === "completed";
          // Rolled over from an earlier day: its hour has passed, so it goes
          // to the top of today rather than back into a slot it missed.
          if (occurrence.overdue && !done) {
            allDay.push({
              key: entry.key,
              title: occurrence.task.title,
              glyph: choreGlyph(occurrence.task.category),
              overdue: true,
              done,
              onPress: pressChore(occurrence),
            });
          } else if (!occurrence.task.due_time) {
            allDay.push({
              key: entry.key,
              title: occurrence.task.title,
              glyph: choreGlyph(occurrence.task.category),
              overdue: false,
              done,
              onPress: pressChore(occurrence),
            });
          } else {
            timed.push({
              key: entry.key,
              time: occurrence.task.due_time,
              glyph: choreGlyph(occurrence.task.category),
              title: occurrence.task.title,
              tone: "chore",
              done,
              onPress: pressChore(occurrence),
            });
          }
        }

        // Overdue first, then open, then done: the order they need attention.
        allDay.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(a.done) - Number(b.done));
        // Bucketed by the hour each starts in, in clock order within it.
        const byHour: GridEvent[][] = HOURS.map(() => []);
        timed.sort((a, b) => minutesOf(a.time) - minutesOf(b.time));
        for (const event of timed) byHour[hourOf(event.time)].push(event);
        return { date, day, timed, allDay, byHour };
      }),
    [days, onChorePress, onOpenDay, t]
  );

  // Open on the morning's first block (an hour before it, for context), or
  // at 7 AM on an empty week — not at midnight, which is never where anyone
  // wants to start reading.
  //
  // Until the reader first touches the grid, not just once on mount: a new
  // week can mount before its chores have arrived (Today, or the arrows, ask
  // for a week that is not loaded yet), and when they land the pinned
  // All-day row grows over the hours it had just scrolled to. So it re-aims
  // whenever the days change — and stops for good at the first touch, wheel
  // or click, after which the scroll is theirs.
  const firstHour = useMemo(() => {
    const starts = columns.flatMap((c) => c.timed.map((e) => hourOf(e.time)));
    return starts.length > 0 ? Math.min(...starts) : 7;
  }, [columns]);
  const pinned = useRef<HTMLDivElement>(null);
  const touched = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (touched.current) return;
    // Sideways, to today's column when today is in this week — on a phone
    // the grid shows about three days, and they should be today's. Measured
    // against the gutter, which stays pinned over the left edge.
    const todayHeader = el?.querySelector<HTMLElement>(`[data-date="${todayStr}"]`);
    if (el && todayHeader) {
      el.scrollLeft += todayHeader.getBoundingClientRect().left - el.getBoundingClientRect().left - GUTTER_PX;
    }

    // Rows are no longer a fixed height, so the target is measured, not
    // multiplied: the hour's row, scrolled to just under the pinned rows.
    const row = el?.querySelector<HTMLElement>(
      `[data-hour="${Math.max(0, firstHour - 1)}"]`
    );
    if (!el || !row || !pinned.current) return;
    const under = pinned.current.getBoundingClientRect().bottom;
    // Less a few pixels, so the hour's label — centred on its line — clears
    // the pinned rows.
    el.scrollTop += row.getBoundingClientRect().top - under - 8;
  }, [columns, firstHour, todayStr]);

  const swipe = useHorizontalSwipe({
    onPrev: () => onShiftWeek?.(-1),
    onNext: () => onShiftWeek?.(1),
    allow: () => {
      const el = scroller.current;
      if (!el || !onShiftWeek) return { prev: false, next: false };
      return {
        prev: el.scrollLeft <= 1,
        next: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
      };
    },
  });

  const template = {
    gridTemplateColumns: `${GUTTER_PX}px repeat(${days.length}, minmax(${COLUMN_MIN_PX}px, 1fr))`,
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div
        ref={scroller}
        {...swipe}
        onTouchStart={(e) => {
          touched.current = true;
          swipe.onTouchStart(e);
        }}
        onWheel={() => (touched.current = true)}
        onPointerDown={() => (touched.current = true)}
        className="max-h-[68vh] overflow-auto overscroll-contain [scrollbar-width:thin]"
      >
        <div style={{ minWidth: GUTTER_PX + days.length * COLUMN_MIN_PX }}>
          {/* Day headers — pinned to the top. */}
          <div
            className="sticky top-0 z-30 grid border-b bg-card"
            style={{ ...template, height: HEADER_PX }}
          >
            <div className="sticky left-0 z-10 bg-card" />
            {columns.map(({ date, day }) => {
              const isToday = date === todayStr;
              return (
                <button
                  key={date}
                  type="button"
                  data-date={date}
                  onClick={() => onOpenDay(day)}
                  className="flex flex-col items-center justify-center gap-0.5 border-l"
                >
                  <span className="text-[10px] font-medium text-muted-foreground uppercase">
                    {day.toLocaleDateString(t.locale, { weekday: "short" })}
                  </span>
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                      isToday ? "bg-gray-900 text-white" : "text-gray-900"
                    )}
                  >
                    {day.getDate()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* All-day: anytime chores, and today's overdue — pinned under the
              headers. */}
          <div
            ref={pinned}
            className="sticky z-20 grid border-b bg-card"
            style={{ ...template, top: HEADER_PX }}
          >
            <div className="sticky left-0 z-10 flex items-start justify-end bg-card px-1 pt-1.5 text-right text-[9px] leading-tight font-medium text-muted-foreground">
              {t.allDay}
            </div>
            {columns.map(({ date, day, allDay }) => (
              <div key={date} className="flex min-h-8 min-w-0 flex-col gap-0.5 border-l p-1">
                {allDay.slice(0, ALL_DAY_VISIBLE).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.onPress}
                    title={item.title}
                    className={cn(
                      "flex h-6 min-w-0 items-center gap-1 rounded border-l-[3px] px-1 text-left text-[10px] font-medium",
                      item.overdue ? "border-l-red-500 bg-red-50 text-red-900" : AGENDA_TONES.chore.block,
                      item.done && "opacity-60"
                    )}
                  >
                    {item.overdue ? (
                      <AlertTriangle className="size-3 shrink-0" aria-label={t.overdue} />
                    ) : (
                      <span aria-hidden>{item.glyph}</span>
                    )}
                    <span className={cn("truncate", item.done && "opacity-70")}>{item.title}</span>
                  </button>
                ))}
                {allDay.length > ALL_DAY_VISIBLE && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    className="h-5 rounded px-1 text-left text-[10px] font-medium text-muted-foreground"
                  >
                    {t.more(allDay.length - ALL_DAY_VISIBLE)}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* The hours: one grid row per hour, each at least HOUR_PX and as
              tall as the busiest day needs. */}
          <div
            className="grid"
            style={{ ...template, gridAutoRows: `minmax(${HOUR_PX}px, auto)` }}
          >
            {HOURS.map((hour) => (
              <Fragment key={hour}>
                <div data-hour={hour} className="sticky left-0 z-10 bg-card">
                  {hour > 0 && (
                    <span className="absolute right-1 -translate-y-1/2 text-[9px] text-muted-foreground tabular-nums">
                      {hourLabel(hour)}
                    </span>
                  )}
                </div>
                {columns.map(({ date, byHour }) => {
                  const isToday = date === todayStr;
                  const showNow = isToday && Math.floor(nowMinute / 60) === hour;
                  return (
                    <div
                      key={date}
                      className={cn(
                        "relative flex min-w-0 flex-col gap-0.5 border-l p-0.5",
                        hour > 0 && "border-t",
                        isToday && "bg-muted/30"
                      )}
                    >
                      {byHour[hour].map((event) => (
                        <Block key={event.key} event={event} alone={byHour[hour].length === 1} />
                      ))}

                      {showNow && (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                          style={{ top: `${((nowMinute % 60) / 60) * 100}%` }}
                        >
                          <span className="-ml-1 size-2 rounded-full bg-gray-900" />
                          <span className="h-px flex-1 bg-gray-900" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ event, alone }: { event: GridEvent; alone: boolean }) {
  return (
    <button
      type="button"
      onClick={event.onPress}
      // The clock time stays for screen readers: they have no gutter to read.
      aria-label={`${formatTime12h(event.time)} ${event.title}`}
      className={cn(
        // Alone, a block fills its hour, as an hour-long event would. Stacked,
        // each takes its own height. Never stretched further: an hour made
        // taller by a busier day must not make a quiet day's block look long.
        "flex w-full items-start gap-0.5 overflow-hidden rounded-md border-l-[3px] px-1 py-0.5 text-left text-[10px] leading-tight",
        alone ? "min-h-[43px]" : "min-h-[22px]",
        AGENDA_TONES[event.tone].block,
        event.done && "opacity-60"
      )}
    >
      <span aria-hidden className="shrink-0">
        {event.done ? <CheckCircle2 className="mt-px size-2.5" /> : event.glyph}
      </span>
      <span
        className={cn("line-clamp-2 min-w-0 font-medium break-words", event.done && "opacity-70")}
      >
        {event.title}
      </span>
    </button>
  );
}
