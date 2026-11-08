"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export interface HouseholdDeletionStatus {
  householdName: string;
  scheduled: boolean;
  deleteAfter: string | null;
  requestedByMe: boolean;
  /** The founder, or any admin once no founder is a member (migration 127). */
  canSchedule: boolean;
}

type Row = {
  household_name: string;
  scheduled: boolean;
  delete_after: string | null;
  requested_by_me: boolean;
  can_schedule: boolean;
};

/**
 * Whether this household is scheduled for deletion (R7). Null while loading,
 * offline, or in mock mode — callers show nothing rather than a guess.
 */
export function useHouseholdDeletion() {
  const [status, setStatus] = useState<HouseholdDeletionStatus | null>(null);

  const reload = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("household_deletion_status");
    if (error) {
      console.error(error);
      return;
    }
    const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
    setStatus(
      row
        ? {
            householdName: row.household_name,
            scheduled: row.scheduled,
            deleteAfter: row.delete_after,
            requestedByMe: row.requested_by_me,
            canSchedule: row.can_schedule,
          }
        : null
    );
  }, []);

  useEffect(() => {
    // Fetched once on mount, like the member list; reload() after a change.
    void reload();
  }, [reload]);

  return { status, reload };
}
