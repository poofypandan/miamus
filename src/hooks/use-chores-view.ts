"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { pushInPlace, replaceInPlace } from "@/lib/in-place-navigation";
import { isChoreJob, type ChoreJob } from "@/lib/chore-jobs";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { choresViewFor } from "@/lib/features";

export type ChoresView = "today" | "rooms" | "repairs";

/**
 * Home's pill (Rooms · Chores · Repairs) and the Rooms view's job filter,
 * read from the URL (Phase 158): `?chores=today` and `&job=vacuum`. The pill, the
 * chips and what they show all come from here, so they can't disagree after
 * a remount (CLAUDE.md, State Persistence).
 *
 * Switching views is a push, so Back returns to the house; changing the job is a
 * replace, so Back doesn't step through every chip that was tapped. Both in
 * place, with no server round trip (Phase 121).
 */
export function useChoresView(): {
  view: ChoresView;
  setView: (next: ChoresView) => void;
  job: ChoreJob | null;
  setJob: (next: ChoreJob | null) => void;
} {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("chores");
  // Rooms · Chores · Repairs (21 Nov: Home opens on the house, so no value
  // is Rooms and Chores is `?chores=today`). Repairs switched off (Phase
  // 171): ?chores=repairs falls back to Rooms.
  const { flags } = useHouseholdFeatures();
  const view: ChoresView = choresViewFor(raw, flags);
  const rawJob = searchParams.get("job");
  const job = view === "rooms" && isChoreJob(rawJob) ? rawJob : null;

  function hrefWith(update: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    update(params);
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return {
    view,
    job,
    setView(next) {
      if (next === view) return;
      pushInPlace(
        hrefWith((params) => {
          if (next === "rooms") params.delete("chores");
          else params.set("chores", next);
          params.delete("job");
        })
      );
    },
    setJob(next) {
      if (next === job) return;
      replaceInPlace(
        hrefWith((params) => {
          if (next) params.set("job", next);
          else params.delete("job");
        })
      );
    },
  };
}
