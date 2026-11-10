"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleSlash,
  Lightbulb,
  PawPrint,
  ShoppingBasket,
} from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { OwnerCouldntSheet } from "@/components/agenda/owner-couldnt-sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useTaskExceptions } from "@/hooks/use-task-exceptions";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useFormatTime } from "@/components/ui/ui-labels";
import { applyLeaveTriage, formatLeaveRange, leaveApprovalPath } from "@/lib/leave";
import { expandChores, type ChoreOccurrence } from "@/lib/chore-recurrence";
import { buildAgenda, formatDateLocal } from "@/lib/scheduleEngine";
import { buildEveningSummary, ownerReasonLabel, type SummaryRow } from "@/lib/couldnt-do";
import { isAdmitted } from "@/lib/pets";
import { cn } from "@/lib/utils";
import { dataProvider } from "@/lib/data";
import { weekStartOf } from "@/lib/unified-agenda";
import { Skeleton } from "@/components/ui/skeleton";
import type { HouseholdTask } from "@/types/database";

/**
 * The evening summary (Phase 165, D7 A): what couldn't be done, what isn't
 * done yet, what waits for an admin, the shopping line, and how much got
 * done. Opened by the evening push (?summary=YYYY-MM-DD) or Today's quiet
 * line; read-only, each row opening what it is about.
 *
 * Owner-facing, in the owner's language. Its open state is the URL's, so
 * Back and a reload agree with what's on screen (CLAUDE.md).
 */
