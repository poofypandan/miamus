"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, UserRoundPlus } from "lucide-react";
import { pendingCount, type AccessRequest } from "@/lib/household-access";
import { supabase } from "@/lib/supabase/client";

/**
 * "2 household requests waiting" — for platform admins only (Phase 148,
 * migrations/113). Everyone else costs one cheap my_household_access() call
 * and sees nothing. Re-checked on every dashboard navigation, so coming back
 * from the approvals page shows the new count.
 *
 * Quiet on failure: a missed banner is not worth an error on every screen,
 * and the push notification is the other way a request reaches the admin.
 */
export function HouseholdRequestsBanner() {
  const pathname = usePathname();
  const [waiting, setWaiting] = useState(0);
  const onApprovals = pathname === "/dashboard/approvals";

  useEffect(() => {
    if (onApprovals) return;
    let cancelled = false;
    (async () => {
      if (!supabase) return;
      const { data: access } = await supabase.rpc("my_household_access");
      if (access !== "admin") return;
      const { data, error } = await supabase.rpc("list_household_access_requests");
      if (error || cancelled) return;
      setWaiting(pendingCount((data ?? []) as AccessRequest[]));
    })().catch((err) => console.error("Household requests check failed", err));
    return () => {
      cancelled = true;
    };
  }, [pathname, onApprovals]);

  if (onApprovals || waiting === 0) return null;

  return (
    <div className="px-4 pt-4">
      <Link
        href="/dashboard/approvals"
        className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 shadow-sm active:bg-amber-100"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <UserRoundPlus className="size-4" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium text-amber-950">
          {waiting === 1 ? "1 household request waiting" : `${waiting} household requests waiting`}
        </span>
        <ChevronRight className="size-4 shrink-0 text-amber-700" />
      </Link>
    </div>
  );
}
