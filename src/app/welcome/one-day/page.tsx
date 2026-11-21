import { notFound } from "next/navigation";
import { LANDING_HREF } from "@/components/landing/landing-copy";
import { ONE_DAY_PREVIEW_HREF } from "@/components/landing/one-day/one-day-copy";
import { OneDayPage } from "@/components/landing/one-day/one-day-page";
import { oneDayMetadata } from "@/components/landing/one-day/one-day-metadata";
import { oneDayLanding } from "@/lib/landing-flag";

// The "One day" landing page (src/lib/landing-flag.ts), read at build time:
//  - off: 404;
//  - preview: here, noindex, for a look before switching on;
//  - on: next.config.ts serves this page at /welcome and /selamat-datang
//    (and sends this address there), so today's page file stays untouched
//    and its code isn't loaded.
const mode = oneDayLanding();

export const metadata = oneDayMetadata("en", { preview: mode !== "on" });

export default function Page() {
  if (mode === "off") notFound();
  return <OneDayPage locale="en" hrefs={mode === "on" ? LANDING_HREF : ONE_DAY_PREVIEW_HREF} />;
}
