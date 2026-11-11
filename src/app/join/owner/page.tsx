"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicLanguageSwitch } from "@/components/shared/public-language-switch";
import { usePublicLocale } from "@/hooks/use-public-locale";
import { supabase } from "@/lib/supabase/client";

type Stage = "checking" | "needs-login" | "redeeming" | "failed" | "already-member";

const COPY = {
  en: {
    expiredTitle: "Invalid or expired link",
    expiredBody: "This invite has already been used or has expired. Ask a household admin for a new one.",
    alreadyTitle: "This account already has a household",
    alreadyBody:
      "For now, a Google account can belong to one household only. Sign in with a different Google account, or ask the person who invited you to invite that one. The invite still works.",
    backToSignIn: "Back to sign in",
    invitedTitle: "You've been invited",
    invitedBody: "Sign in with Google to join this household as an admin.",
    google: "Continue with Google",
    joining: "Joining the household…",
    checking: "Checking your invite…",
  },
  id: {
    expiredTitle: "Link tidak valid atau kedaluwarsa",
    expiredBody: "Undangan ini sudah dipakai atau sudah kedaluwarsa. Minta yang baru ke admin rumah.",
    alreadyTitle: "Akun ini sudah punya rumah",
    alreadyBody:
      "Untuk saat ini, satu akun Google hanya bisa masuk ke satu rumah. Masuk dengan akun Google lain, atau minta yang mengundang Anda untuk mengundang akun itu. Undangannya masih berlaku.",
    backToSignIn: "Kembali ke halaman masuk",
    invitedTitle: "Anda diundang",
    invitedBody: "Masuk dengan Google untuk bergabung ke rumah ini sebagai admin.",
    google: "Lanjutkan dengan Google",
    joining: "Bergabung ke rumah…",
    checking: "Memeriksa undangan…",
  },
} as const;

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
 * One language at a time, the phone's or the EN | ID switch's (Phase 150):
 * the person arriving has not chosen one yet — they may not even have an
 * account — and the dashboard asks them once they are in.
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
  const [locale, setLocale] = usePublicLocale();
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
        // One household per account for now (migrations/146, audit M2).
        setStage(error?.message?.includes("already_in_a_household") ? "already-member" : "failed");
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

  if (!locale) return null;
  const t = COPY[locale];

  if (stage === "failed" || stage === "already-member") {
    const already = stage === "already-member";
    return (
      <main
        lang={locale}
        className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-center"
      >
        <PublicLanguageSwitch locale={locale} onChange={setLocale} />
        <h1 className="text-xl font-semibold text-gray-900">{already ? t.alreadyTitle : t.expiredTitle}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{already ? t.alreadyBody : t.expiredBody}</p>
        <Link
          href="/"
          className="mt-8 text-sm font-medium text-gray-900 underline underline-offset-4"
        >
          {t.backToSignIn}
        </Link>
      </main>
    );
  }

  if (stage === "needs-login") {
    return (
      <main
        lang={locale}
        className="relative mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 text-center"
      >
        <PublicLanguageSwitch locale={locale} onChange={setLocale} />
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{t.invitedTitle}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t.invitedBody}</p>
        <Button onClick={signIn} className="mt-8 min-h-[52px] w-full">
          {t.google}
        </Button>
      </main>
    );
  }

  return (
    <main lang={locale} className="flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        {stage === "redeeming" ? t.joining : t.checking}
      </p>
    </main>
  );
}
