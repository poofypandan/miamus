"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLanguageSwitch } from "@/components/shared/public-language-switch";
import { BrandMark } from "@/components/brand/brand-mark";
import { MiamusMark } from "@/components/brand/loading-screens";
import { usePublicLocale } from "@/hooks/use-public-locale";
import type { OwnerLocale } from "@/lib/owner-locale";
import { supabase } from "@/lib/supabase/client";
import { readStoredTenantId } from "@/lib/tenant";

// One language at a time (Phase 150): the phone's, or what the EN | ID switch
// last chose on this phone. See usePublicLocale.
const COPY = {
  en: {
    title: "Welcome to Miamus",
    promise: "A little less on your mind.",
    tagline: "Run your household from one place — pets, chores, people and stock.",
    google: "Continue with Google",
    // Indonesian on the English screen too: it is for staff, who must
    // recognise their own door at a glance whatever the phone is set to.
    staff: "Saya staf",
    consentBefore: "By continuing, you agree to Miamus's ",
    privacy: "Privacy Policy",
    privacyHref: "/privacy",
    consentAfter: ".",
    notConfigured: "Supabase isn't configured on this deployment.",
    unreachable: "Couldn't reach Google sign-in. Try again.",
    errors: {
      missing_code: "Sign-in was cancelled. Try again.",
      exchange_failed: "Google sign-in didn't complete. Try again.",
    } as Record<string, string>,
  },
  id: {
    title: "Selamat datang di Miamus",
    promise: "Biar pikiran sedikit lebih ringan.",
    tagline: "Kelola rumah dari satu tempat — hewan, tugas, orang dan stok.",
    google: "Lanjutkan dengan Google",
    staff: "Saya staf",
    consentBefore: "Dengan melanjutkan, Anda menyetujui ",
    privacy: "Kebijakan Privasi",
    privacyHref: "/privasi",
    consentAfter: ".",
    notConfigured: "Supabase belum disiapkan di server ini.",
    unreachable: "Tidak bisa membuka login Google. Coba lagi.",
    errors: {
      missing_code: "Login dibatalkan. Coba lagi.",
      exchange_failed: "Login Google tidak selesai. Coba lagi.",
    } as Record<string, string>,
  },
} satisfies Record<OwnerLocale, unknown>;

// Written by the staff gate once someone picks their name on this device. Read
// here (rather than through the gate's own module) because this page must
// decide where to send people before any staff component mounts.
const STAFF_ID_KEY = "banyuwangi11:staffId";

/**
 * The front door (Phase 87).
 *
 * This used to be the household's own staff splash; it is now the commercial
 * landing page, and it routes rather than greets:
 *
 *   Google session        -> /dashboard   (the owner)
 *   anonymous session     -> /staff       (a bound staff device, Phase 88)
 *   staff marker on phone -> /staff       (a phone already in service, or one
 *                                          that has opened an invite link)
 *   neither               -> sign-in UI
 *
 * The staff check is what keeps the grandfather promise: a phone that has been
 * logging tasks for months carries a staff id and no Google account, and must
 * never be shown a sign-in screen.
 */
export default function Home() {
  return (
    <Suspense fallback={<Splash />}>
      <FrontDoor />
    </Suspense>
  );
}

function FrontDoor() {
  const router = useRouter();
  const errorKey = useSearchParams().get("error") ?? "";
  // "deciding" until we know: rendering the sign-in UI first and redirecting
  // after would flash a Google button at every staff member on every launch.
  const [deciding, setDeciding] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<"notConfigured" | "unreachable" | null>(null);
  const [locale, setLocale] = usePublicLocale();

  useEffect(() => {
    let cancelled = false;

    async function decide() {
      let staffDevice = !!readStoredTenantId();
      try {
        staffDevice = staffDevice || !!window.localStorage.getItem(STAFF_ID_KEY);
      } catch {
        // Blocked storage: fall through to the sign-in screen, which still
        // offers the staff link.
      }

      // getSession reads the cookie without a network round trip; the owner's
      // own device answers immediately and staff phones skip it entirely.
      const session = supabase ? (await supabase.auth.getSession()).data.session : null;
      if (cancelled) return;

      // An anonymous session means a bound staff device (Phase 88), not an
      // owner — it must land in the staff view, never on the dashboard.
      if (session && !session.user.is_anonymous) {
        router.replace("/dashboard");
        return;
      }
      if (session?.user.is_anonymous || staffDevice) {
        router.replace("/staff");
        return;
      }
      setDeciding(false);
    }

    void decide();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleGoogle() {
    if (!supabase) {
      setFailed("notConfigured");
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Absolute, and built from the live origin so the same code works on
      // localhost and on the deployed domain. Both must be listed as redirect
      // URLs in the Supabase dashboard.
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (signInError) {
      console.error(signInError);
      setFailed("unreachable");
      setBusy(false);
    }
    // On success the browser leaves for Google; no need to clear `busy`.
  }

  if (deciding || !locale) return <Splash />;

  const t = COPY[locale];
  const message = failed ? t[failed] : t.errors[errorKey];

  return (
    <main
      lang={locale}
      className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 pb-[calc(3rem+env(safe-area-inset-bottom))] text-center"
    >
      <PublicLanguageSwitch locale={locale} onChange={setLocale} />

      {/* The mark, still: the same picture as the launch splash a moment ago,
          without its spinner, so this reads as the same app (Phase 150). */}
      <div aria-hidden className="mx-auto mb-6 size-[88px] overflow-hidden rounded-full">
        <BrandMark size={88} rounded={false} />
      </div>

      <h1 className="text-3xl font-semibold tracking-tight text-balance text-gray-900">{t.title}</h1>
      {/* Why, then what (2026-11-08): the philosophy first, the plain
          description under it, smaller. */}
      <p className="mt-3 text-base text-gray-700">{t.promise}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t.tagline}</p>

      <Button onClick={handleGoogle} disabled={busy} className="mt-10 min-h-[52px] w-full gap-3">
        {busy ? <Loader2 className="animate-spin" /> : <GoogleMark />}
        {t.google}
      </Button>

      {/* Staff who lost their session used to tap "Continue with Google",
          which signs them in as a brand-new owner and starts an empty
          household — it happened twice in production. Their own door, as
          plain as the owner's (Phase 150): the house-code sign-in (Phase 151). */}
      <Button variant="outline" onClick={() => router.push("/join/code")} className="mt-3 min-h-[52px] w-full gap-2">
        <UserRound />
        {t.staff}
      </Button>

      {message && <p className="mt-4 text-sm text-destructive">{message}</p>}

      <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
        {t.consentBefore}
        <Link
          href={t.privacyHref}
          className="font-medium whitespace-nowrap text-gray-900 underline underline-offset-4"
        >
          {t.privacy}
        </Link>
        {t.consentAfter}
      </p>
    </main>
  );
}

// Deliberately wordless: it shows for a moment on every launch, and whatever
// it said would be wrong for one of the two audiences about to be routed.
// The circular mark (Phase 123) is the brand rather than either audience's
// screen, and the same picture /dashboard's launch cover opens on — so an
// owner's cold start is one unbroken screen from tap to Agenda.
function Splash() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50">
      <MiamusMark />
    </main>
  );
}

// Google's mark, inline: a remote image would be one more thing to fail on a
// slow connection at the one moment the button has to look trustworthy.
function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className="size-5">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
