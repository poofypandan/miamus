"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleAlert, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isStaffPath } from "@/components/shared/not-found-screen";
import { readCachedOwnerLocale, type OwnerLocale } from "@/lib/owner-locale";

/**
 * What a screen shows if it crashes (Phase 157), instead of Next's default
 * English "Application error" page. Staff screens (/staff, /join) are Bahasa
 * Indonesia; owners get the language this phone last used, English if none.
 * Calm: no red page, no technical words. "Try again" re-renders the screen
 * in place (Next's reset), with no page reload.
 */
export function ErrorScreen({ reset }: { reset: () => void }) {
  const pathname = usePathname() ?? "/";
  const [locale, setLocale] = useState<OwnerLocale>(isStaffPath(pathname) ? "id" : "en");
  useEffect(() => {
    if (isStaffPath(pathname)) return;
    const cached = readCachedOwnerLocale();
    if (cached) setLocale(cached);
  }, [pathname]);

  const id = locale === "id";
  const home = pathname.startsWith("/staff") ? "/staff" : pathname.startsWith("/dashboard") ? "/dashboard" : "/";

  return (
    <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CircleAlert className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{id ? "Ada yang tidak beres" : "Something went wrong"}</h1>
        <p className="text-sm text-muted-foreground">
          {id
            ? "Layar ini gagal dibuka. Data Anda aman. Coba lagi sebentar."
            : "This screen didn't open. Your data is safe. Please try again."}
        </p>
      </div>
      <Button className="min-h-12 w-full max-w-xs rounded-xl" onClick={reset}>
        <RotateCcw /> {id ? "Coba lagi" : "Try again"}
      </Button>
      {/* Client-side, so going back to the start never reloads the app
          (Codex review, PR #14). */}
      <Link href={home} className="flex min-h-11 items-center text-sm font-medium text-gray-700">
        {id ? "Kembali ke awal" : "Back to the start"}
      </Link>
    </div>
  );
}
