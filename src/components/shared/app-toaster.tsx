"use client";

import { usePathname } from "next/navigation";
import { Toaster } from "@/components/ui/sonner";

// The BottomTabBar's footprint: its h-16 plus the safe-area inset it pads
// itself with. Keep in step with bottom-tab-bar.tsx and dashboard/layout.tsx.
const TAB_BAR = "(4rem + env(safe-area-inset-bottom))";

// The staff header's footprint and a small gap: app-header.tsx's h-17 row,
// its pills (44px, the track's 8px) and pb-3. Keep in step with it.
const STAFF_HEADER = "calc(8.5rem + env(safe-area-inset-top))";

/**
 * The app's one Toaster, lifted clear of the owner dashboard's bottom tab bar
 * so a "Shopping list copied" doesn't sit on top of the tabs for four seconds.
 *
 * Only on /dashboard — the staff view has no tab bar, so its bottom toasts
 * keep sonner's standard spacing; its top ones sit under its header. Lives here rather than in the root layout, which
 * is a server component and can't read the route.
 */
export function AppToaster() {
  const path = usePathname();
  const onDashboard = path.startsWith("/dashboard");
  // The staff view's header (the brand row and the Tugas Hari Ini · Dapur ·
  // Perbaikan pills) is where staff switch views, so a top toast (the update
  // prompt) waits just under it instead of covering it (demo check P-12).
  if (path.startsWith("/staff")) {
    return <Toaster offset={{ top: STAFF_HEADER }} mobileOffset={{ top: STAFF_HEADER }} />;
  }
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
