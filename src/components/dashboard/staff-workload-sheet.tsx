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
import type { OwnerLocale } from "@/lib/owner-locale";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";

const HORIZON_LABELS: Record<OwnerLocale, Record<WorkloadHorizon, string>> = {
  en: { today: "Today", "7d": "Last 7 Days", "30d": "Last 30 Days" },
  id: { today: "Hari Ini", "7d": "7 Hari Terakhir", "30d": "30 Hari Terakhir" },
};

const SPAN_PHRASE: Record<OwnerLocale, Record<WorkloadHorizon, string>> = {
  en: { today: "today", "7d": "in the last 7 days", "30d": "in the last 30 days" },
  id: { today: "hari ini", "7d": "dalam 7 hari terakhir", "30d": "dalam 30 hari terakhir" },
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
 * a colleague's week even by asking the database directly. In the owner's
 * language (Phase 149).
 */
export function StaffWorkloadSheet() {
  const { horizon, setHorizon, close } = useWorkloadParam();
  const { rows, failed } = useStaffWorkload(horizon);
  const shown = horizon ?? "today";
  const locale = useOwnerLocale();
  const t = useT();

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
          <SheetTitle>{t("Workload", "Beban Kerja")}</SheetTitle>
          <SheetDescription>
            {t(
              "Tasks finished, counted by who completed them — pet routines and chores together.",
              "Tugas yang selesai, dihitung menurut siapa yang menyelesaikannya — rutinitas hewan dan tugas rumah digabung."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <SegmentedControl
            ariaLabel={t("Time span", "Rentang waktu")}
            segments={WORKLOAD_HORIZONS.map((value) => ({
              value,
              label: HORIZON_LABELS[locale][value],
            }))}
            value={shown}
            onChange={setHorizon}
          />

          {rows === null && failed ? (
            <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
              {t(
                "Couldn't load the workload. Pull to refresh and try again.",
                "Beban kerja gagal dimuat. Tarik untuk memuat ulang lalu coba lagi."
              )}
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
              title={t("Nobody on the roster yet", "Belum ada orang di daftar")}
              description={t(
                "Add people on the Access tab. Their finished tasks will be counted here.",
                "Tambahkan orang di tab Akses. Tugas yang mereka selesaikan akan dihitung di sini."
              )}
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-gray-900 tabular-nums">{grandTotal}</span>{" "}
                {t(grandTotal === 1 ? "task" : "tasks", "tugas")} {t("finished", "selesai")}{" "}
                {SPAN_PHRASE[locale][shown]}
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
                  {t(
                    `${unattributed} more ${unattributed === 1 ? "task was" : "tasks were"} finished without a name — logged before everyone had one on the roster.`,
                    `${unattributed} tugas lain selesai tanpa nama — dicatat sebelum semua orang ada di daftar.`
                  )}
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
  const t = useT();
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
          aria-label={t(
            `${row.petsCompleted} pet tasks, ${row.choresCompleted} chores`,
            `${row.petsCompleted} tugas hewan, ${row.choresCompleted} tugas rumah`
          )}
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
          🐕 {row.petsCompleted}{" "}
          {row.petsCompleted === 1 ? t("Pet task", "Tugas hewan") : t("Pet tasks", "Tugas hewan")} · 🧹{" "}
          {row.choresCompleted}{" "}
          {row.choresCompleted === 1 ? t("Chore", "Tugas rumah") : t("Chores", "Tugas rumah")}
        </span>
      </div>
    </li>
  );
}
