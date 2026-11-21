"use client";

import { AppHeader, ViewSwitch } from "@/components/navigation/app-header";
import { useOwnerLocale } from "@/context/owner-locale-context";

/**
 * The dashboard header: the Miamus mark and name, and the Overview | Staff
 * switch. The Agenda's Today button (Phase 115) moved to the date pill at the
 * bottom left in Today v3 (21 Nov), where it appears while another day is
 * shown.
 *
 * It used to carry a second row of pills for whichever module had two panels —
 * Pets split into Daily Feed and Schedule, Household into Chores and
 * Inventory. Phase 100 promoted all of those to the tab bar, so there is no
 * sub-navigation left to render and the header is back to what it is for.
 */
export function TopNav() {
  const locale = useOwnerLocale();
  return (
    <AppHeader
      action={
        <div className="flex shrink-0 items-center gap-1">
          <ViewSwitch current="owner" locale={locale} />
        </div>
      }
    />
  );
}
