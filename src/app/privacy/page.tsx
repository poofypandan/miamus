import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/legal/privacy-policy";

// Public on purpose: the middleware only guards /dashboard and /onboarding,
// and anyone must be able to read this before signing in.
export const metadata: Metadata = {
  title: "Privacy Policy - Miamus",
};

export default function PrivacyPage() {
  return <PrivacyPolicy lang="en" />;
}
