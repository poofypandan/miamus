"use client";

import { HouseholdProvider } from "@/context/household-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return <HouseholdProvider>{children}</HouseholdProvider>;
}
