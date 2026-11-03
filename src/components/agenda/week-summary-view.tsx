"use client";

import { useId, useMemo, type ReactNode } from "react";
import { Check, ChevronDown, Clock, X } from "lucide-react";
import { useHousehold } from "@/context/household-context";
import type { AgendaDay } from "@/hooks/use-agenda-week";
import { leaveCovering } from "@/lib/leave";
import { isEntryDone, type UnifiedAgendaEntry } from "@/lib/unified-agenda";
import { cn } from "@/lib/utils";
import {
  groupRhythmRows,
  summarizeWeek,
  type DaySummary,
  type RhythmCell,
  type RhythmRow,
} from "@/lib/week-summary";

/**
 * The owner's Week view (Phase 143): a summary of the week, not a calendar.
 *
 * It replaced a 24-hour time grid that drew every routine as a block — ~250
 * of them a week, nearly all one of three titles repeated for four dogs every
 * day. See lib/week-summary.ts for the measurement and the rule. Top to
 * bottom it answers, in order:
 *
 *   1. Which day went wrong?          the seven-day strip
 *   2. Did the routine actually run?  "Every day" — one line, opening to the
 *                                     matrix. Above the list on purpose: it is
 *                                     the week's single most telling number,
 *                                     and below forty chore cards nobody
 *                                     scrolled far enough to read it.
 *   3. What's on beyond the routine?  this week's chores and appointments
 *
 * The list applies the same rule as the whole view. A past day's finished
 * work needs nobody, so it folds to one line ("8 done"); what was missed on
 * that day stays out in full. Today and the days ahead are shown whole.
 *
 * Rows in (3) are the Day view's own rows, so a chore behaves identically
 * wherever it is tapped. Owner-facing, so English.
 */
