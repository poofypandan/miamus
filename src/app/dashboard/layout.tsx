"use client";

import { useEffect, type ReactNode } from "react";
import { Suspense } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { InventoryAlertBanner } from "@/components/dashboard/inventory-alert-banner";
import { SecureExitButton } from "@/components/dashboard/secure-exit-button";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // Runs once on mount only — the mobile virtual keyboard (from the PIN
  // entry that got the owner here) can still be collapsing when this layout
  // first mounts, leaving the page scrolled from its perspective. The delay
  // lets that collapse finish before we measure/reset scroll position.
  useEffect(() => {
    const timer = setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 pb-safe">
      {/* TopNav reads the active tab via useSearchParams(), which requires a
          Suspense boundary. */}
      <Suspense fallback={null}>
        <TopNav />
      </Suspense>
      <InventoryAlertBanner />
      <main className="relative flex-1 overflow-x-hidden py-6">{children}</main>
      <SecureExitButton />
    </div>
  );
}