export function EveningSummarySheet({
  date,
  onClose,
  onOpenChore,
  toBuy,
  toBuyHref,
  onToBuy,
}: {
  /** The day summarised; null = closed. */
  date: string | null;
  onClose: () => void;
  /** A chore row: the owner's own handling (editor, or its couldn't-do sheet). */
  onOpenChore: (occurrence: ChoreOccurrence) => void;
  toBuy: number;
  toBuyHref: string;
  onToBuy: (event: React.MouseEvent) => void;
}) {
  const open = date !== null;
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-t-2xl">
        {date && (
          <SummaryBody
            date={date}
            onOpenChore={(occurrence) => {
              onClose();
              onOpenChore(occurrence);
            }}
            toBuy={toBuy}
            toBuyHref={toBuyHref}
            onToBuy={(event) => {
              onClose();
              onToBuy(event);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function SummaryBody({
  date,
  onOpenChore,
  toBuy,
  toBuyHref,
  onToBuy,
}: {
  date: string;
  onOpenChore: (occurrence: ChoreOccurrence) => void;
  toBuy: number;
  toBuyHref: string;
  onToBuy: (event: React.MouseEvent) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const formatTime = useFormatTime();
  const { householdTasks, leaveRequests, pets, schedules, logs, routineProposals, selectedDate } = useHousehold();
  const { exceptions } = useTaskExceptions();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const today = useToday();
  const todayKey = formatDateLocal(today);
  const [routineOpen, setRoutineOpen] = useState<SummaryRow | null>(null);
  // Today's "due by now" moves with the clock while the sheet is open.
  const clock = useMinuteClock(date === todayKey);

  // The day's own chores (Codex, PR #71): the household holds only the week
  // on screen, and the push may open this on another week. Read for the day,
  // with the household's copy laid over it (fresher for this phone's saves).
  const inWeek =
    formatDateLocal(weekStartOf(new Date(`${date}T00:00:00`))) === formatDateLocal(weekStartOf(selectedDate));
  const [dayRows, setDayRows] = useState<{ date: string; rows: HouseholdTask[] | "failed" } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    dataProvider
      .listHouseholdTasks(date, date, todayKey)
      .then((rows) => live && setDayRows({ date, rows }))
      .catch((err) => {
        // Not "nothing to do" (Codex, PR #71): said so, with Try again.
        console.warn("Summary chores not loaded", err);
        if (live) setDayRows({ date, rows: "failed" });
      });
    return () => {
      live = false;
    };
  }, [date, todayKey, attempt]);
  const fetched = dayRows?.date === date && dayRows.rows !== "failed" ? dayRows.rows : null;
  const failed = dayRows?.date === date && dayRows.rows === "failed" && !inWeek;
  const rows = useMemo(() => {
    if (!fetched) return inWeek ? householdTasks : null;
    const byId = new Map(fetched.map((row) => [row.id, row] as const));
    if (inWeek) for (const row of householdTasks) byId.set(row.id, row);
    return [...byId.values()];
  }, [fetched, inWeek, householdTasks]);

  const summary = useMemo(() => {
    if (!rows) return null;
    const now = new Date(clock);
    return buildEveningSummary({
      date,
      chores: applyLeaveTriage(expandChores({ rows, date, today: todayKey }), leaveRequests),
      groups: buildAgenda({ date, entities: pets, schedules, logs, now }),
      exceptions,
      leaves: leaveRequests,
      proposals: routineProposals,
      admittedIds: new Set(pets.filter(isAdmitted).map((p) => p.id)),
      logs,
      // Today: due by now, as the push counts. An earlier day: all of it.
      untilMinutes: date === todayKey ? now.getHours() * 60 + now.getMinutes() : null,
    });
  }, [date, clock, rows, todayKey, leaveRequests, pets, schedules, logs, exceptions, routineProposals]);

  const heading = new Date(`${date}T00:00:00`).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  if (failed) {
    return (
      <div className="flex flex-col items-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          {t("Couldn't load this day's tasks.", "Tugas hari itu gagal dimuat.")}
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="min-h-11 rounded-xl border px-4 text-sm font-medium active:bg-muted"
        >
          {t("Try again", "Coba lagi")}
        </button>
      </div>
    );
  }
  if (!summary) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-1/2 self-center" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    );
  }
  const nothing =
    summary.couldnt.length === 0 && summary.notDone.length === 0 && summary.leaves.length === 0 && summary.suggestions === 0;

  function rowTitle(row: SummaryRow) {
    return row.kind === "routine" && row.petName ? `${row.title} · ${row.petName}` : row.title;
  }

  function openRow(row: SummaryRow) {
    if (row.occurrence) onOpenChore(row.occurrence);
    else if (row.exception) setRoutineOpen(row);
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-center">{t("Not done today", "Belum selesai hari ini")}</SheetTitle>
        <SheetDescription className="text-center">{heading}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]" data-testid="evening-summary">
        {nothing && (
          <p className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm font-medium text-emerald-800">
            <CheckCircle2 className="size-4" aria-hidden /> {t("Everything is done.", "Semua sudah selesai.")}
          </p>
        )}

        {summary.couldnt.length > 0 && (
          <Section label={t("Couldn't be done", "Tidak bisa dikerjakan")} count={summary.couldnt.length}>
            {summary.couldnt.map((row) => (
              <RowButton key={row.key} onClick={() => openRow(row)} tone="amber">
                <CircleSlash className="size-4 shrink-0 text-amber-700" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{rowTitle(row)}</span>
                  <span className="text-xs text-gray-700">
                    {[
                      row.exception ? ownerReasonLabel(row.exception.reason, locale, row.medicine) : null,
                      row.exception?.staff_id ? staffName(row.exception.staff_id) : null,
                      row.exception ? formatTime(new Date(row.exception.created_at)) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    {row.exception?.note ? ` · “${row.exception.note.slice(0, 40)}${row.exception.note.length > 40 ? "…" : ""}”` : ""}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </RowButton>
            ))}
          </Section>
        )}

        {summary.notDone.length > 0 && (
          <Section label={t("Not done yet", "Belum dikerjakan")} count={summary.notDone.length}>
            {summary.notDone.map((row) => (
              <RowButton key={row.key} onClick={row.occurrence ? () => openRow(row) : undefined}>
                {row.kind === "routine" ? (
                  <PawPrint className="size-4 shrink-0 text-zinc-500" aria-hidden />
                ) : (
                  <Circle className="size-4 shrink-0 text-zinc-400" aria-hidden />
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{rowTitle(row)}</span>
                  <span className="text-xs text-muted-foreground">
                    {[
                      row.time ? formatTime(row.time) : t("Anytime", "Kapan saja"),
                      row.kind === "chore" ? (row.staffId ? staffName(row.staffId) : t("Anyone", "Siapa saja")) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {row.occurrence && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              </RowButton>
            ))}
          </Section>
        )}

        {(summary.leaves.length > 0 || summary.suggestions > 0) && (
          <Section label={t("Waiting for you", "Menunggu Anda")} count={summary.leaves.length + summary.suggestions}>
            {summary.leaves.map((leave) => (
              <Link
                key={leave.id}
                href={leaveApprovalPath(leave.id)}
                className="flex min-h-13 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm active:bg-muted"
              >
                <CalendarDays className="size-4 shrink-0 text-zinc-500" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    {t(`${staffName(leave.staff_id)}'s leave`, `Cuti ${staffName(leave.staff_id)}`)}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatLeaveRange(leave, locale)}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            ))}
            {summary.suggestions > 0 && (
              <div className="flex min-h-13 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm">
                <Lightbulb className="size-4 shrink-0 text-zinc-500" aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium">
                    {summary.suggestions === 1
                      ? t("1 schedule suggestion", "1 usulan jadwal")
                      : t(`${summary.suggestions} schedule suggestions`, `${summary.suggestions} usulan jadwal`)}
                  </span>
                  <span className="text-xs text-muted-foreground">{t("At the top of Today", "Di atas Hari ini")}</span>
                </span>
              </div>
            )}
          </Section>
        )}

        {toBuy > 0 && date === todayKey && (
          <Section label={t("To buy", "Perlu dibeli")} count={toBuy}>
            <Link
              href={toBuyHref}
              scroll={false}
              onClick={onToBuy}
              className="flex min-h-13 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm active:bg-muted"
            >
              <ShoppingBasket className="size-4 shrink-0 text-zinc-500" aria-hidden />
              <span className="flex-1 font-medium">
                {t(`${toBuy} thing${toBuy === 1 ? "" : "s"} to buy`, `${toBuy} barang perlu dibeli`)}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
          </Section>
        )}

        {summary.done > 0 && (
          <p className="flex items-center justify-center gap-1.5 pt-1 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="size-4" aria-hidden />
            {t(`${summary.done} done today`, `${summary.done} selesai hari ini`)}
          </p>
        )}
      </div>

      <OwnerCouldntSheet
        open={!!routineOpen}
        onOpenChange={(next) => !next && setRoutineOpen(null)}
        title={routineOpen ? rowTitle(routineOpen) : ""}
        subtitle={routineOpen?.time ? formatTime(routineOpen.time) : null}
        entries={
          routineOpen?.exception
            ? [{ exception: routineOpen.exception, petName: routineOpen.petName, medicine: routineOpen.medicine }]
            : []
        }
      />
    </>
  );
}

function Section({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-800">
        {label} <span className="font-normal text-muted-foreground">{count}</span>
      </h4>
      {children}
    </section>
  );
}

function RowButton({
  onClick,
  tone,
  children,
}: {
  onClick?: () => void;
  tone?: "amber";
  children: React.ReactNode;
}) {
  const className = cn(
    "flex min-h-13 w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm",
    tone === "amber" ? "border-amber-300 bg-amber-50" : "bg-card",
    onClick && "active:bg-muted"
  );
  if (!onClick) return <div className={className}>{children}</div>;
  return (
    <button type="button" onClick={onClick} className={className}>
      {children}
    </button>
  );
}
