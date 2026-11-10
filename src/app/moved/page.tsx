"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isOldHost } from "@/config/hosts";

/**
 * What every page is on an old address (middleware.ts rewrites to it): an
 * empty page, so the page asked for — an invite being redeemed, a queue being
 * drained — never runs there. AddressMoveGate, in the root layout, draws the
 * move screen over it.
 *
 * Opened on the current address by hand, it goes to the start screen.
 */
export default function MovedPage() {
  const router = useRouter();
  useEffect(() => {
    if (!isOldHost(window.location.hostname)) router.replace("/");
  }, [router]);
  return null;
}
