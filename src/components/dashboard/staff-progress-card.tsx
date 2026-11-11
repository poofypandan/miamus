"use client";

import { ChevronRight, ClipboardList, PawPrint, Users } from "lucide-react";
import { useT } from "@/context/owner-locale-context";
import { ANYONE_PERSON, useWorkloadParam } from "@/hooks/use-staff-workload";
import type {
  AnyoneProgress,
  KindCount,
  PersonProgress,
  ProgressTone,
  StaffProgress,
} from "@/lib/staff-progress";
import { cn } from "@/lib/utils";
import { useFormatTime } from "@/components/ui/ui-labels";

/**
 * Staff progress on Today (owner and wife, 11 Nov): one row per person, house
 * and pets together, replacing the Chores tab's chores-only strip (which
 * showed a pets-only maid as 0/0 all day).
 *
 * Each row shows only the kinds that person has ("Rumah 6/8", "Hewan 12/14"),
 * never 0/0. Neutral while on track, amber when something couldn't be done,
 * red only when something is late; "Libur" on approved leave. A tap opens
 * that person's whole day in the Who did what sheet.
 *
 * Owner-facing, in the owner's language.
 */
export function StaffProgressCard({
  progress,
  dayLabel,
}: {
  progress: StaffProgress;
  /** "Today", "Tomorrow", "Oct 5": for the heading. */
  dayLabel: string;
}) {
  const t = useT();
  const workload = useWorkloadParam();
  if (progress.people.length === 0 && !progress.anyone) return null;

  return (
    <section className="flex flex-col gap-2" aria-label={t(`${dayLabel}'s progress`, `Progres ${dayLabel}`)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">
          {t(`${dayLabel}'s progress`, `Progres ${dayLabel}`)}
        </h2>
        <button
          type="button"
          onClick={() => workload.open()}
          className="-mr-2 flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-muted-foreground active:bg-muted"
        >
          {t("Who did what", "Siapa mengerjakan apa")} <ChevronRight className="size-3.5" />
        </button>
      </div>
      <ul className="flex flex-col gap-2">
        {progress.people.map((person) => (
          <li key={person.id}>
            <PersonRow person={person} onPress={() => workload.openPerson(person.id)} />
          </li>
        ))}
        {progress.anyone && (
          <li>
            <AnyoneRow anyone={progress.anyone} onPress={() => workload.openPerson(ANYONE_PERSON)} />
          </li>
        )}
      </ul>
    </section>
  );
}

export const TONE_ROW: Record<ProgressTone, string> = {
  neutral: "bg-card",
  amber: "border-amber-200 bg-amber-50/70",
  red: "border-red-200 bg-red-50/70",
};

export const TONE_TEXT: Record<ProgressTone, string> = {
  neutral: "text-muted-foreground",
  amber: "text-amber-800",
  red: "text-red-700",
};

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** "Rumah 6/8", with its line icon; nothing for a kind the person doesn't have. */
export function KindCounts({
  house,
  pets,
  houseLabel,
  petsLabel,
  className,
}: {
  house: KindCount | null;
  pets: KindCount | null;
  houseLabel: string;
  petsLabel: string;
  className?: string;
}) {
  return (
    <span className={cn("flex shrink-0 items-center gap-3 tabular-nums", className)}>
      {house && (
        <span className="flex items-center gap-1" data-testid="progress-house">
          <ClipboardList className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {houseLabel} {house.done}/{house.total}
        </span>
      )}
      {pets && (
        <span className="flex items-center gap-1" data-testid="progress-pets">
          <PawPrint className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {petsLabel} {pets.done}/{pets.total}
        </span>
      )}
    </span>
  );
}

/** The calm line under a name: leave, busy, late, couldn't, left, or all done. */
export function usePersonLine() {
  const t = useT();
  const time = useFormatTime();
  return (person: PersonProgress): string => {
    if (person.onLeave) return t("On leave", "Libur");
    if (person.busy) {
      const since = time(person.busy.since);
      return t(`${person.busy.label} since ${since}`, `${person.busy.label} sejak ${since}`);
    }
    if (!person.house && !person.pets && person.tasks.length === 0) return t("No tasks", "Tidak ada tugas");
    const parts: string[] = [];
    if (person.late > 0) parts.push(t(`${person.late} late`, `${person.late} terlambat`));
    if (person.couldnt > 0)
      parts.push(t(`${person.couldnt} couldn't be done`, `${person.couldnt} tidak bisa dikerjakan`));
    if (parts.length > 0) return parts.join(" · ");
    const left = person.tasks.filter((task) => task.state === "open").length;
    return left === 0 ? t("All done", "Semua selesai") : t(`${left} left`, `Sisa ${left}`);
  };
}

function PersonRow({ person, onPress }: { person: PersonProgress; onPress: () => void }) {
  const t = useT();
  const line = usePersonLine()(person);
  // On leave, the counts step aside for "Libur": what they had was handed on.
  const tone: ProgressTone = person.onLeave || person.busy ? "neutral" : person.tone;

  return (
    <button
      type="button"
      onClick={onPress}
      data-testid="staff-progress-row"
      data-tone={tone}
      aria-label={t(`${person.name}: ${line}. Open their day`, `${person.name}: ${line}. Buka harinya`)}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left active:bg-muted/60",
        TONE_ROW[tone]
      )}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-gray-700"
        aria-hidden
      >
        {initialsOf(person.name)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium text-gray-900">{person.name}</span>
          {!person.onLeave && (
            <KindCounts
              house={person.house}
              pets={person.pets}
              houseLabel={t("House", "Rumah")}
              petsLabel={t("Pets", "Hewan")}
              className="text-sm font-medium text-gray-900"
            />
          )}
        </span>
        <span className={cn("text-xs", TONE_TEXT[tone])} data-testid="staff-progress-line">
          {line}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}

/** The small row for what nobody owns and nobody has done yet. */
function AnyoneRow({ anyone, onPress }: { anyone: AnyoneProgress; onPress: () => void }) {
  const t = useT();
  const extra = [
    anyone.late > 0 ? t(`${anyone.late} late`, `${anyone.late} terlambat`) : null,
    anyone.couldnt > 0 ? t(`${anyone.couldnt} couldn't be done`, `${anyone.couldnt} tidak bisa dikerjakan`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const label = t("Anyone, not done yet", "Siapa saja, belum dikerjakan");

  return (
    <button
      type="button"
      onClick={onPress}
      data-testid="staff-progress-anyone"
      data-tone={anyone.tone}
      aria-label={t(`${label}: ${anyone.open}. Open the list`, `${label}: ${anyone.open}. Buka daftarnya`)}
      className={cn(
        "flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm active:bg-muted/60",
        TONE_ROW[anyone.tone]
      )}
    >
      <Users className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-gray-700">{label}</span>
        {extra && <span className={cn("text-xs", TONE_TEXT[anyone.tone])}>{extra}</span>}
      </span>
      <span className="font-medium text-gray-900 tabular-nums">{anyone.open}</span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </button>
  );
}
