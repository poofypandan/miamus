"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Home, PawPrint, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { MODULES } from "@/config/modules";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_TABS,
  HOUSEHOLD_VIEWS,
  householdViewHref,
  householdViewIndex,
  tabHref,
  tabIndex,
  type DashboardTab,
  type HouseholdView,
} from "@/lib/dashboard-tabs";
import { moduleFromParam, type DashboardModule } from "@/lib/dashboard-modules";
import { useHousehold } from "@/context/household-context";

const PETS_SEGMENTS: { value: DashboardTab; label: string }[] = [
  { value: "feed", label: "Daily Feed" },
  { value: "schedules", label: "Schedule" },
];

const HOUSEHOLD_SEGMENTS: { value: HouseholdView; label: string }[] = [
  { value: "chores", label: "Chores" },
  { value: "inventory", label: "Inventory" },
];

export function TopNav() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Both sub-navs read the same URL params the page renders its carousel
  // from, so the highlighted pill and the panel on screen are one value.
  const activeTab = DASHBOARD_TABS[tabIndex(searchParams.get("tab"))];
  const activeHouseholdView = HOUSEHOLD_VIEWS[householdViewIndex(searchParams.get("view"))];
  const activeModule = moduleFromParam(searchParams.get("module"));
  const { userRole } = useHousehold();
  const isOwner = userRole === "owner";

  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-lg font-semibold">Banyuwangi 11</span>
        <Link
          href="/staff"
          className="flex min-h-[48px] items-center text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
        >
          Open Staff View →
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ModuleTab
          icon={PawPrint}
          label="Pets"
          module="pets"
          active={activeModule === "pets"}
          enabled={MODULES.pets}
        />
        <ModuleTab
          icon={Home}
          label="Household"
          module="household"
          active={activeModule === "household"}
          enabled={MODULES.household}
        />
        <ModuleTab
          icon={Users}
          label="Staff"
          module="staff"
          active={activeModule === "staff"}
          enabled={MODULES.staff}
        />
      </div>

      {/* Staff only ever has the Daily Feed tab — a single-item tab row is
          pure clutter, so skip it entirely rather than rendering it. A tap is
          a .push() so Back returns to the previous panel, as the links these
          replaced did; swipes use .replace() (see SwipeCarousel callers). */}
      {isOwner && activeModule === "pets" && (
        <div className="px-4 pb-3">
          <SegmentedControl
            ariaLabel="Pets view"
            segments={PETS_SEGMENTS}
            value={activeTab}
            onChange={(tab) => router.push(tabHref(tab), { scroll: false })}
          />
        </div>
      )}
      {isOwner && activeModule === "household" && (
        <div className="px-4 pb-3">
          <SegmentedControl
            ariaLabel="Household view"
            segments={HOUSEHOLD_SEGMENTS}
            value={activeHouseholdView}
            onChange={(view) => router.push(householdViewHref(view), { scroll: false })}
          />
        </div>
      )}
    </div>
  );
}

function ModuleTab({
  icon: Icon,
  label,
  module,
  active,
  enabled,
}: {
  icon: LucideIcon;
  label: string;
  module: DashboardModule;
  active: boolean;
  enabled: boolean;
}) {
  const className = cn(
    "flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : enabled
        ? "border-border text-foreground"
        : "border-border/60 text-muted-foreground opacity-60"
  );

  // A module that isn't built yet stays an inert span — nothing to navigate to.
  if (!enabled) {
    return (
      <span className={className}>
        <Icon className="size-4" />
        {label}
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          Soon
        </Badge>
      </span>
    );
  }

  return (
    <Link
      href={module === "pets" ? "/dashboard?tab=feed" : `/dashboard?module=${module}`}
      scroll={false}
      className={className}
    >
      <Icon className="size-4" />
      {label}
    </Link>
  );
}
