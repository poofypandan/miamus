"use client";

import { HouseholdProvider } from "@/context/household-context";
// Side-effect import: registers the beforeinstallprompt listener at app start,
// on whichever route loads first, so the event is never missed.
import "@/hooks/use-pwa-install";

export function Providers({ children }: { children: React.ReactNode }) {
  return <HouseholdProvider>{children}</HouseholdProvider>;
}
