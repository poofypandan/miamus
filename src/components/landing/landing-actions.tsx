"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OwnerLocale } from "@/lib/owner-locale";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { rememberLocale } from "./landing-links";

// The links and the EN | ID switch live in landing-links.tsx, so a page can
// use them without loading the Supabase client this file needs for Google.
export { LandingLanguageSwitch, LocaleLink } from "./landing-links";

/**
 * "Request access" / "Continue with Google": the same Google sign-in as the
 * front door (src/app/page.tsx). A new account lands on /onboarding through
 * the middleware, which asks for the language and then the access request
 * (Phase 148). Nothing new is collected here.
 */
export function LandingGoogleButton({
  locale,
  label,
  failedText,
  google = false,
  className,
}: {
  locale: OwnerLocale;
  label: string;
  failedText: string;
  /** Show Google's mark (the closing section); the hero's button is plain. */
  google?: boolean;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    rememberLocale(locale);
    if (!supabase) {
      setFailed(true);
      return;
    }
    setBusy(true);
    setFailed(false);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      console.error(error);
      setFailed(true);
      setBusy(false);
    }
    // On success the browser leaves for Google.
  }

  return (
    <>
      <Button
        onClick={() => void handleClick()}
        disabled={busy}
        className={cn("min-h-[52px] w-full gap-3 rounded-xl text-base", className)}
      >
        {busy ? <Loader2 className="animate-spin" /> : google && <GoogleMark />}
        {label}
      </Button>
      {failed && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {failedText}
        </p>
      )}
    </>
  );
}

// Google's mark, inline (as on the front door): no remote image to fail.
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-5 rounded-full bg-white p-0.5">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z" />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
