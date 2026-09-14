"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Home, PawPrint, Users, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MODULES } from "@/config/modules";
import { cn } from "@/lib/utils";
import { tabIndex, type DashboardTab } from "@/lib/dashboard-tabs";
import { useHousehold } from "@/context/household-context";

const SUB_NAV: { tab: DashboardTab; label: string }[] = [
  { tab: "feed", label: "Daily Feed" },
  { tab: "schedules", label: "Schedule" },
];

export function TopNav() {
  const searchParams = useSearchParams();
  const activeIndex = tabIndex(searchParams.get("tab"));
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
        <ModuleTab icon={PawPrint} label="Pets" active enabled />
        <ModuleTab icon={Home} label="Household" active={false} enabled={MODULES.household} />
        <ModuleTab icon={Users} label="Staff" active={false} enabled={MODULES.staff} />
      </div>

      {/* Staff only ever has the Daily Feed tab — a single-item tab row is
          pure clutter, so skip it entirely rather than rendering it. */}
      {isOwner && (
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SUB_NAV.map((item, index) => {
            const isActive = index === activeIndex;
            return (
              <Link
                key={item.tab}
                href={`/dashboard?tab=${item.tab}`}
                scroll={false}
                className={cn(
                  "flex min-h-[48px] shrink-0 items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function ModuleTab({
  icon: Icon,
  label,
  active,
  enabled,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  enabled: boolean;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : enabled
            ? "border-border text-foreground"
            : "border-border/60 text-muted-foreground opacity-60"
      )}
    >
      <Icon className="size-4" />
      {label}
      {!enabled && (
        <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
          Soon
        </Badge>
      )}
    </span>
  );
}
