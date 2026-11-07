"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, RotateCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase/client";
import { ensureAnonymousSession } from "@/lib/auth/device-session";
import { isConnectionError } from "@/lib/network-errors";
import { storeTenantId } from "@/lib/tenant";

/**
 * Where a staff member lands from the WhatsApp invite link (Phase 86C, moved
 * from /join to /join/staff in Phase 89 when co-owner invites arrived).
 *
 * Public: a staff phone has no Google account, and this page is how it gets
 * one. It signs the device in anonymously, then redeems the token through
 * redeem_staff_invite, which spends the invite and binds this device's uid to
 * the household in one statement (migrations/089). From then on the database
 * itself knows which tenant this phone belongs to.
 *
 * Once the device is bound, it is handed to /staff, whose gate asks "Siapa
 * yang bertugas?" and then for that person's PIN. That picker is not
 * duplicated here: it is the same question, and the gate already owns it.
 *
 * Staff-facing, so Bahasa Indonesia.
 *
 * Every failure here used to say the link was used or expired (Phase 147).
 * Most were not: on the house's Wi-Fi the request had simply not arrived, and
 * the advice on screen — ask for a new link — repeated the round trip that
 * had just signed the phone out. The four outcomes are now told apart:
 *
 *   offline   nothing reached the server; the link is untouched. Retries
 *             by itself, and says not to ask for another one.
 *   owner     this phone is signed in with the owner's Google account. The
 *             invite is not spent on it, and the owner is not signed out.
 *   error     the server refused to set up a device identity at all.
 *   invalid   the invite really is used up or expired — after first
 *             checking that this phone is not already the one it bound.
 */
export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinScreen />
    </Suspense>
  );
}

type JoinState = "working" | "offline" | "owner" | "error" | "invalid";

function JoinScreen() {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<JoinState>("working");
  // Bumped by "Coba lagi", the timer and the "online" event.
  const [attempt, setAttempt] = useState(0);
  // Redemption spends the token, so React's development double-effect must
  // not run the same attempt twice — the second call would fail against a
  // used invite. The attempt's promise is kept instead of a "ran" flag, so
  // the replayed effect still hears how it ended: with only a flag, the
  // first run's cleanup silenced the one request there was, and the page sat
  // on the spinner forever (Codex review, PR #2).
  const inFlight = useRef<{ attempt: number; result: Promise<JoinState | null> } | null>(null);
  // The last attempt that finished, so the offline retry waits for it.
  const [settled, setSettled] = useState(-1);

  useEffect(() => {
    if (!token || !supabase) {
      setState("invalid");
      return;
    }
    // Captured so TypeScript keeps the narrowing through the closures below.
    const client = supabase;
    let live = true;
    setState("working");

    // Sends the phone on to /staff if it is already bound to a household.
    // Asked before any "link used" verdict: tapping the link twice in
    // WhatsApp, or losing the answer on the way back, spends the invite on
    // this very phone, and the honest reply to that is to let it in.
    async function goIfBound(userId: string): Promise<boolean> {
      const { data } = await client
        .from("device_sessions")
        .select("household_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!data?.household_id) return false;
      storeTenantId(data.household_id);
      window.location.replace("/staff");
      return true;
    }

    async function redeem(): Promise<JoinState | null> {
      // The identity has to exist before the token is spent:
      // redeem_staff_invite binds auth.uid() to the household, and raises if
      // there is none.
      const identity = await ensureAnonymousSession();
      if (identity.status === "offline") return "offline";
      if (identity.status === "unavailable") return "error";
      // An owner opening a staff link on their own phone. Redeeming would
      // spend the invite on the owner's Google account and file that account
      // as a staff device; neither is what anyone meant.
      if (!identity.isAnonymous) return "owner";

      const { data, error } = await client.rpc("redeem_staff_invite", { p_token: token! });
      if (!error && data) {
        storeTenantId(data);
        // A full page load, not router.replace: HouseholdProvider resolves the
        // household once at startup and is already mounted, so a client-side
        // navigation would land on /staff still pointed at the previous
        // household. location.replace also keeps the spent link out of
        // history, where Back would retry it and show the error screen.
        window.location.replace("/staff");
        return null;
      }
      console.error("Invite redemption failed", error);
      if (await goIfBound(identity.userId)) return null;
      return isConnectionError(error) ? "offline" : "invalid";
    }

    if (inFlight.current?.attempt !== attempt) {
      inFlight.current = {
        attempt,
        result: redeem().catch((err): JoinState => {
          console.error("Invite redemption failed", err);
          return isConnectionError(err) ? "offline" : "error";
        }),
      };
    }
    inFlight.current.result.then((next) => {
      if (!live) return;
      if (next) setState(next);
      setSettled(attempt);
    });
    return () => {
      live = false;
    };
  }, [token, attempt]);

  // Offline: try again 15 seconds after each attempt has finished, and at
  // once when the phone says it is back. Nothing reached the server, so
  // trying costs the invite nothing.
  useEffect(() => {
    if (state !== "offline" || settled !== attempt) return;
    const again = () => setAttempt((n) => n + 1);
    const timer = setTimeout(again, 15_000);
    window.addEventListener("online", again);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", again);
    };
  }, [state, settled, attempt]);

  const retry = () => setAttempt((n) => n + 1);

  if (state === "offline") {
    return (
      <JoinMessage
        icon={<WifiOff className="size-7 text-amber-700" />}
        title="Belum Tersambung"
        body="HP ini belum bisa menghubungi server, jadi undangannya belum dipakai. Periksa Wi-Fi atau data seluler. Tidak perlu minta link baru — halaman ini mencoba lagi sendiri."
        action={
          <Button onClick={retry} variant="outline" className="min-h-[44px] rounded-lg">
            <RotateCw /> Coba lagi
          </Button>
        }
      />
    );
  }

  if (state === "owner") {
    return (
      <JoinMessage
        title="Ini Link untuk HP Staf"
        body="HP ini sedang masuk dengan akun Google pemilik rumah, jadi undangannya tidak dipakai di sini dan masih berlaku. Kirim link ini ke HP staf yang akan memakainya."
        action={
          <Link
            href="/dashboard"
            className="text-sm font-medium text-gray-900 underline underline-offset-4"
          >
            Buka halaman pemilik
          </Link>
        }
      />
    );
  }

  if (state === "error") {
    return (
      <JoinMessage
        title="Gagal Menyiapkan HP Ini"
        body="Server belum bisa menyiapkan HP ini. Coba lagi sebentar lagi; kalau tetap gagal, minta bantuan admin rumah."
        action={
          <Button onClick={retry} variant="outline" className="min-h-[44px] rounded-lg">
            <RotateCw /> Coba lagi
          </Button>
        }
      />
    );
  }

  if (state === "invalid") {
    return (
      <JoinMessage
        title="Link Tidak Berlaku"
        body="Link undangan ini sudah dipakai atau kedaluwarsa. Minta link baru ke admin rumah."
        action={
          <Link href="/" className="text-sm font-medium text-gray-900 underline underline-offset-4">
            Kembali ke halaman utama
          </Link>
        }
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Menyiapkan aplikasi...</p>
    </main>
  );
}

function JoinMessage({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
  action: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      {icon}
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      <div className="mt-5">{action}</div>
    </main>
  );
}
