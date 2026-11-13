"use client";

import { useMemo } from "react";
import { useStaffIdentity } from "@/components/auth/staff-login-gate";
import { useHousehold } from "@/context/household-context";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { staffVisibility, type StaffVisibility } from "@/lib/staff-areas";

const EVERYTHING: StaffVisibility = { home: true, pets: true, kitchen: true, repairs: true, lapor: true };

/**
 * What the person signed in on this phone sees on `day` (YYYY-MM-DD), per
 * the owner's switches (Phase 178, lib/staff-areas.ts). Follows whoever is
 * signed in: a new name on a shared phone is a new answer (rule 5).
 *
 * An owner in staff view sees everything (rule 6), as does a phone whose
 * person isn't on the roster read (an admin without a roster row, or the
 * roster still loading): the staff app has always shown everything then.
 *
 * Hides; does not lock. The rows still reach the phone.
 */
export function useStaffVisibility(day: string): StaffVisibility {
  const { staffId } = useStaffIdentity();
  const { isHouseholdMember, leaveRequests } = useHousehold();
  const { profiles } = useStaffProfiles();
  return useMemo(() => {
    if (isHouseholdMember || !staffId || !profiles) return EVERYTHING;
    const person = profiles.find((p) => p.id === staffId);
    if (!person) return EVERYTHING;
    return staffVisibility(person, profiles, leaveRequests, day);
  }, [isHouseholdMember, staffId, profiles, leaveRequests, day]);
}
