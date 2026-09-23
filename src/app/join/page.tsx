"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { storeTenantId } from "@/lib/tenant";

/**
 * Where a staff member lands from the WhatsApp invite link (Phase 86C).
 *
 * Public: a staff phone has no Google account, and this page is how it learns
 * which household it belongs to. The token is redeemed through the
 * use_staff_invite_token RPC — `anon` cannot read staff_invites at all, so a
 * stolen key can't enumerate other households' links (migrations/088).
 *
 * Staff-facing, so Bahasa Indonesia.
 */
export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinScreen />
    </Suspense>
  );
}

function JoinScreen() {
  const token = useSearchParams().get("token");
  const [failed, setFailed] = useState(false);
  // Redemption spends the token, so React's development double-effect must
  // not run it twice — the second call would fail against a used invite.
  const redeemed = useRef(false);

  useEffect(() => {
    if (redeemed.current) return;
    redeemed.current = true;

    if (!token || !supabase) {
      setFailed(true);
      return;
    }

    supabase
      .rpc("use_staff_invite_token", { p_token: token })
      .then(({ data, error }) => {
        if (error || !data) {
          console.error("Invite redemption failed", error);
          setFailed(true);
          return;
        }
        storeTenantId(data);
        // A full page load, not router.replace: HouseholdProvider resolves the
        // household once at startup and is already mounted, so a client-side
        // navigation would land on /staff still pointed at the previous
        // household. location.replace also keeps the spent link out of
        // history, where Back would retry it and show the error screen.
        window.location.replace("/staff");
      });
  }, [token]);

  if (failed) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Link Tidak Berlaku</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Link undangan ini sudah dipakai atau kedaluwarsa. Minta link baru ke pemilik rumah.
        </p>
        <Link
          href="/"
          className="mt-8 text-sm font-medium text-gray-900 underline underline-offset-4"
        >
          Kembali ke halaman utama
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Menyiapkan aplikasi...</p>
    </main>
  );
}
