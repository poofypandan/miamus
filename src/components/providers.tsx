"use client";

import { HouseholdProvider } from "@/context/household-context";
import { AutoRefresh } from "@/components/shared/auto-refresh";
// Side-effect import: registers the beforeinstallprompt listener at app start,
// on whichever route loads first, so the event is never missed.
import "@/hooks/use-pwa-install";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <HouseholdProvider>
      {/* Inside the provider because it reads the household's refresh; renders
          nothing, and covers the owner and staff views alike. */}
      <AutoRefresh />
      {children}
    </HouseholdProvider>
  );
}
