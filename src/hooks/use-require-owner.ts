"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useHousehold } from "@/context/household-context";

/**
 * Guards an owner-only page/route. Redirects to the Daily Feed the moment
 * the viewer isn't (or stops being) an owner — covers direct URL access by
 * staff and losing owner mode while already on the page.
 */
export function useRequireOwner(): boolean {
  const { userRole } = useHousehold();
  const router = useRouter();
  const isOwner = userRole === "owner";

  useEffect(() => {
    if (!isOwner) {
      router.replace("/dashboard");
    }
  }, [isOwner, router]);

  return isOwner;
}
