"use client";

import { useEffect, useMemo, useState } from "react";
import { useHousehold } from "@/context/household-context";
import { dataProvider } from "@/lib/data";
import type { HouseholdTask } from "@/types/database";

/**
 * Every set-up chore, whatever week the Agenda is on (Codex, PR #30): the
 * household's chore cache only holds the week on screen, so a chore set up
 * for later would look missing and invite a duplicate. Read on its own, and
 * read again whenever the household's chores change, so an edit made here
 * shows; until that read lands, the cache's fresher copy of any row wins.
 */
export function useSetUpChores(today: string): { rows: HouseholdTask[] | null; failed: boolean } {
  const { householdTasks } = useHousehold();
  const [state, setState] = useState<{ rows: HouseholdTask[] | null; failed: boolean }>({
    rows: null,
    failed: false,
  });

  useEffect(() => {
    let live = true;
    dataProvider.listSetUpChores(today).then(
      (rows) => {
        if (live) setState({ rows, failed: false });
      },
      (err) => {
        console.error("Rooms: set-up chores", err);
        if (live) setState((previous) => ({ rows: previous.rows, failed: true }));
      }
    );
    return () => {
      live = false;
    };
  }, [today, householdTasks]);

  const rows = useMemo(() => {
    if (!state.rows) return state.failed ? householdTasks : null;
    const byId = new Map(state.rows.map((row) => [row.id, row]));
    for (const row of householdTasks) byId.set(row.id, row);
    return [...byId.values()];
  }, [state, householdTasks]);

  return { rows, failed: state.failed && !state.rows };
}
