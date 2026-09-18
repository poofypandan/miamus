"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Home, PawPrint, Users, type LucideIcon } from "lucide-react";
import { MODULES } from "@/config/modules";
import { moduleFromParam, type DashboardModule } from "@/lib/dashboard-modules";
import { cn } from "@/lib/utils";

const TABS: { module: DashboardModule; label: string; icon: LucideIcon; href: string }[] = [
  { module: "pets", label: "Pets", icon: PawPrint, href: "/dashboard?tab=feed" },
  { module: "household", label: "Household", icon: Home, href: "/dashboard?module=household" },
  { module: "staff", label: "Staff", icon: Users, href: "/dashboard?module=staff" },
];

/**
 * The owner dashboard's module switcher, in the thumb zone (Phase 84). It used
 * to be a row of pills in the header — the hardest place on a phone to reach
 * one-handed.
 *
 * Must be rendered outside PullToRefresh: that wrapper moves its content with
 * a CSS transform, and a transformed ancestor becomes the containing block of
 * a `position: fixed` child, so the bar would scroll away with the page.
 *
 * The bar is h-16 (4rem) plus the safe-area inset; dashboard/layout.tsx
 * reserves exactly that much space below the content, so change both together.
 */
export function BottomTabBar() {
  const searchParams = useSearchParams();
  const activeModule = moduleFromParam(searchParams.get("module"));

  return (
    <nav
      aria-label="Modules"
      // pb-safe keeps the tabs clear of the iOS home indicator and Android's
      // gesture bar; the solid background fills that inset rather than
      // leaving page content showing through beneath the tabs.
      className="fixed bottom-0 z-50 w-full border-t bg-background pb-safe shadow-[0_-1px_8px_rgba(0,0,0,0.04)]"
    >
      {/* Capped to the app's column, so on a tablet or desktop the tabs sit
          under the content they switch rather than at the screen's edges. */}
      <div className="mx-auto flex h-16 max-w-md">
        {TABS.map(({ module, label, icon: Icon, href }) => {
          const active = module === activeModule;
          const className = cn(
            "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
            active ? "text-primary" : "text-muted-foreground"
          );

          // A module that isn't built yet stays visible but inert.
          if (!MODULES[module]) {
            return (
              <span key={module} className={cn(className, "opacity-40")} aria-disabled>
                <Icon className="size-6" />
                {label}
              </span>
            );
          }

          return (
            <Link
              key={module}
              href={href}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn(className, "active:bg-muted/60")}
            >
              <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
