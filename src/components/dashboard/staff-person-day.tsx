"use client";

import { CheckCircle2, ChevronLeft, Circle, CircleSlash, ClipboardList, Clock, PawPrint } from "lucide-react";
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useFormatTime } from "@/components/ui/ui-labels";
import {
  KindCounts,
  TONE_ROW,
  TONE_TEXT,
  usePersonLine,
} from "@/components/dashboard/staff-progress-card";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useStaffProgress } from "@/hooks/use-staff-progress";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { ANYONE_PERSON } from "@/hooks/use-staff-workload";
import { useToday } from "@/hooks/use-today";
import { ownerReasonLabel } from "@/lib/couldnt-do";
import { dayLabel } from "@/lib/date-label";
import type { ProgressTask, ProgressTone } from "@/lib/staff-progress";
import { cn } from "@/lib/utils";

/**
 * One person's whole day, house and pets (staff progress on Today): what the
 * Who did what sheet shows after a tap on their row. Read only; the tasks
 * themselves are edited from Today's list as before.
 *
 * `personId` is a roster id, or ANYONE_PERSON for what nobody owns and nobody
 * has done yet. Owner-facing, in the owner's language.
 */
export function StaffPersonDay({ personId, onBack }: { personId: string; onBack: () => void }) {
  const t = useT();
  const locale = useOwnerLocale();
  const { petsOn } = useHouseholdProfile();
  const progress = useStaffProgress({ petsOn });
  const { selectedDate } = useHousehold();
  const today = useToday();
  const label = dayLabel(selectedDate, today, locale);
  const personLine = usePersonLine();

  const { profiles } = useStaffProfiles();
  const anyone = personId === ANYONE_PERSON;
  const person = anyone ? null : (progress?.people.find((p) => p.id === personId) ?? null);
  // An admin with nothing on this day has no progress row, but is still here.
  const onRoster = anyone || !!person || (profiles ?? []).some((p) => p.id === personId);
  const title = anyone
    ? t("Anyone, not done yet", "Siapa saja, belum dikerjakan")
    : (person?.name ?? profiles?.find((p) => p.id === personId)?.name ?? "");
  const tasks = anyone ? (progress?.anyone?.tasks ?? []) : (person?.tasks ?? []);

  return (
    <>
      <SheetHeader>
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex min-h-9 w-fit items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-muted-foreground active:bg-muted"
        >
          <ChevronLeft className="size-3.5" /> {t("Everyone", "Semua orang")}
        </button>
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>
          {person ? `${label} · ${personLine(person)}` : label}
        </SheetDescription>
      </SheetHeader>

      <div
        className="flex flex-col gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        data-testid="staff-person-day"
      >
        {progress === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full rounded-xl" />
            <Skeleton className="h-14 w-full rounded-xl" />
          </div>
        ) : !onRoster ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t("This person is no longer on the roster.", "Orang ini sudah tidak ada di daftar.")}
          </p>
        ) : tasks.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {anyone
              ? t("Nothing waiting for anyone.", "Tidak ada yang menunggu.")
              : t("No tasks on this day.", "Tidak ada tugas hari ini.")}
          </p>
        ) : (
          <>
            {person && !person.onLeave && (person.house || person.pets) && (
              <KindCounts
                house={person.house}
                pets={person.pets}
                houseLabel={t("House", "Rumah")}
                petsLabel={t("Pets", "Hewan")}
                className="text-sm font-medium text-gray-900"
              />
            )}
            <ol className="flex flex-col gap-2">
              {tasks.map((task) => (
                <TaskRow key={task.key} task={task} ownerId={person?.id ?? null} />
              ))}
            </ol>
          </>
        )}
      </div>
    </>
  );
}

function TaskRow({ task, ownerId }: { task: ProgressTask; ownerId: string | null }) {
  const t = useT();
  const locale = useOwnerLocale();
  const time = useFormatTime();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));

  const tone: ProgressTone = task.late ? "red" : task.state === "couldnt" ? "amber" : "neutral";
  const title = task.kind === "routine" && task.petName ? `${task.title} · ${task.petName}` : task.title;
  const when = task.time ? time(task.time) : t("Anytime", "Kapan saja");
  const doneAt =
    task.state !== "done"
      ? null
      : task.kind === "routine"
        ? (task.item?.log?.completed_at ?? null)
        : (task.occurrence?.task.completed_at ?? null);
  // Someone else did this person's task: said, since the row is theirs.
  const by = task.doneBy && task.doneBy !== ownerId ? staffName(task.doneBy) : null;

  const status =
    task.state === "done"
      ? [doneAt ? t(`Done ${time(new Date(doneAt))}`, `Selesai ${time(new Date(doneAt))}`) : t("Done", "Selesai"), by]
          .filter(Boolean)
          .join(" · ")
      : task.state === "couldnt" && task.exception
        ? [
            t("Couldn't", "Tidak bisa"),
            ownerReasonLabel(task.exception.reason, locale, task.medicine),
            task.exception.staff_id && task.exception.staff_id !== ownerId ? staffName(task.exception.staff_id) : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : task.carried
          ? t("From an earlier day", "Dari hari sebelumnya")
          : task.late
            ? t("Late", "Terlambat")
            : t("Not yet", "Belum");

  const Icon = task.kind === "routine" ? PawPrint : ClipboardList;
  const StateIcon =
    task.state === "done" ? CheckCircle2 : task.state === "couldnt" ? CircleSlash : task.late ? Clock : Circle;

  return (
    <li
      className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm", TONE_ROW[tone])}
      data-testid="staff-person-task"
      data-state={task.state}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate font-medium", task.state === "done" && "text-muted-foreground")}>{title}</span>
        <span className={cn("flex items-center gap-1 text-xs", task.state === "done" ? "text-muted-foreground" : TONE_TEXT[tone])}>
          <StateIcon
            className={cn("size-3.5 shrink-0", task.state === "done" && "text-emerald-600")}
            aria-hidden
          />
          {status}
        </span>
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{when}</span>
    </li>
  );
}
