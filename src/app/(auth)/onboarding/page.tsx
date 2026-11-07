"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock, Loader2, ShieldX, UserRoundPlus } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEGAL } from "@/config/legal";
import { useHousehold } from "@/context/household-context";
import { moduleHref } from "@/lib/dashboard-modules";
import {
  canCreateHousehold,
  createHouseholdFailure,
  parseHouseholdAccess,
  type HouseholdAccess,
} from "@/lib/household-access";
import { supabase } from "@/lib/supabase/client";

/**
 * The zero state: a signed-in account with no household yet (Phase 86C,
 * rebuilt as a welcome screen in Phase 111, gated on approval in Phase 148).
 *
 * Reached only through the middleware, which sends a signed-in Google account
 * here when it has no household_members row. Since Phase 148 a new household
 * needs the operator's approval first (migrations/113): the account asks, waits,
 * and only then gets the name form.
 *
 * Owner-facing, so the name form is English. The request, waiting and
 * rejected screens are in both languages: staff who tap "Continue with Google"
 * by mistake land here too, and they read Bahasa Indonesia.
 */
export default function OnboardingPage() {
  const [access, setAccess] = useState<HouseholdAccess | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    // Mock mode (no Supabase configured, local development only) has no
    // accounts to approve: show the form, as before this phase.
    if (!supabase) {
      setAccess("approved");
      return;
    }
    setLoadFailed(false);
    const { data, error } = await supabase.rpc("my_household_access");
    if (error) {
      console.error(error);
      setLoadFailed(true);
      return;
    }
    setAccess(parseHouseholdAccess(data));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Someone waiting tends to come back to an open tab, not a fresh load:
  // re-check whenever the page is shown again.
  useEffect(() => {
    if (access !== "pending") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [access, load]);

  if (loadFailed) {
    return (
      <Screen>
        <Bilingual
          en="Couldn't check your account. Check your connection and try again."
          id="Tidak dapat memeriksa akun Anda. Periksa koneksi lalu coba lagi."
        />
        <Button onClick={() => void load()} className="min-h-[52px]">
          Try again · Coba lagi
        </Button>
        <SignOutButton />
      </Screen>
    );
  }

  if (access === null) {
    return (
      <Screen>
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading" />
      </Screen>
    );
  }

  if (canCreateHousehold(access)) return <CreateHouseholdForm onNotApproved={load} />;
  if (access === "pending") return <WaitingScreen onCheck={load} />;
  if (access === "rejected") return <RejectedScreen />;
  return <RequestScreen onRequested={setAccess} />;
}

// --- Asking -----------------------------------------------------------------------

function RequestScreen({ onRequested }: { onRequested: (access: HouseholdAccess) => void }) {
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function request() {
    if (!supabase || sending) return;
    setSending(true);
    setFailed(false);
    const { data, error } = await supabase.rpc("request_household_access");
    if (error) {
      console.error(error);
      setFailed(true);
      setSending(false);
      return;
    }
    onRequested(parseHouseholdAccess(data));
  }

  return (
    <Screen icon={<UserRoundPlus className="size-5" />}>
      <Heading en="Set up a household" id="Buat rumah baru" />
      <StaffHint />
      <Bilingual
        en="Miamus is invite-only while it's in beta. Ask for access to set up a new household, and we'll review your request."
        id="Miamus masih dalam tahap beta dan hanya dengan undangan. Minta akses untuk membuat rumah baru, dan kami akan meninjau permintaan Anda."
      />
      <Bilingual
        en="Joining someone else's household? Open the invite link they sent you."
        id="Ingin bergabung ke rumah orang lain? Buka link undangan yang mereka kirim."
      />
      <Button onClick={() => void request()} disabled={sending} className="min-h-[52px]">
        {sending && <Loader2 className="animate-spin" />} Request access · Minta akses
      </Button>
      {failed && (
        <Bilingual
          tone="error"
          en="Couldn't send your request. Try again."
          id="Permintaan gagal dikirim. Coba lagi."
        />
      )}
      <p className="text-xs leading-relaxed text-muted-foreground" lang="en">
        Your request shares your Google name and email with {LEGAL.operatorName}, who runs
        Miamus. See the{" "}
        <Link href="/privacy" className="font-medium text-gray-900 underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
      <p className="-mt-2 text-xs leading-relaxed text-muted-foreground" lang="id">
        Permintaan ini membagikan nama dan email Google Anda kepada {LEGAL.operatorName}, pengelola
        Miamus. Lihat{" "}
        <Link href="/privasi" className="font-medium text-gray-900 underline underline-offset-4">
          Kebijakan Privasi
        </Link>
        .
      </p>
      <SignOutButton />
    </Screen>
  );
}

function WaitingScreen({ onCheck }: { onCheck: () => Promise<void> }) {
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      await onCheck();
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen icon={<Clock className="size-5" />}>
      <Heading en="Request sent" id="Permintaan terkirim" />
      <Bilingual
        en="We're reviewing your request. Once it's approved, open Miamus again to name your household."
        id="Kami sedang meninjau permintaan Anda. Setelah disetujui, buka Miamus lagi untuk memberi nama rumah Anda."
      />
      <StaffHint />
      <Button
        variant="outline"
        onClick={() => void check()}
        disabled={checking}
        className="min-h-[52px]"
      >
        {checking && <Loader2 className="animate-spin" />} Check again · Cek lagi
      </Button>
      <SignOutButton />
    </Screen>
  );
}

