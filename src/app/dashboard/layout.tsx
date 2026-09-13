"use client";

import { useEffect, useRef, type ReactNode, type TouchEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { TopNav } from "@/components/dashboard/top-nav";
import { InventoryAlertBanner } from "@/components/dashboard/inventory-alert-banner";
import { SecureExitButton } from "@/components/dashboard/secure-exit-button";
import { TabTransition } from "@/components/dashboard/tab-transition";

// Left-to-right tab order the swipe gesture moves through.
const TAB_ORDER = ["/dashboard", "/dashboard/schedules", "/dashboard/health"];
const SWIPE_THRESHOLD = 50;
const VERTICAL_TOLERANCE = 40;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Clears any scroll position left over from the virtual keyboard or the
  // PIN modal so every tab switch (and the initial login) lands at the top.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  function handleTouchStart(e: TouchEvent<HTMLElement>) {
    // A swipe that starts inside a horizontally-scrollable widget (the
    // DateRibbon) should scroll that widget, not change tabs.
    if ((e.target as HTMLElement).closest('[data-no-swipe="true"]')) {
      touchStart.current = null;
      return;
    }
    const touch = e.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(e: TouchEvent<HTMLElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaY) >= VERTICAL_TOLERANCE) return;

    const index = TAB_ORDER.indexOf(pathname);
    if (index === -1) return;

    if (deltaX < -SWIPE_THRESHOLD && index < TAB_ORDER.length - 1) {
      router.push(TAB_ORDER[index + 1]);
    } else if (deltaX > SWIPE_THRESHOLD && index > 0) {
      router.push(TAB_ORDER[index - 1]);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 pb-safe">
      <TopNav />
      <InventoryAlertBanner />
      <main
        className="relative flex-1 overflow-x-hidden px-4 py-6"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <TabTransition>{children}</TabTransition>
      </main>
      <SecureExitButton />
    </div>
  );
}
