"use client";

import { useEffect, useState } from "react";
import { addDays, startOfDay } from "date-fns";
import { usePathname, useSearchParams } from "next/navigation";
import { pushInPlace, replaceInPlace } from "@/lib/in-place-navigation";
import { useHousehold } from "@/context/household-context";
import { useToday } from "@/hooks/use-today";
import { dataProvider } from "@/lib/data";
import type { StaffWorkload } from "@/lib/data/types";

export const WORKLOAD_HORIZONS = ["today", "7d", "30d"] as const;
export type WorkloadHorizon = (typeof WORKLOAD_HORIZONS)[number];

const HORIZON_DAYS: Record<WorkloadHorizon, number> = { today: 1, "7d": 7, "30d": 30 };

/**
 * The Staff Workload sheet's open state and time span, as one URL param
 * (Phase 116): `?workload=7d` is the sheet, open, on the last seven days. In
 * the URL like every other toggle here (CLAUDE.md, State Persistence), and so
 * the phone's Back button closes the sheet rather than leaving the tab.
 */
export function useWorkloadParam(): {
  horizon: WorkloadHorizon | null;
  open: (horizon?: WorkloadHorizon) => void;
  setHorizon: (horizon: WorkloadHorizon) => void;
  close: () => void;
} {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("workload");
  const horizon = WORKLOAD_HORIZONS.includes(raw as WorkloadHorizon)
    ? (raw as WorkloadHorizon)
    : null;

  const hrefWith = (value: WorkloadHorizon | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("workload", value);
    else params.delete("workload");
    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  return {
    horizon,
    // A push to open, so Back closes it…
    // All three in place, with no server round trip: the sheet is the same
    // page (Phase 121).
    open: (value = "today") => pushInPlace(hrefWith(value)),
    // …and a replace to change the span, so Back does not step through every
    // span that was looked at on the way.
    setHorizon: (value) => replaceInPlace(hrefWith(value)),
    close: () => replaceInPlace(hrefWith(null)),
  };
}

/**
 * Finished work per staff member over the chosen span — today, or the last 7
 * or 30 days including today, in this phone's local days (Phase 116).
 *
 * Fetched from the staff_workload RPC (migrations/100), which counts by who
 * completed each task and refuses anyone who is not an owner. Refetched
 * quietly when a log or chore changes while the sheet is open, keeping the
 * last answer on screen meanwhile.
 */
export function useStaffWorkload(horizon: WorkloadHorizon | null): {
  rows: StaffWorkload[] | null;
  failed: boolean;
} {
  const { logs, householdTasks } = useHousehold();
  const today = useToday();
  const [result, setResult] = useState<{
    horizon: WorkloadHorizon;
    rows: StaffWorkload[] | null;
    failed: boolean;
  } | null>(null);

  useEffect(() => {
    if (!horizon) return;
    let cancelled = false;
    const to = startOfDay(addDays(today, 1));
    const from = startOfDay(addDays(today, 1 - HORIZON_DAYS[horizon]));
    dataProvider
      .getStaffWorkload(from, to)
      .then((rows) => !cancelled && setResult({ horizon, rows, failed: false }))
      .catch((err) => {
        console.error("staff_workload failed — is migrations/100 applied?", err);
        if (!cancelled)
          setResult((prev) => ({
            horizon,
            rows: prev?.horizon === horizon ? prev.rows : null,
            failed: true,
          }));
      });
    return () => {
      cancelled = true;
    };
  }, [horizon, today, logs, householdTasks]);

  // A different span's numbers are not shown under this span's label while
  // the new ones load.
  if (!horizon || result?.horizon !== horizon) return { rows: null, failed: false };
  return { rows: result.rows, failed: result.failed };
}
