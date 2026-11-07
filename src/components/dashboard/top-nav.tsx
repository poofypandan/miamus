"use client";

import { useSearchParams } from "next/navigation";
import { TodayButton } from "@/components/agenda/today-button";
import { AppHeader, HeaderNavLink } from "@/components/navigation/app-header";
import { moduleFromParam } from "@/lib/dashboard-modules";
import { useOwnerLocale } from "@/context/owner-locale-context";

/**
 * The dashboard header: the property name and the way into the staff view —
 * and, on the Agenda, the Today button (Phase 115).
 *
 * It used to carry a second row of pills for whichever module had two panels —
 * Pets split into Daily Feed and Schedule, Household into Chores and
 * Inventory. Phase 100 promoted all of those to the tab bar, so there is no
 * sub-navigation left to render and the header is back to what it is for.
 */
export function TopNav() {
  const onAgenda = moduleFromParam(useSearchParams().get("module")) === "agenda";
  const locale = useOwnerLocale();
  return (
    <AppHeader
      action={
        <div className="flex shrink-0 items-center gap-1">
          {onAgenda && <TodayButton locale={locale} />}
          <HeaderNavLink href="/staff" switchTo="staff">
            {locale === "id" ? "Mode Kerja →" : "Action Mode →"}
          </HeaderNavLink>
        </div>
      }
    />
  );
}
