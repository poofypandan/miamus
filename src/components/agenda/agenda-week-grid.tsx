"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { AgendaDay } from "@/hooks/use-agenda-week";
import { useToday } from "@/hooks/use-today";
import { AGENDA_TONES, routineTone, type AgendaTone } from "@/lib/agenda-tones";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";
import { layoutLanes, spanAt, type LanePlacement } from "@/lib/week-grid";

// Geometry. An hour is 48px — tall enough for a two-line block at the default
// one-hour length, short enough that a working morning fits on a phone.
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

interface GridEvent {
  key: string;
  time: string;
  title: string;
  tone: AgendaTone;
  done: boolean;
  onPress: () => void;
}

interface AllDayItem {
  key: string;
  title: string;
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
 * Blocks run an hour unless something says otherwise; nothing in the data
 * does yet, so every block is an hour. Blocks that overlap share the column
 * side by side (lib/week-grid).
 *
 * Colours are the Agenda's three tones: red for a dog's health, grey for its
 * routine, amber for the house.
 */
export function AgendaWeekGrid({
  days,
  locale,
  onOpenDay,
  onChorePress,
}: {
  days: AgendaDay[];
  locale: "en" | "id";
  /** Opens a day in Day view — the header, routines, and (for staff) chores. */
  onOpenDay: (day: Date) => void;
  /** The owner's way into the chore editor. Omitted on staff phones. */
  onChorePress?: (occurrence: ChoreOccurrence) => void;
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
              overdue: true,
              done,
              onPress: pressChore(occurrence),
            });
          } else if (!occurrence.task.due_time) {
            allDay.push({
              key: entry.key,
              title: occurrence.task.title,
              overdue: false,
              done,
              onPress: pressChore(occurrence),
            });
          } else {
            timed.push({
              key: entry.key,
              time: occurrence.task.due_time,
              title: occurrence.task.title,
              tone: "chore",
              done,
              onPress: pressChore(occurrence),
            });
          }
        }

        // Overdue first, then open, then done: the order they need attention.
        allDay.sort((a, b) => Number(b.overdue) - Number(a.overdue) || Number(a.done) - Number(b.done));
        const lanes = layoutLanes(timed.map((e) => spanAt(e.key, e.time)));
        return { date, day, timed, allDay, lanes };
      }),
    [days, onChorePress, onOpenDay, t]
  );

  // Open on the morning's first block (an hour before it, for context), or
  // at 7 AM on an empty week — not at midnight, which is never where anyone
  // wants to start reading. Once, on mount: after that the scroll is theirs.
  const firstMinute = useMemo(() => {
    const starts = columns.flatMap((c) => c.timed.map((e) => spanAt(e.key, e.time).start));
    return starts.length > 0 ? Math.min(...starts) : 7 * 60;
  }, [columns]);
  const firstMinuteRef = useRef(firstMinute);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = Math.max(0, (firstMinuteRef.current / 60 - 1) * HOUR_PX);
  }, []);

  const template = {
    gridTemplateColumns: `${GUTTER_PX}px repeat(${days.length}, minmax(${COLUMN_MIN_PX}px, 1fr))`,
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div
        ref={scroller}
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
                    {item.overdue && (
                      <AlertTriangle className="size-3 shrink-0" aria-label={t.overdue} />
                    )}
                    <span className={cn("truncate", item.done && "line-through")}>{item.title}</span>
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

          {/* The hours. */}
          <div className="grid" style={template}>
            <div className="sticky left-0 z-10 bg-card" style={{ height: 24 * HOUR_PX }}>
              {HOURS.map((hour) =>
                hour === 0 ? null : (
                  <span
                    key={hour}
                    className="absolute right-1 -translate-y-1/2 text-[9px] text-muted-foreground tabular-nums"
                    style={{ top: hour * HOUR_PX }}
                  >
                    {hourLabel(hour)}
                  </span>
                )
              )}
            </div>

            {columns.map(({ date, timed, lanes }) => (
              <div
                key={date}
                className={cn("relative border-l", date === todayStr && "bg-muted/30")}
                style={{
                  height: 24 * HOUR_PX,
                  // Hour rules as one painted background rather than 24
                  // elements per column.
                  backgroundImage: `repeating-linear-gradient(to bottom, var(--color-border) 0 1px, transparent 1px ${HOUR_PX}px)`,
                }}
              >
                {timed.map((event) => (
                  <Block key={event.key} event={event} placement={lanes.get(event.key)} />
                ))}

                {date === todayStr && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                    style={{ top: (nowMinute / 60) * HOUR_PX }}
                  >
                    <span className="-ml-1 size-2 rounded-full bg-gray-900" />
                    <span className="h-px flex-1 bg-gray-900" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Block({ event, placement }: { event: GridEvent; placement?: LanePlacement }) {
  const span = spanAt(event.key, event.time);
  const lane = placement?.lane ?? 0;
  const lanes = placement?.lanes ?? 1;
  const time = formatTime12h(event.time);
  return (
    <button
      type="button"
      onClick={event.onPress}
      aria-label={`${time} ${event.title}`}
      className={cn(
        "absolute flex flex-col overflow-hidden rounded-md border-l-[3px] px-1 py-0.5 text-left text-[10px] leading-tight",
        AGENDA_TONES[event.tone].block,
        event.done && "opacity-60"
      )}
      style={{
        top: (span.start / 60) * HOUR_PX + 1,
        height: Math.max(((span.end - span.start) / 60) * HOUR_PX - 2, 18),
        left: `calc(${(lane / lanes) * 100}% + 2px)`,
        width: `calc(${100 / lanes}% - 4px)`,
      }}
    >
      <span className="flex items-center gap-0.5 font-semibold tabular-nums opacity-80">
        {time}
        {event.done && <CheckCircle2 className="size-2.5 shrink-0" />}
      </span>
      <span className={cn("line-clamp-2 font-medium break-words", event.done && "line-through")}>
        {event.title}
      </span>
    </button>
  );
}
