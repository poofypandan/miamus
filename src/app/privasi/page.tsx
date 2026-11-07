import type { Metadata } from "next";
import { PrivacyPolicy } from "@/components/legal/privacy-policy";

// The staff-facing (Bahasa Indonesia) version of /privacy. Public, like it.
export const metadata: Metadata = {
  title: "Kebijakan Privasi - Miamus",
};

export default function PrivasiPage() {
  return <PrivacyPolicy lang="id" />;
}
