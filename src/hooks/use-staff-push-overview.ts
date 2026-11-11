"use client";

import { useCallback, useEffect, useState } from "react";
import { useHousehold } from "@/context/household-context";
import {
  fetchStaffPushOverview,
  setHouseholdStaffPush,
  type StaffPushOverview,
} from "@/lib/staff-push";

/**
 * Admins (Phase 166, D8): whether the household sends notifications to staff
 * phones, who has them on, and which names each linked phone gives them for.
 * Owners can't turn notifications on for staff (only the phone can say yes),
 * so this is the switch and the status, nothing more.
 *
 * `overview` is null while loading and when it can't be read (mock mode, a
 * database before migrations/141): every caller then shows nothing new.
 */
export function useStaffPushOverview() {
  const { isHouseholdMember, tenantReady } = useHousehold();
  const [overview, setOverview] = useState<StaffPushOverview | null>(null);

  const load = useCallback(async () => {
    if (!isHouseholdMember || !tenantReady) return;
    try {
      setOverview(await fetchStaffPushOverview());
    } catch (err) {
      console.error(err);
      setOverview(null);
    }
  }, [isHouseholdMember, tenantReady]);

  useEffect(() => {
    void load();
  }, [load]);

  const setEnabled = useCallback(
    async (on: boolean) => {
      setOverview((prev) => (prev ? { ...prev, enabled: on } : prev));
      try {
        await setHouseholdStaffPush(on);
      } catch (err) {
        setOverview((prev) => (prev ? { ...prev, enabled: !on } : prev));
        throw err;
      }
      await load();
    },
    [load]
  );

  /** Whether at least one linked phone gives this person notifications. */
  const isOn = useCallback(
    (staffId: string) => !!overview?.people.some((p) => p.staff_id === staffId && p.phones_on > 0),
    [overview]
  );

  /** The names a linked phone (device_sessions.id) gives notifications for. */
  const namesOn = useCallback(
    (deviceSessionId: string) => overview?.phones.find((p) => p.device_session_id === deviceSessionId)?.names ?? [],
    [overview]
  );

  return { overview, setEnabled, isOn, namesOn, reload: load };
}
