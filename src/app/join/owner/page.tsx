"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";

type Stage = "checking" | "needs-login" | "redeeming" | "failed";

/**
 * A co-owner accepting their invite (Phase 89).
 *
 * Public, because the person arriving has no account yet — but redeeming
 * requires one, so the flow is: check for a session, send them through Google
 * if there isn't one, and come back here with the token still in the URL.
 * The token rides in the OAuth redirect rather than in storage, so it
 * survives the round trip even on a browser that clears site data between
 * redirects.
 *
 * Owner-facing, so English.
 */
export default function JoinOwnerPage() {
  return (
    <Suspense fallback={null}>
      <JoinOwnerScreen />
    </Suspense>
  );
}

function JoinOwnerScreen() {
  const token = useSearchParams().get("token");
  const [stage, setStage] = useState<Stage>("checking");
  // Redemption spends the token, so React's development double-effect must
  // not run it twice — the second call would fail against a used invite.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token || !supabase) {
      setStage("failed");
      return;
    }
    const client = supabase;

    void (async () => {
      const {
        data: { session },
      } = await client.auth.getSession();

      if (!session) {
        setStage("needs-login");
        return;
      }

      setStage("redeeming");
      const { data, error } = await client.rpc("use_owner_invite_token", { p_token: token });
      if (error || !data) {
        console.error("Owner invite redemption failed", error);
        setStage("failed");
        return;
      }
      // A full load, not a router push: HouseholdProvider resolves the
      // household once at startup, and this account's membership is seconds
      // old. Anything softer would land on the dashboard still pointed at
      // whatever it resolved before.
      window.location.replace("/dashboard");
    })();
  }, [token]);

  async function signIn() {
    if (!supabase || !token) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      // Back to this page, token intact, once Google is done. The callback
      // route forwards `next` after exchanging the code.
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          `/join/owner?token=${token}`
        )}`,
      },
    });
  }

  if (stage === "failed") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Invalid or Expired Link</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This invite has already been used or has expired. Ask the household owner for a new one.
        </p>
        <Link
          href="/"
          className="mt-8 text-sm font-medium text-gray-900 underline underline-offset-4"
        >
          Back to sign in
        </Link>
      </main>
    );
  }

  if (stage === "needs-login") {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          You&apos;ve been invited
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Sign in with Google to join this household as a co-owner.
        </p>
        <Button onClick={signIn} className="mt-8 min-h-[52px] w-full">
          Continue with Google
        </Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {stage === "redeeming" ? "Joining the household…" : "Checking your invite…"}
      </p>
    </main>
  );
}
