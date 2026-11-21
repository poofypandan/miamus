"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays } from "date-fns";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { useT } from "@/context/owner-locale-context";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import { expandChores, type ChoreOccurrence } from "@/lib/chore-recurrence";
import { applyLeaveTriage } from "@/lib/leave";
import { dataProvider } from "@/lib/data";
import { AGENDA_WEEK_DAYS, weekStartOf } from "@/lib/unified-agenda";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { House, HouseBand, HouseRoom } from "@/lib/house-view";
import { cn } from "@/lib/utils";
import type { HouseholdTask } from "@/types/database";

/**
 * Home → Rooms as the house (21 Nov; Fable's home-floors.html): the Miamus
 * roof, one band a floor with the top floor first, each room a tile, and the
 * ground under it. A tap on a room opens the room; a tap on a floor's name
 * opens that floor's list. Amber always comes with its mark and, under the
 * house, the reason in words.
 */
export function HouseView({
  house,
  otherLabel,
  onOpenRoom,
  onOpenFloor,
}: {
  house: House;
  /** The band of rooms on no floor: "No floor yet" or "Other rooms". */
  otherLabel: string;
  onOpenRoom: (id: string) => void;
  onOpenFloor: (key: string) => void;
}) {
  const t = useT();
  return (
    <section aria-label={t("The house", "Rumah")} className="flex flex-col">
      <svg viewBox="0 0 350 46" preserveAspectRatio="none" aria-hidden className="block h-[46px] w-full text-zinc-400">
        <polyline
          points="6,42 175,6 344,42"
          fill="none"
          stroke="currentColor"
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="-mt-0.5 flex flex-col gap-1.5">
        {house.floors.map((band) => (
          <Band key={band.key} band={band} onOpenRoom={onOpenRoom} onOpenFloor={onOpenFloor} />
        ))}
      </div>
      <div aria-hidden className="mx-2.5 mt-2 h-2.5 rounded-full bg-zinc-200/80" />
      {house.other && (
        <div className="mt-4">
          <Band band={{ ...house.other, label: otherLabel }} onOpenRoom={onOpenRoom} />
        </div>
      )}
    </section>
  );
}

function Band({
  band,
  onOpenRoom,
  onOpenFloor,
}: {
  band: HouseBand;
  onOpenRoom: (id: string) => void;
  /** A floor's name opens its list; the rooms on no floor have no list of their own. */
  onOpenFloor?: (key: string) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-2xl bg-card px-3 pt-2 pb-3 shadow-card">
      {band.label !== null && !onOpenFloor && (
        <p className="flex min-h-[36px] items-center text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
          {band.label}
        </p>
      )}
      {band.label !== null && onOpenFloor && (
        <button
          type="button"
          onClick={() => onOpenFloor(band.key)}
          aria-label={
            band.attention
              ? t(`${band.label}, needs attention: show its list`, `${band.label}, perlu perhatian: lihat daftarnya`)
              : t(`${band.label}: show its list`, `${band.label}: lihat daftarnya`)
          }
          className={cn(
            "-mx-1 flex min-h-[36px] w-[calc(100%+0.5rem)] items-center justify-between gap-2 rounded-lg px-1 text-xs font-semibold tracking-[0.06em] uppercase active:bg-muted",
            band.attention ? "text-amber-800" : "text-muted-foreground"
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {band.attention && <TriangleAlert className="size-4 shrink-0" aria-hidden />}
            <span className="truncate">{band.label}</span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-zinc-400" aria-hidden />
        </button>
      )}
      <ul className="mt-1 flex flex-wrap gap-2">
        {band.rooms.map((room) => (
          <li key={room.id} className={cn("flex max-w-full min-w-0", room.inside ? "flex-none" : "flex-[1_1_auto]")}>
            <RoomTile room={room} onOpen={() => onOpenRoom(room.id)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoomTile({ room, onOpen }: { room: HouseRoom; onOpen: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={room.attention ? t(`${room.fullName}, needs attention`, `${room.fullName}, perlu perhatian`) : room.fullName}
      className={cn(
        "flex min-h-[44px] w-full min-w-0 items-center justify-center gap-1.5 rounded-xl px-3.5 text-sm active:opacity-70",
        room.attention
          ? "bg-amber-100 font-semibold text-amber-900"
          : room.inside
            ? "bg-zinc-100 font-medium text-gray-600"
            : "bg-zinc-100 font-semibold text-gray-900"
      )}
    >
      {room.attention && <TriangleAlert className="size-4 shrink-0" aria-hidden />}
      <span className="truncate">{room.label}</span>
    </button>
  );
}

/**
 * Chores left from an earlier day, for the house's amber: today's carried-over
 * chores, the same ones Home → Chores lists under "From earlier" (Phase 113),
 * whatever day Chores is browsing. Leave applies, as everywhere (Phase 140).
 *
 * The household's chore list holds only the browsed week, and only this
 * week's carries the rolled-over chores (Codex, PR #186). So while another
 * week is browsed, this week's chores are read on their own, once, and the
 * live list takes over again when the browsed week is this one.
 */
export function useOverdueChores(): ChoreOccurrence[] {
  const { householdTasks, leaveRequests, selectedDate } = useHousehold();
  const today = useToday();
  const todayStr = formatDateLocal(today);
  const thisWeekStart = formatDateLocal(weekStartOf(today));
  const browsingThisWeek = formatDateLocal(weekStartOf(selectedDate)) === thisWeekStart;
  const [thisWeek, setThisWeek] = useState<{ start: string; rows: HouseholdTask[] } | null>(null);

  useEffect(() => {
    if (browsingThisWeek) return;
    let live = true;
    const start = new Date(`${thisWeekStart}T00:00:00`);
    const to = formatDateLocal(addDays(start, AGENDA_WEEK_DAYS - 1));
    dataProvider
      .listHouseholdTasks(thisWeekStart, to, todayStr)
      .then((rows) => {
        if (live) setThisWeek({ start: thisWeekStart, rows });
      })
      // No amber from chores until it loads; repairs still show.
      .catch((err) => console.warn("This week's chores for the house did not load", err));
    return () => {
      live = false;
    };
  }, [browsingThisWeek, thisWeekStart, todayStr]);

  const rows = browsingThisWeek ? householdTasks : thisWeek?.start === thisWeekStart ? thisWeek.rows : null;
  return useMemo(
    () =>
      rows
        ? applyLeaveTriage(expandChores({ rows, date: todayStr, today: todayStr }), leaveRequests)
            .filter((o) => o.overdue && o.status !== "completed")
            .sort((a, b) => a.date.localeCompare(b.date))
        : [],
    [rows, todayStr, leaveRequests]
  );
}