function RejectedScreen() {
  return (
    <Screen icon={<ShieldX className="size-5" />}>
      <Heading en="Request not approved" id="Permintaan tidak disetujui" />
      <Bilingual
        en={`Miamus can't set up a household for this account right now. Questions? Email ${LEGAL.contactEmail}.`}
        id={`Miamus belum dapat membuat rumah untuk akun ini. Ada pertanyaan? Kirim email ke ${LEGAL.contactEmail}.`}
      />
      <StaffHint />
      <SignOutButton />
    </Screen>
  );
}

// --- Approved: name the household -----------------------------------------------

function CreateHouseholdForm({ onNotApproved }: { onNotApproved: () => Promise<void> }) {
  const router = useRouter();
  const { reloadTenant } = useHousehold();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function enterHousehold() {
    // Before navigating, not after: the household context resolved this
    // device as "no household" when this page loaded, and keeps that answer
    // across a client-side navigation. Without this the dashboard's owner
    // guard saw a non-member and the new household opened on a blank screen.
    await reloadTenant();
    // replace, not push: Back must not return to a form that has already
    // been submitted. The Agenda is the dashboard's default tab.
    router.replace(moduleHref("agenda"));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const residence = name.trim();
    // `saving` too: the button is disabled while saving, but Enter in the
    // field submits the form regardless.
    if (!residence || !supabase || saving) return;

    setSaving(true);
    setFailed(null);
    // One call: the household and the owner membership are written together
    // (migrations/113), so a failure can no longer leave a household nobody
    // can reach (the Phase 120 retry this replaces).
    const { error } = await supabase.rpc("create_household", { p_name: residence });
    if (!error) {
      await enterHousehold();
      return;
    }

    console.error(error);
    switch (createHouseholdFailure(error)) {
      case "has_household":
        // A second tab got there first: open the household that exists.
        await enterHousehold();
        return;
      case "not_approved":
        // Approval was withdrawn while this page was open.
        await onNotApproved();
        return;
      case "invalid_name":
        setFailed("Use a name of up to 60 characters.");
        break;
      default:
        setFailed("Couldn't create your household. Try again.");
    }
    setSaving(false);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <BrandMark size={56} rounded />

      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-gray-900">
        Welcome to Miamus
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Let&apos;s set up your household. It takes one step — then you can add your pets,
        chores and the people who share the house.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <Label htmlFor="residence" className="text-sm font-medium text-gray-900">
          Name your household
        </Label>
        <Input
          id="residence"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. The Smith Residence"
          autoFocus
          autoComplete="off"
          maxLength={60}
          className="min-h-[48px]"
        />
        <p className="text-xs text-muted-foreground">
          Shown at the top of every screen, for everyone in the house.
        </p>
        <Button type="submit" disabled={saving || !name.trim()} className="min-h-[52px]">
          {saving && <Loader2 className="animate-spin" />} Create household
        </Button>
        {failed && <p className="text-sm text-destructive">{failed}</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">
          By creating a household, you confirm you&apos;ve read the{" "}
          <Link href="/privacy" className="font-medium text-gray-900 underline underline-offset-4">
            Privacy Policy
          </Link>{" "}
          and will let the people who work in your home know that Miamus records their tasks,
          photos and leave.
        </p>
      </form>
    </main>
  );
}

// --- Pieces ----------------------------------------------------------------------------

function Screen({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <BrandMark size={48} rounded />
        {icon && (
          <span className="flex size-9 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            {icon}
          </span>
        )}
      </div>
      {children}
    </main>
  );
}

function Heading({ en, id }: { en: string; id: string }) {
  return (
    <div className="mt-2 flex flex-col gap-0.5">
      <h1 lang="en" className="text-2xl font-semibold tracking-tight text-gray-900">
        {en}
      </h1>
      <p lang="id" className="text-base font-medium text-muted-foreground">
        {id}
      </p>
    </div>
  );
}

/** English first, Bahasa Indonesia under it, so both readers find their line. */
function Bilingual({ en, id, tone }: { en: string; id: string; tone?: "error" }) {
  const color = tone === "error" ? "text-destructive" : "text-gray-700";
  return (
    <div className="flex flex-col gap-1">
      <p lang="en" className={`text-sm leading-relaxed ${color}`}>
        {en}
      </p>
      <p lang="id" className={`text-sm leading-relaxed ${tone === "error" ? color : "text-muted-foreground"}`}>
        {id}
      </p>
    </div>
  );
}

/**
 * For the staff member who tapped "Continue with Google" by mistake (it has
 * happened in production — see app/page.tsx). Staff sign in with an invite
 * link and a PIN, never Google. Bahasa Indonesia first: it is for them.
 */
function StaffHint() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p lang="id" className="text-sm leading-relaxed font-medium text-amber-900">
        Staf rumah? Kamu tidak perlu akun Google — minta link undangan ke pemilik rumah.
      </p>
      <p lang="en" className="mt-1 text-xs leading-relaxed text-amber-800">
        Household staff? You don&apos;t need a Google account — ask the homeowner for your invite
        link.
      </p>
    </div>
  );
}

function SignOutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    try {
      await supabase?.auth.signOut();
    } finally {
      // "/" is the sign-in screen; the middleware keeps /onboarding behind it.
      router.replace("/");
    }
  }

  return (
    <Button
      variant="ghost"
      onClick={() => void signOut()}
      disabled={signingOut}
      className="min-h-[44px] text-muted-foreground"
    >
      {signingOut && <Loader2 className="animate-spin" />} Sign out · Keluar
    </Button>
  );
}