export function WeekSummaryView({
  days,
  today,
  staffName,
  renderEntry,
  onOpenDay,
  rhythmOpen,
  onRhythmOpenChange,
}: {
  days: AgendaDay[];
  today: string;
  staffName: (id: string | null | undefined) => string;
  renderEntry: (entry: UnifiedAgendaEntry) => ReactNode;
  onOpenDay: (day: Date) => void;
  /** Held by the tab, so paging weeks does not fold the matrix back up. */
  rhythmOpen: boolean;
  onRhythmOpenChange: (open: boolean) => void;
}) {
  const { schedules, leaveRequests } = useHousehold();
  const summary = useMemo(
    () => summarizeWeek({ days, today, schedules }),
    [days, today, schedules]
  );
  const dateOf = useMemo(() => new Map(days.map((d) => [d.date, d.day])), [days]);

  // Who is away each day, for the strip.
  const awayByDate = useMemo(() => {
    const staffIds = [...new Set(leaveRequests.map((l) => l.staff_id))];
    return new Map(
      days.map((d) => [
        d.date,
        staffIds.filter((id) => leaveCovering(leaveRequests, id, d.date)).map(staffName),
      ])
    );
  }, [days, leaveRequests, staffName]);

  return (
    <div className="flex flex-col gap-5">
      <WeekStrip
        days={summary.days}
        dateOf={dateOf}
        awayByDate={awayByDate}
        onOpenDay={onOpenDay}
      />

      {summary.rhythm.length > 0 && (
        <RhythmSection
          rows={summary.rhythm}
          days={summary.days}
          dateOf={dateOf}
          totals={summary.rhythmTotals}
          open={rhythmOpen}
          onOpenChange={onRhythmOpenChange}
        />
      )}

      <section className="flex flex-col gap-3" aria-labelledby="week-beyond-title">
        <div className="flex flex-col gap-0.5">
          {/* Not "This week": the pager above already says that. */}
          <h2 id="week-beyond-title" className="text-sm font-semibold text-gray-900">
            Chores &amp; appointments
          </h2>
          <p className="text-xs text-muted-foreground">
            Everything that isn&apos;t the same every day.
          </p>
        </div>

        {summary.beyond.length === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
            Nothing beyond the daily routine this week.
          </p>
        ) : (
          summary.beyond.map(({ date, entries }) => {
            const day = dateOf.get(date)!;
            const past = date < today;
            // A past day's finished work folds away; what it missed does not.
            const shown = past ? entries.filter((e) => !isEntryDone(e)) : entries;
            const folded = past ? entries.length - shown.length : 0;
            return (
              <div key={date} className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => onOpenDay(day)}
                  className="flex min-h-[32px] items-center gap-2 self-start rounded-lg text-left text-xs font-medium text-gray-500 active:text-gray-900"
                >
                  {day.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  {date === today && (
                    <span className="rounded-full bg-gray-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                      Today
                    </span>
                  )}
                  {folded > 0 && (
                    <span className="flex items-center gap-1 text-emerald-700">
                      <Check className="size-3.5" />
                      {shown.length === 0 ? `All ${folded} done` : `${folded} done`}
                    </span>
                  )}
                </button>
                {shown.length > 0 && (
                  <div className="flex flex-col gap-2">{shown.map(renderEntry)}</div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

// --- 1. The strip -----------------------------------------------------------

function WeekStrip({
  days,
  dateOf,
  awayByDate,
  onOpenDay,
}: {
  days: DaySummary[];
  dateOf: Map<string, Date>;
  awayByDate: Map<string, string[]>;
  onOpenDay: (day: Date) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1" role="list" aria-label="This week, day by day">
      {days.map((d) => {
        const day = dateOf.get(d.date)!;
        const away = awayByDate.get(d.date) ?? [];
        const allDone = d.total > 0 && d.done === d.total;
        const pct = d.total > 0 ? (d.done / d.total) * 100 : 0;
        const weekday = day.toLocaleDateString("en-US", { weekday: "short" });
        const label = [
          day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
          d.when === "future"
            ? `${d.total} planned`
            : `${d.done} of ${d.total} done`,
          d.missed > 0 && (d.when === "past" ? `${d.missed} missed` : `${d.missed} late`),
          away.length > 0 && `${away.join(", ")} away`,
        ]
          .filter(Boolean)
          .join(", ");

        return (
          <button
            key={d.date}
            type="button"
            role="listitem"
            onClick={() => onOpenDay(day)}
            aria-label={label}
            className={cn(
              "flex min-h-[84px] flex-col items-center gap-1 rounded-xl border px-0.5 py-2 active:bg-muted",
              d.when === "today" ? "border-gray-900" : "border-border bg-card"
            )}
          >
            <span className="text-[10px] font-medium uppercase text-muted-foreground">
              {weekday}
            </span>
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                d.when === "today" && "bg-gray-900 text-white"
              )}
            >
              {day.getDate()}
            </span>
            {/* Done-ness, not load: a full bar is a day nobody needs to look at. */}
            <span className="h-1 w-full max-w-8 overflow-hidden rounded-full bg-muted">
              {d.when !== "future" && (
                <span
                  className={cn(
                    "block h-full rounded-full",
                    allDone ? "bg-emerald-500" : d.missed > 0 && d.when === "past" ? "bg-red-400" : "bg-gray-400"
                  )}
                  style={{ width: `${pct}%` }}
                />
              )}
            </span>
            <span
              className={cn(
                "text-[10px] font-medium tabular-nums",
                d.when === "future"
                  ? "text-muted-foreground"
                  : allDone
                    ? "text-emerald-700"
                    : d.missed > 0
                      ? d.when === "past"
                        ? "text-red-700"
                        : "text-amber-700"
                      : "text-gray-600"
              )}
            >
              {d.when === "future" ? "·" : allDone ? <Check className="size-3" /> : `${d.done}/${d.total}`}
            </span>
            {away.length > 0 && (
              <span className="text-[9px] font-medium text-red-700">{away.length} away</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- 2. The every-day matrix ------------------------------------------------

const RHYTHM_NOUNS: Record<RhythmRow["category"], string> = {
  medication: "medicine",
  meal: "meals",
  potty: "potty",
  chore: "daily chores",
  // Never reached: these never land in the rhythm. Listed so the record is total.
  vet: "vet",
  grooming: "grooming",
  temporary: "other",
};

function joinNouns(nouns: string[]): string {
  if (nouns.length <= 1) return nouns.join("");
  return `${nouns.slice(0, -1).join(", ")} & ${nouns[nouns.length - 1]}`;
}

function RhythmSection({
  rows,
  days,
  dateOf,
  totals,
  open,
  onOpenChange,
}: {
  rows: RhythmRow[];
  days: DaySummary[];
  dateOf: Map<string, Date>;
  totals: { due: number; done: number; missed: number; late: number; perDay: number };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const bodyId = useId();
  const nouns = joinNouns(
    (["meal", "potty", "medication", "chore"] as const)
      .filter((c) => rows.some((r) => r.category === c))
      .map((c) => RHYTHM_NOUNS[c])
  );
  const groups = groupRhythmRows(rows);

  return (
    <section
      aria-label="Every day"
      className="flex flex-col gap-2 rounded-xl border bg-card p-2"
    >
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-[48px] items-center gap-2 rounded-lg px-1 text-left active:bg-muted"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-gray-900">Every day</span>
          <span className="text-xs text-muted-foreground">
            {nouns.charAt(0).toUpperCase() + nouns.slice(1)} · {totals.perDay} a day
          </span>
          {totals.due > 0 && (
            <span className="mt-0.5 text-xs font-medium">
              <span
                className={totals.done === totals.due ? "text-emerald-700" : "text-gray-700"}
              >
                {totals.done} of {totals.due} done
              </span>
              {totals.missed > 0 && <span className="text-red-700"> · {totals.missed} missed</span>}
              {totals.late > 0 && <span className="text-amber-700"> · {totals.late} late</span>}
            </span>
          )}
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          {open ? "Hide" : "Show"}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        // A real table: it is tabular data, and a screen reader should be able
        // to say "Mocha, Pipis & Pup, Tuesday: 6 of 8".
        <table id={bodyId} className="w-full table-fixed border-separate border-spacing-y-0.5">
          <colgroup>
            <col />
            {days.map((d) => (
              <col key={d.date} className="w-9" />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="sr-only">
                Task
              </th>
              {days.map((d) => {
                const day = dateOf.get(d.date)!;
                return (
                  <th
                    key={d.date}
                    scope="col"
                    className={cn(
                      "pb-1 text-center text-[10px] font-medium",
                      d.when === "today" ? "text-gray-900" : "text-muted-foreground"
                    )}
                  >
                    <abbr
                      title={day.toLocaleDateString("en-US", { weekday: "long" })}
                      className="no-underline"
                    >
                      {day.toLocaleDateString("en-US", { weekday: "narrow" })}
                    </abbr>
                  </th>
                );
              })}
            </tr>
          </thead>
          {groups.map((g) => (
            <tbody key={g.group}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={days.length + 1}
                  className="px-1 pt-2 pb-0.5 text-left text-xs font-semibold text-gray-900"
                >
                  {g.group}
                </th>
              </tr>
              {g.rows.map((row) => (
                <tr key={row.key}>
                  <th
                    scope="row"
                    className="truncate px-1 text-left text-xs font-normal text-gray-700"
                    title={row.title}
                  >
                    {row.title}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={days[i].date}
                      className={cn(
                        "h-7 text-center",
                        days[i].when === "today" && "rounded-md bg-muted/60"
                      )}
                    >
                      <Cell cell={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
    </section>
  );
}

function Cell({ cell }: { cell: RhythmCell | null }) {
  if (!cell) return <span className="sr-only">Not scheduled</span>;
  const words = `${cell.done} of ${cell.total} done`;
  switch (cell.state) {
    case "done":
      return (
        <Check className="mx-auto size-3.5 text-emerald-600" aria-label={words} />
      );
    case "upcoming":
      return (
        <span className="text-xs text-muted-foreground/60" aria-label="Upcoming">
          ·
        </span>
      );
    case "missed":
    case "late":
    case "partial": {
      const tone =
        cell.state === "missed"
          ? "text-red-700"
          : cell.state === "late"
            ? "text-amber-700"
            : "text-gray-500";
      const label = `${words}${cell.state === "missed" ? `, ${cell.missed} missed` : cell.state === "late" ? `, ${cell.missed} late` : ""}`;
      // One slot a day reads better as a mark than as "0/1".
      if (cell.total === 1 && cell.state !== "partial") {
        const Icon = cell.state === "missed" ? X : Clock;
        return <Icon className={cn("mx-auto size-3.5", tone)} aria-label={label} />;
      }
      if (cell.total === 1) {
        return (
          <span className="text-xs text-muted-foreground/60" aria-label={label}>
            ·
          </span>
        );
      }
      return (
        <span className={cn("text-[11px] font-semibold tabular-nums", tone)} aria-label={label}>
          {cell.done}/{cell.total}
        </span>
      );
    }
  }
}
