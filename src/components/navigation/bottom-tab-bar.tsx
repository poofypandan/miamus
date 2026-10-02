"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  PawPrint,
  Package,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  enabledModules,
  moduleFromParam,
  moduleHref,
  type DashboardModule,
} from "@/lib/dashboard-modules";
import { cn } from "@/lib/utils";

const TABS: Record<DashboardModule, { label: string; icon: LucideIcon }> = {
  pets: { label: "Pets", icon: PawPrint },
  chores: { label: "Chores", icon: ClipboardList },
  agenda: { label: "Agenda", icon: CalendarDays },
  inventory: { label: "Inventory", icon: Package },
  // Holds household members, staff profiles, invite links and the app lock.
  access: { label: "Access", icon: Users },
};

/**
 * The owner dashboard's tab bar, in the thumb zone (Phase 84), five tabs wide
 * (Phase 100): Agenda anchored left, Access right, the household's modules
 * between (Phase 111). Which middles appear is enabledModules' decision.
 *
 * Sticky to the bottom of the dashboard's column (Phase 113), not fixed to
 * the window. Fixed, it had `w-full` but no `left`, so the browser placed it
 * at its static position — the left edge of the centred column — and then made
 * it a whole window wide: on a desktop the tabs sat off to the right of the
 * app, detached from it. Sticky, it is part of the column and cannot leave it;
 * the column is at least a screen tall, so the bar still rests on the bottom
 * edge when a tab's content is short.
 *
 * It occupies its own space now, so the column no longer reserves padding for
 * it. Still rendered outside PullToRefresh, whose content moves with a
 * transform the bar should not follow.
 */
export function BottomTabBar() {
  const searchParams = useSearchParams();
  const activeModule = moduleFromParam(searchParams.get("module"));

  return (
    <nav
      aria-label="Sections"
      // pb-safe keeps the tabs clear of the iOS home indicator and Android's
      // gesture bar; the solid background fills that inset rather than
      // leaving page content showing through beneath the tabs.
      className="sticky bottom-0 z-40 w-full border-t bg-background pb-safe shadow-[0_-1px_8px_rgba(0,0,0,0.04)]"
    >
      <div className="flex h-16">
        {enabledModules().map((module) => {
          const { label, icon: Icon } = TABS[module];
          const active = module === activeModule;
          return (
            <Link
              key={module}
              href={moduleHref(module)}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(
                // px-0.5 and a tighter label: five tabs on a 360px phone leaves
                // about 70px each, which "Inventory" overruns at the old size.
                "flex flex-1 flex-col items-center justify-center gap-1 px-0.5 text-[10px] font-medium active:bg-muted/60",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className="size-6 shrink-0" strokeWidth={active ? 2.25 : 1.75} />
              <span className="w-full truncate text-center">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
