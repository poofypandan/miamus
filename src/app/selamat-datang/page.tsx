import { LandingPage } from "@/components/landing/landing-page";
import { landingMetadata } from "@/components/landing/landing-metadata";

// The public landing page, Indonesian (docs/landing-page-proposal.md). Public on
// purpose: the middleware only guards /dashboard and /onboarding. Static, so
// it is served from the edge cache and costs nothing per visit.
export const metadata = landingMetadata("id");

export default function Page() {
  return <LandingPage locale="id" />;
}
