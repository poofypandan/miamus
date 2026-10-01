"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AgendaTab } from "@/components/dashboard/tabs/agenda-tab";
import { ChoresTab } from "@/components/dashboard/tabs/chores-tab";
import { InventoryMasterTab } from "@/components/dashboard/tabs/inventory-master-tab";
import { PetsTab } from "@/components/dashboard/tabs/pets-tab";
import { StaffTab } from "@/components/dashboard/tabs/staff-tab";
import { PetProfileSheet } from "@/components/dashboard/pet-profile-sheet";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { moduleFromParam, type DashboardModule } from "@/lib/dashboard-modules";

export default function DashboardPage() {
  // useSearchParams() opts this subtree out of static rendering unless it's
  // behind a Suspense boundary — the rest of the page has no static content
  // to show in the meantime anyway, so a null fallback is fine.
  return (
    <Suspense fallback={null}>
      <DashboardCanvas />
    </Suspense>
  );
}

/**
 * One screen per tab (Phase 100).
 *
 * The swipeable carousel that used to live here is gone with the sub-tabs it
 * moved between: with five flat destinations it would have to keep all five
 * mounted in one track, and the two it did carry — Daily Feed/Schedule and
 * Chores/Inventory — no longer exist as pairs. Tabs are a tap now.
 */
function DashboardCanvas() {
  const searchParams = useSearchParams();
  const activeModule = moduleFromParam(searchParams.get("module"));
  // Every tab here is owner territory; the middleware is what actually keeps
  // staff out of /dashboard (anonymous sessions are sent to /staff), and this
  // is the second line that stops a half-resolved role rendering owner
  // controls for a moment.
  const isOwner = useRequireOwner();
  if (!isOwner) return null;

  return (
    <>
      {TABS[activeModule]}
      {/* Mounted once, outside the tabs: a pet profile can be opened from the
          Agenda's summary card and from the Pets tab, and it should survive
          switching between them. */}
      <PetProfileSheet />
    </>
  );
}

const TABS: Record<DashboardModule, React.ReactNode> = {
  agenda: <AgendaTab />,
  pets: <PetsTab />,
  chores: <ChoresTab />,
  inventory: <InventoryMasterTab />,
  access: (
    <div className="px-4 pb-6">
      <StaffTab />
    </div>
  ),
};
