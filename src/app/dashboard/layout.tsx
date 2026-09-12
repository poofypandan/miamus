import type { ReactNode } from "react";
import { TopNav } from "@/components/dashboard/top-nav";
import { InventoryAlertBanner } from "@/components/dashboard/inventory-alert-banner";
import { SecureExitButton } from "@/components/dashboard/secure-exit-button";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-slate-50 pb-safe">
      <TopNav />
      <InventoryAlertBanner />
      <main className="flex-1 px-4 py-6">{children}</main>
      <SecureExitButton />
    </div>
  );
}
