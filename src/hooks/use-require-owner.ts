"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHousehold } from "@/context/household-context";

/**
 * Guards an owner-only page/route. Redirects to the Daily Feed the moment
 * the viewer isn't (or stops being) an owner — covers direct URL access by
 * staff and losing owner mode while already on the page.
 *
 * Waits for `roleHydrated` before redirecting: on a hard refresh landing
 * directly on an owner-only route, `userRole` briefly reads "staff" (its
 * SSR-safe default) until HouseholdProvider's mount effect restores it from
 * localStorage. Redirecting during that window would bounce a real owner
 * back to the Daily Feed before their session had a chance to restore.
 */
export function useRequireOwner(): boolean {
  const { userRole, roleHydrated } = useHousehold();
  const router = useRouter();
  const isOwner = userRole === "owner";

  useEffect(() => {
    if (roleHydrated && !isOwner) {
      router.replace("/dashboard");
    }
  }, [roleHydrated, isOwner, router]);

  return isOwner;
}
