"use client";

import { useMemo } from "react";
import { ChevronRight, Users } from "lucide-react";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useWorkloadParam } from "@/hooks/use-staff-workload";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import { cn } from "@/lib/utils";
import { useT } from "@/context/owner-locale-context";

interface StaffStat {
  id: string;
  name: string;
  done: number;
  total: number;
  /** Rolled over from earlier days and still open — counted apart from today. */
  overdue: number;
}

/**
 * How each person is getting on with the day's chores (Phase 113): one card
 * per staff member, done out of total, with a ring.
 *
 * Counts the chores owed on the day being browsed. Rolled-over ones are not
 * folded into the fraction — "3/4" has to mean three of today's four — but a
 * card says when someone also has older work open, since that is usually the
 * more useful thing to know.
 *
 * A chore counts for whoever it is assigned to, or failing that whoever
 * finished it, so an unclaimed chore that someone just did lands on them. One
 * nobody has taken or done sits on its own "Unclaimed" card.
 *
 * Tapping any card, or "Workload", opens the Staff Workload sheet (Phase
 * 116): this strip says who has today's chores left; the sheet says who has
 * actually been doing the work, dogs included, over days or weeks.
 *
 * Owner-facing, in the owner's language.
 */
export function StaffCompletionStrip({
  occurrences,
  date,
  dayLabel,
}: {
  occurrences: ChoreOccurrence[];
  /** YYYY-MM-DD of the day being browsed. */
  date: string;
  /** "Today", "Tomorrow", "Oct 5" — for the heading. */
  dayLabel: string;
}) {
  const { profiles } = useStaffProfiles();
  const workload = useWorkloadParam();
  const t = useT();

  const stats = useMemo<StaffStat[]>(() => {
    const ownerOf = (o: ChoreOccurrence) => o.task.assigned_to ?? o.task.completed_by ?? null;
    const onDay = occurrences.filter((o) => o.date === date && o.status !== "cancelled");
    const tally = (who: string | null): Omit<StaffStat, "id" | "name"> => {
      const mine = onDay.filter((o) => ownerOf(o) === who);
      return {
        done: mine.filter((o) => o.status === "completed").length,
        total: mine.length,
        overdue: occurrences.filter(
          (o) => o.overdue && o.status !== "completed" && ownerOf(o) === who
        ).length,
      };
    };

    // Staff always have a card; an admin (a roster row linked to Google,
    // migrations/106) only on a day they have chores of their own. Removed
    // people are already out of `profiles`.
    const people = (profiles ?? []).flatMap((p) => {
      const stat = { id: p.id, name: p.name, ...tally(p.id) };
      return !p.user_id || stat.total > 0 || stat.overdue > 0 ? [stat] : [];
    });
    const unclaimed = tally(null);
    return unclaimed.total > 0 || unclaimed.overdue > 0
      ? [...people, { id: "unclaimed", name: t("Not taken yet", "Belum ada yang ambil"), ...unclaimed }]
      : people;
  }, [occurrences, date, profiles, t]);

  if (stats.length === 0) return null;

  return (
    <section className="flex flex-col gap-2">
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
      {/* Bleeds to the screen edges so the cards scroll under the gutter
          rather than being clipped inside it. */}
      <div className="-mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stats.map((stat) => (
          <StatCard key={stat.id} stat={stat} onPress={() => workload.open()} />
        ))}
      </div>
    </section>
  );
}

function StatCard({ stat, onPress }: { stat: StaffStat; onPress: () => void }) {
  const t = useT();
  const unclaimed = stat.id === "unclaimed";
  const pct = stat.total > 0 ? stat.done / stat.total : 0;
  const complete = stat.total > 0 && stat.done === stat.total;
  const initials = stat.name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={t(
        `${stat.name}: ${stat.done} of ${stat.total} done. Open who did what`,
        `${stat.name}: ${stat.done} dari ${stat.total} selesai. Buka siapa mengerjakan apa`
      )}
      className="flex w-36 shrink-0 snap-start flex-col gap-2 rounded-xl border bg-card p-3 text-left active:bg-muted/60"
    >
      <div className="flex items-center gap-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-gray-700"
          aria-hidden
        >
          {unclaimed ? <Users className="size-3.5" /> : initials}
        </span>
        <span className="line-clamp-2 text-sm leading-tight font-medium break-words">{stat.name}</span>
      </div>

      <div className="flex items-center gap-2.5">
        <ProgressRing pct={pct} complete={complete} />
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-semibold tabular-nums">
            {stat.done}/{stat.total}
          </span>
          <span className="text-[11px] leading-tight text-muted-foreground">
            {stat.total === 0
              ? t("No chores", "Tidak ada tugas")
              : complete
                ? t("All done", "Semua selesai")
                : t("done", "selesai")}
          </span>
        </div>
      </div>

      {stat.overdue > 0 && (
        <span className="text-[11px] font-medium text-red-700">
          {t(`+${stat.overdue} overdue`, `+${stat.overdue} terlambat`)}
        </span>
      )}
    </button>
  );
}

// Static, not animated: it changes when a chore is finished, and redrawing it
// is cheaper and calmer than sweeping it. Emerald only at 100% — the app's
// colour for done.
function ProgressRing({ pct, complete }: { pct: number; complete: boolean }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg
      viewBox="0 0 40 40"
      className="size-10 shrink-0 -rotate-90"
      role="img"
      aria-label={`${Math.round(pct * 100)}%`}
    >
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        className={cn(complete ? "stroke-emerald-500" : "stroke-gray-900", pct === 0 && "hidden")}
      />
    </svg>
  );
}
