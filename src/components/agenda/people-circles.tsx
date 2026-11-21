"use client";

import { Check, CookingPot, House, PawPrint, Users, Wrench, type LucideIcon } from "lucide-react";
import { ProgressRing } from "@/components/agenda/progress-ring";
import { initialsOf } from "@/components/dashboard/staff-progress-card";
import { useT } from "@/context/owner-locale-context";
import { ANYONE_PERSON, useWorkloadParam } from "@/hooks/use-staff-workload";
import type { AnyoneProgress, PersonProgress, StaffProgress } from "@/lib/staff-progress";
import { areaSymbols, type StaffArea } from "@/lib/staff-areas";
import type { StaffProfile } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * The people, at a glance (Today v3, 21 Nov; docs/private/landing/06): an
 * initial in a ring for each person, filling with their own day, never a
 * photograph. A tick when their day is done, a small number when something
 * is left; under the name, the symbols of what they look after (the areas
 * an owner left on for them: the house, the paw, the pot, the wrench, as the
 * tab bar and the staff app draw them; lib/staff-areas areaSymbols). They
 * belong to the person, so they read the same on a quiet day. "Anyone" joins
 * only while something nobody owns is still open.
 *
 * Owners only. In the order people were added, never sorted by how much is
 * done, and no words compare one person with another. A circle opens that
 * person's day in Who did what, as their row did.
 */
const AREA_ICON: Record<StaffArea, LucideIcon> = { home: House, pets: PawPrint, kitchen: CookingPot, repairs: Wrench };

export function PeopleCircles({
  progress,
  profiles,
  areas,
}: {
  progress: StaffProgress;
  /** The roster, for each person's own areas. */
  profiles: readonly StaffProfile[];
  /** The areas this household uses (no pets or Repairs when switched off). */
  areas: readonly StaffArea[];
}) {
  const t = useT();
  const workload = useWorkloadParam();
  if (progress.people.length === 0 && !progress.anyone) return null;
  const symbolsOf = (person: PersonProgress) =>
    person.onLeave ? [] : areaSymbols(profiles.find((p) => p.id === person.id), areas);
  // No row of symbols at all when nobody has one to show (the usual home,
  // where everyone keeps every area, or everyone on leave): the card closes
  // up instead of keeping an empty band (Fable).
  const withSymbols = progress.people.some((person) => symbolsOf(person).length > 0);
  return (
    <section
      aria-label={t("Who is on track", "Siapa yang lancar")}
      data-testid="people-circles"
      className="flex justify-between overflow-x-auto rounded-2xl bg-card px-1 py-3 shadow-card [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {progress.people.map((person) => (
        <Circle
          key={person.id}
          person={person}
          symbols={withSymbols ? symbolsOf(person) : null}
          onPress={() => workload.openPerson(person.id)}
        />
      ))}
      {progress.anyone && progress.anyone.open > 0 && (
        <AnyoneCircle anyone={progress.anyone} symbolRow={withSymbols} onPress={() => workload.openPerson(ANYONE_PERSON)} />
      )}
    </section>
  );
}

function counts(person: PersonProgress) {
  const done = (person.house?.done ?? 0) + (person.pets?.done ?? 0);
  const total = (person.house?.total ?? 0) + (person.pets?.total ?? 0);
  const left = person.tasks.filter((task) => task.state === "open").length;
  return { done, total, left };
}

function Circle({
  person,
  symbols,
  onPress,
}: {
  person: PersonProgress;
  /** Their area symbols; null when no one on the card has any (no row). */
  symbols: StaffArea[] | null;
  onPress: () => void;
}) {
  const t = useT();
  const { done, total, left } = counts(person);
  const away = person.onLeave || !!person.busy;
  const attention = !away && person.tone !== "neutral";
  const finished = !away && total > 0 && left === 0 && !attention;
  const said = away
    ? person.onLeave
      ? t("on leave", "libur")
      : t("busy", "sibuk")
    : finished
      ? t("all done", "semua selesai")
      : total === 0
        ? t("no tasks", "tidak ada tugas")
        : t(`${left} left`, `sisa ${left}`);
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid="person-circle"
      aria-label={t(`${person.name}: ${said}. Open their day`, `${person.name}: ${said}. Buka harinya`)}
      className="press flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl py-1 active:bg-muted/60"
    >
      <span className="relative">
        <ProgressRing done={done} total={total} size={56} stroke={3.5} arcClass={attention ? "stroke-attention" : "stroke-done"}>
          <span
            className={cn(
              "flex size-11 items-center justify-center rounded-full bg-muted text-base font-semibold text-gray-700",
              away && "opacity-60"
            )}
            aria-hidden
          >
            {initialsOf(person.name).slice(0, 1)}
          </span>
        </ProgressRing>
        {finished ? (
          <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full bg-done text-white ring-2 ring-card" aria-hidden>
            <Check className="size-3" style={{ strokeWidth: 3 }} />
          </span>
        ) : !away && left > 0 ? (
          <span
            className={cn(
              "absolute -right-0.5 -bottom-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums ring-2 ring-card",
              attention ? "bg-attention text-white" : "bg-card text-gray-900 shadow-card"
            )}
            aria-hidden
          >
            {left}
          </span>
        ) : null}
      </span>
      <span className="w-full truncate px-0.5 text-center text-xs font-medium text-gray-900">{person.name}</span>
      {/* What they look after, their own areas; nothing when on leave. */}
      {symbols && (
        <span className="flex h-4 items-center gap-1 text-subtle-foreground" data-testid="person-areas" aria-hidden>
          {symbols.map((area) => {
            const Icon = AREA_ICON[area];
            return <Icon key={area} data-area={area} className="size-3.5" />;
          })}
        </span>
      )}
    </button>
  );
}

function AnyoneCircle({ anyone, symbolRow, onPress }: { anyone: AnyoneProgress; symbolRow: boolean; onPress: () => void }) {
  const t = useT();
  const label = t("Anyone", "Siapa saja");
  return (
    <button
      type="button"
      onClick={onPress}
      data-testid="anyone-circle"
      aria-label={t(`${label}: ${anyone.open} not done yet. Open the list`, `${label}: ${anyone.open} belum dikerjakan. Buka daftarnya`)}
      className="press flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl py-1 active:bg-muted/60"
    >
      <span className="relative">
        <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <Users className="size-5" />
        </span>
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums ring-2 ring-card",
            anyone.tone !== "neutral" ? "bg-attention text-white" : "bg-card text-gray-900 shadow-card"
          )}
          aria-hidden
        >
          {anyone.open}
        </span>
      </span>
      <span className="w-full truncate px-0.5 text-center text-xs font-medium text-gray-900">{label}</span>
      {symbolRow && <span className="h-4" aria-hidden />}
    </button>
  );
}
