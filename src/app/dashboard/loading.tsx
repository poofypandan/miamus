import { OwnerLoadingScreen } from "@/components/brand/loading-screens";

// Shown inside the dashboard layout (header and tab bar stay put) while a
// route-level transition into /dashboard resolves — arriving from onboarding,
// an invite, or a cold start. Switching tabs never gets here: that is a
// client-side URL change with no server round trip (Phase 121).
export default function DashboardLoading() {
  return <OwnerLoadingScreen />;
}
