"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";

const ERRORS: Record<string, string> = {
  missing_code: "Sign-in was cancelled. Try again.",
  exchange_failed: "Google sign-in didn't complete. Try again.",
};

/**
 * The owner's way in (Phase 86C). Owner-facing, so English.
 *
 * Staff never land here: the middleware guards only /dashboard, and their own
 * screens (/, /staff, /join) stay public.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}

function LoginScreen() {
  const error = ERRORS[useSearchParams().get("error") ?? ""];
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function handleGoogle() {
    if (!supabase) {
      setFailed("Supabase isn't configured on this deployment.");
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      // Absolute, and built from the live origin so the same code works on
      // localhost and on the deployed domain. Both must be listed as
      // redirect URLs in the Supabase dashboard.
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (signInError) {
      console.error(signInError);
      setFailed("Couldn't reach Google sign-in. Try again.");
      setBusy(false);
    }
    // On success the browser leaves for Google; no need to clear `busy`.
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 pb-[calc(3rem+env(safe-area-inset-bottom))] text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Miamus</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Sign in to manage your household — pets, chores, staff and stock.
      </p>

      <Button onClick={handleGoogle} disabled={busy} className="mt-10 min-h-[52px] w-full">
        {busy ? <Loader2 className="animate-spin" /> : <GoogleMark />}
        Continue with Google
      </Button>

      {(failed || error) && (
        <p className="mt-4 text-sm text-destructive">{failed ?? error}</p>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Staff don&apos;t sign in here —{" "}
        <Link href="/staff" className="underline underline-offset-4">
          open the staff view
        </Link>
        .
      </p>
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
