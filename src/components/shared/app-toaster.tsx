"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";

// The BottomTabBar's footprint: its h-16 plus the safe-area inset it pads
// itself with. Keep in step with bottom-tab-bar.tsx and dashboard/layout.tsx.
const TAB_BAR = "(4rem + env(safe-area-inset-bottom))";

/**
 * The app's one Toaster, lifted clear of the owner dashboard's bottom tab bar
 * so a "Shopping list copied" doesn't sit on top of the tabs for four seconds.
 *
 * Only on /dashboard — the staff view has no tab bar, so its toasts keep
 * sonner's standard spacing. Lives here rather than in the root layout, which
 * is a server component and can't read the route.
 */
export function AppToaster() {
  const onDashboard = usePathname().startsWith("/dashboard");
  if (!onDashboard) return <Toaster />;
  return (
    <Toaster
      // Sonner's own gaps above the bottom edge (24px desktop, 16px under
      // 600px wide), added on top of the bar rather than replaced by it.
      offset={{ bottom: `calc(${TAB_BAR} + 24px)` }}
      mobileOffset={{ bottom: `calc(${TAB_BAR} + 16px)` }}
    />
  );
}
