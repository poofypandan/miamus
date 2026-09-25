"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { readStoredTenantId } from "@/lib/tenant";

const ERRORS: Record<string, string> = {
  missing_code: "Sign-in was cancelled. Try again.",
  exchange_failed: "Google sign-in didn't complete. Try again.",
};

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
  const error = ERRORS[useSearchParams().get("error") ?? ""];
  // "deciding" until we know: rendering the sign-in UI first and redirecting
  // after would flash a Google button at every staff member on every launch.
  const [deciding, setDeciding] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

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
      setFailed("Supabase isn't configured on this deployment.");
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
      setFailed("Couldn't reach Google sign-in. Try again.");
      setBusy(false);
    }
    // On success the browser leaves for Google; no need to clear `busy`.
  }

  if (deciding) return <Splash />;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 pb-[calc(3rem+env(safe-area-inset-bottom))] text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Welcome to Miamus</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Run your household from one place — pets, chores, staff and stock.
      </p>

      <Button onClick={handleGoogle} disabled={busy} className="mt-10 min-h-[52px] w-full">
        {busy ? <Loader2 className="animate-spin" /> : <GoogleMark />}
        Continue with Google
      </Button>

      {(failed || error) && <p className="mt-4 text-sm text-destructive">{failed ?? error}</p>}

      {/* Deliberately not a link. Staff who lost their session were tapping
          "Continue with Google", which signs them in as a brand-new owner and
          starts an empty household — it has happened twice in production. The
          way back for a staff phone is its invite link, so that is what this
          says, in Bahasa Indonesia because it is staff who need to read it. */}
      <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-xs leading-relaxed text-amber-900">
        <span className="font-semibold">Untuk Staf:</span> Jangan masuk dengan Google. Silakan
        klik link undangan Miamus di WhatsApp Anda untuk membuka jadwal.
      </p>
    </main>
  );
}

// Deliberately wordless: it shows for a moment on every launch, and whatever
// it said would be wrong for one of the two audiences about to be routed.
function Splash() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
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
