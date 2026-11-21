"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PUBLIC_LOCALE_KEY, type OwnerLocale } from "@/lib/owner-locale";
import { LANDING_HREF } from "./landing-copy";

/**
 * The landing page's only client code: the Google buttons, the EN | ID
 * switch and the links into the app. Everything else on the page is
 * server-rendered, so link previews and search see the words.
 *
 * Each of them first remembers the page's language as this phone's public
 * language (the sign-in screen's, Phase 150), so the sign-in screen opens in
 * it and onboarding lists it first (LanguageChoice orders by it).
 */
export function rememberLocale(locale: OwnerLocale) {
  try {
    window.localStorage.setItem(PUBLIC_LOCALE_KEY, locale);
  } catch {
    // Private mode: the page still works, the next screen just guesses.
  }
}

/** A link into the app that carries the page's language along. */
export function LocaleLink({
  locale,
  href,
  className,
  children,
}: {
  locale: OwnerLocale;
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={className} onClick={() => rememberLocale(locale)}>
      {children}
    </Link>
  );
}

/**
 * EN | ID: the shared pill switch, which moves to the other page. `hrefs`
 * names the two pages when they aren't /welcome and /selamat-datang (the One
 * day preview routes); `className` tints the track for a page that isn't white.
 */
export function LandingLanguageSwitch({
  locale,
  hrefs = LANDING_HREF,
  className,
}: {
  locale: OwnerLocale;
  hrefs?: Record<OwnerLocale, string>;
  className?: string;
}) {
  const router = useRouter();
  return (
    <div className="w-28">
      <SegmentedControl
        className={className}
        ariaLabel="Language · Bahasa"
        value={locale}
        onChange={(next) => {
          if (next === locale) return;
          rememberLocale(next);
          router.push(hrefs[next]);
        }}
        segments={[
          { value: "en", label: "EN" },
          { value: "id", label: "ID" },
        ]}
      />
    </div>
  );
}

