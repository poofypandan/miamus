"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { pushInPlace, replaceInPlace } from "@/lib/in-place-navigation";
import { isChoreJob, type ChoreJob } from "@/lib/chore-jobs";

export type ChoresView = "today" | "rooms" | "repairs";

/**
 * The Chores tab's pill (Today · Rooms) and the Rooms view's job filter, read
 * from the URL (Phase 158): `?chores=rooms` and `&job=vacuum`. The pill, the
 * chips and what they show all come from here, so they can't disagree after
 * a remount (CLAUDE.md, State Persistence).
 *
 * Switching views is a push, so Back returns to Today; changing the job is a
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
  // Today · Rooms · Repairs (Phase 159 adds the third, `?chores=repairs`).
  const view: ChoresView = raw === "rooms" || raw === "repairs" ? raw : "today";
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
          if (next === "today") params.delete("chores");
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
