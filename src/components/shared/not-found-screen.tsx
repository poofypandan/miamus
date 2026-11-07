"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { readCachedOwnerLocale, type OwnerLocale } from "@/lib/owner-locale";

/** Staff routes are Bahasa Indonesia only (AGENTS.md); everyone else their language. */
export function isStaffPath(pathname: string): boolean {
  return pathname.startsWith("/staff") || pathname.startsWith("/join");
}

/**
 * A link that leads nowhere (Phase 157), instead of Next's default English
 * 404: Indonesian on staff routes, otherwise the language this phone last
 * used (English if none). Client-side navigation back, no reload.
 */
export function NotFoundScreen() {
  const pathname = usePathname() ?? "/";
  const [locale, setLocale] = useState<OwnerLocale>(isStaffPath(pathname) ? "id" : "en");
  useEffect(() => {
    if (isStaffPath(pathname)) return;
    const cached = readCachedOwnerLocale();
    if (cached) setLocale(cached);
  }, [pathname]);
  const id = locale === "id";
  const home = pathname.startsWith("/staff") ? "/staff" : "/";
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{id ? "Halaman tidak ditemukan" : "Page not found"}</h1>
        <p className="text-sm text-muted-foreground">
          {id ? "Link ini tidak mengarah ke mana pun." : "This link doesn't lead anywhere."}
        </p>
      </div>
      <Link
        href={home}
        className="flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        {id ? "Kembali ke awal" : "Back to the start"}
      </Link>
    </div>
  );
}
