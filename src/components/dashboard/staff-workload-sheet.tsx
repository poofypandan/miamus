"use client";

import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WORKLOAD_HORIZONS,
  useStaffWorkload,
  useWorkloadParam,
  type WorkloadHorizon,
} from "@/hooks/use-staff-workload";
import type { StaffWorkload } from "@/lib/data/types";

const HORIZON_LABELS: Record<WorkloadHorizon, string> = {
  today: "Today",
  "7d": "Last 7 Days",
  "30d": "Last 30 Days",
};

const SPAN_PHRASE: Record<WorkloadHorizon, string> = {
  today: "today",
  "7d": "in the last 7 days",
  "30d": "in the last 30 days",
};

/**
 * Staff Workload (Phase 116): who has actually been doing the work, dogs and
 * house together, over today, the last week or the last month.
 *
 * Counted by who completed each task, never by who it was assigned to — pet
 * routines have no assignee, and a chore one person was given and another
 * finished is the second person's work (migrations/100). Most productive
 * first.
 *
 * Owner-only: it lives on the owner dashboard, and the RPC behind it refuses
 * any caller who is not a household member, so a staff phone cannot total up
 * a colleague's week even by asking the database directly. English, per the
 * owner side of the language boundary.
 */
export function StaffWorkloadSheet() {
  const { horizon, setHorizon, close } = useWorkloadParam();
  const { rows, failed } = useStaffWorkload(horizon);
  const shown = horizon ?? "today";

  const { staff, unattributed, grandTotal, top } = useMemo(() => {
    const people = (rows ?? []).filter((r) => r.staffId !== null);
    const nobody = (rows ?? []).find((r) => r.staffId === null);
    return {
      staff: people,
      unattributed: nobody?.totalCompleted ?? 0,
      // The staff's own, so the "N more without a name" note below adds to
      // it rather than being counted twice.
      grandTotal: people.reduce((sum, r) => sum + r.totalCompleted, 0),
      top: Math.max(1, ...people.map((r) => r.totalCompleted)),
    };
  }, [rows]);

  return (
    <Sheet open={horizon !== null} onOpenChange={(next) => !next && close()}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Workload</SheetTitle>
          <SheetDescription>
            Tasks finished, counted by who completed them — pet routines and chores together.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SegmentedControl
            ariaLabel="Time span"
            segments={WORKLOAD_HORIZONS.map((value) => ({
              value,
              label: HORIZON_LABELS[value],
            }))}
            value={shown}
            onChange={setHorizon}
          />

          {rows === null && failed ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              Couldn&apos;t load the workload. Pull to refresh and try again.
            </p>
          ) : rows === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : staff.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="Nobody on the roster yet"
              description="Add people on the Access tab. Their finished tasks will be counted here."
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-gray-900 tabular-nums">{grandTotal}</span>{" "}
                {grandTotal === 1 ? "task" : "tasks"} finished {SPAN_PHRASE[shown]}
              </p>

              <ol className="flex flex-col gap-2">
                {staff.map((row) => (
                  <WorkloadRow key={row.staffId} row={row} top={top} />
                ))}
              </ol>

              {/* Said, not dropped: work logged on the owner's own phone, or
                  before staff had names, is real work that nobody's total
                  includes. */}
              {unattributed > 0 && (
                <p className="text-xs text-muted-foreground">
                  {unattributed} more {unattributed === 1 ? "task was" : "tasks were"} finished
                  without a name — logged before everyone had one on the roster.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function WorkloadRow({ row, top }: { row: StaffWorkload; top: number }) {
  const name = row.name ?? "";
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <li className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-gray-700"
        aria-hidden
      >
        {initials}
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          <span className="text-2xl leading-none font-bold tabular-nums">
            {row.totalCompleted}
          </span>
        </div>

        {/* Scaled to the busiest person, so the bars compare people as well
            as splitting each one's work. Grey for the dogs and amber for the
            house — the Agenda's own colours for the two. */}
        <div
          className="flex h-2 overflow-hidden rounded-full bg-muted"
          role="img"
          aria-label={`${row.petsCompleted} pet tasks, ${row.choresCompleted} chores`}
        >
          <span
            className="h-full bg-zinc-400"
            style={{ width: `${(row.petsCompleted / top) * 100}%` }}
          />
          <span
            className="h-full bg-amber-500"
            style={{ width: `${(row.choresCompleted / top) * 100}%` }}
          />
        </div>

        <span className="text-xs text-muted-foreground tabular-nums">
          🐕 {row.petsCompleted} {row.petsCompleted === 1 ? "Pet task" : "Pet tasks"} · 🧹{" "}
          {row.choresCompleted} {row.choresCompleted === 1 ? "Chore" : "Chores"}
        </span>
      </div>
    </li>
  );
}
