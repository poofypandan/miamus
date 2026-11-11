"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Clock, Languages, Loader2, Mail, MessageCircle, PawPrint, ShieldX, UserRoundPlus } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { LanguageChoice } from "@/components/dashboard/language-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LEGAL } from "@/config/legal";
import { useHousehold } from "@/context/household-context";
import {
  OwnerLocaleProvider,
  useOwnerLocaleContext,
  useT,
} from "@/context/owner-locale-context";
import { moduleHref } from "@/lib/dashboard-modules";
import {
  canCreateHousehold,
  createHouseholdFailure,
  formatWhatsApp,
  normalizeWhatsApp,
  parseHouseholdAccess,
  type HouseholdAccess,
} from "@/lib/household-access";
import { clearCachedOwnerLocale, LOCALE_NAMES } from "@/lib/owner-locale";
import { supabase } from "@/lib/supabase/client";

/**
 * The zero state: a signed-in account with no household yet (Phase 86C,
 * rebuilt as a welcome screen in Phase 111, gated on approval in Phase 148).
 *
 * Reached only through the middleware, which sends a signed-in Google account
 * here when it has no household_members row. Since Phase 148 a new household
 * needs the operator's approval first (migrations/113), and it still does:
 * the owner approves every new household (2026-11-10). Phase 172
 * (migrations/143) built automatic approval behind a switch that is off:
 * only if a platform admin turns it on does an account read "open" and go
 * straight to the name form, Create household approving it in the same
 * call. Otherwise it asks and waits (the Request and Waiting screens below),
 * and the waiting screen says it will be emailed.
 *
 * Since Phase 149 the first question is the language (migrations/114), and
 * every screen after it is in the one chosen. The staff hint stays in both:
 * staff who tap "Continue with Google" by mistake land here too, and they
 * read Bahasa Indonesia whichever button they pressed.
 */
export default function OnboardingPage() {
  return (
    <OwnerLocaleProvider>
      <Onboarding />
    </OwnerLocaleProvider>
  );
}

function Onboarding() {
  const t = useT();
  const { chosen, ready } = useOwnerLocaleContext();
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
        <Body>
          {t(
            "Couldn't check your account. Check your connection and try again.",
            "Tidak dapat memeriksa akun Anda. Periksa koneksi lalu coba lagi."
          )}
        </Body>
        <Button onClick={() => void load()} className="min-h-[52px]">
          {t("Try again", "Coba lagi")}
        </Button>
        <SignOutButton />
      </Screen>
    );
  }

  if (access === null || !ready) {
    return (
      <Screen>
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-label={t("Loading", "Memuat")}
        />
      </Screen>
    );
  }

  // First, before anything is asked of them in either language.
  if (chosen === false) return <LanguageScreen />;

  // Only with automatic approval switched on (Phase 172, D1; off by
  // default): over the cap since the screen opened, the household isn't
  // created and nothing is written; file the request, then show Request
  // sent. Anything else that refuses re-reads the account.
  async function notApproved() {
    if (access !== "open" || !supabase) return load();
    const { data, error } = await supabase.rpc("request_household_access");
    if (error) {
      console.error(error);
      return load();
    }
    setAccess(parseHouseholdAccess(data));
  }

  if (canCreateHousehold(access)) return <CreateHouseholdForm onNotApproved={notApproved} />;
  if (access === "pending") return <WaitingScreen onCheck={load} />;
  if (access === "rejected") return <RejectedScreen />;
  return <RequestScreen onRequested={setAccess} />;
}

// --- The language -------------------------------------------------------------------

function LanguageScreen() {
  return (
    <Screen icon={<Languages className="size-5" />} switcher={false}>
      <div className="mt-2 flex flex-col gap-0.5">
        <h1 lang="en" className="text-2xl font-semibold tracking-tight text-gray-900">
          Choose your language
        </h1>
        <p lang="id" className="text-base font-medium text-muted-foreground">
          Pilih bahasa Anda
        </p>
      </div>
      <p className="text-sm leading-relaxed text-gray-700">
        <span lang="en">You can change it later under Household.</span>{" "}
        <span lang="id" className="text-muted-foreground">
          Bisa diubah nanti di tab Rumah.
        </span>
      </p>
      <LanguageChoice />
      <StaffHint />
      <SignOutButton bilingual />
    </Screen>
  );
}

// --- Asking -----------------------------------------------------------------------

function RequestScreen({ onRequested }: { onRequested: (access: HouseholdAccess) => void }) {
  const t = useT();
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
      <Heading>{t("Set up a household", "Buat rumah baru")}</Heading>
      <StaffHint />
      <Body>
        {t(
          "Miamus is invite-only while it's in beta. Ask for access to set up a new household, and we'll review your request.",
          "Miamus masih dalam tahap beta dan hanya dengan undangan. Minta akses untuk membuat rumah baru, dan kami akan meninjau permintaan Anda."
        )}
      </Body>
      <Body muted>
        {t(
          "Joining someone else's household? Open the invite link they sent you.",
          "Ingin bergabung ke rumah orang lain? Buka link undangan yang mereka kirim."
        )}
      </Body>
      <Button onClick={() => void request()} disabled={sending} className="min-h-[52px]">
        {sending && <Loader2 className="animate-spin" />} {t("Request access", "Minta akses")}
      </Button>
      {failed && (
        <Body tone="error">
          {t("Couldn't send your request. Try again.", "Permintaan gagal dikirim. Coba lagi.")}
        </Body>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t(
          `Your request shares your Google name and email with ${LEGAL.operatorName}, who runs Miamus. See the `,
          `Permintaan ini membagikan nama dan email Google Anda kepada ${LEGAL.operatorName}, pengelola Miamus. Lihat `
        )}
        <PrivacyLink />.
      </p>
      <SignOutButton />
    </Screen>
  );
}

function WaitingScreen({ onCheck }: { onCheck: () => Promise<void> }) {
  const t = useT();
  const [checking, setChecking] = useState(false);
  // The address the operator writes to (D2): the Google account's own, read
  // on the phone. Null until known, or in mock mode.
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void supabase?.auth.getUser().then(({ data }) => {
      if (!cancelled) setEmail(data.user?.email ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      <Heading>{t("Request sent", "Permintaan terkirim")}</Heading>
      <Body>
        {t(
          "We'll let you know by WhatsApp or email, usually within a day.",
          "Kami akan memberi tahu lewat WhatsApp atau email, biasanya dalam sehari."
        )}
      </Body>
      <TellMeBy email={email} />
      <StaffHint />
      <Button
        variant="outline"
        onClick={() => void check()}
        disabled={checking}
        className="min-h-[52px]"
      >
        {checking && <Loader2 className="animate-spin" />} {t("Check again", "Cek lagi")}
      </Button>
      <SignOutButton />
    </Screen>
  );
}

/**
 * "How should we let you know?" (owner, 2026-11-11): one optional question,
 * only here, while someone waits for approval. Email (their sign-up address,
 * nothing to type) unless they choose WhatsApp and leave a number. The
 * number is checked and stored as 628… by set_my_access_contact
 * (migrations/143), seen only by the operator, and deleted once they're told
 * (30 days at most). The line under the field is the notice; typing the
 * number after it is the consent.
 */
function TellMeBy({ email }: { email: string | null }) {
  const t = useT();
  const { locale } = useOwnerLocaleContext();
  const [mode, setMode] = useState<"email" | "whatsapp">("email");
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<"invalid" | "failed" | null>(null);

  // What they chose before, on an earlier visit.
  useEffect(() => {
    let cancelled = false;
    void supabase?.rpc("my_access_contact").then(({ data, error }) => {
      if (cancelled || error || typeof data !== "string" || !data) return;
      setSaved(data);
      setMode("whatsapp");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function store(value: string | null): Promise<boolean> {
    if (!supabase) return false;
    setBusy(true);
    setProblem(null);
    const { data, error } = await supabase.rpc("set_my_access_contact", { p_whatsapp: value });
    setBusy(false);
    if (error) {
      setProblem(error.message?.includes("invalid_whatsapp") ? "invalid" : "failed");
      return false;
    }
    setSaved(typeof data === "string" && data ? data : null);
    return true;
  }

  async function chooseEmail() {
    setMode("email");
    setProblem(null);
    // A number left earlier goes: email it is.
    if (saved) await store(null);
  }

  async function saveNumber(e: React.FormEvent) {
    e.preventDefault();
    const number = normalizeWhatsApp(draft);
    if (!number) {
      setProblem("invalid");
      return;
    }
    if (await store(number)) setDraft("");
  }

  const chip = (on: boolean) =>
    on
      ? "flex min-h-11 items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-4 text-sm font-medium text-white"
      : "flex min-h-11 items-center gap-1.5 rounded-full border bg-white px-4 text-sm font-medium text-gray-700 active:bg-muted";

  return (
    <fieldset className="flex flex-col gap-2 rounded-xl border bg-white px-4 py-3">
      <legend className="sr-only">{t("How should we let you know?", "Bagaimana kami memberi tahu Anda?")}</legend>
      <p aria-hidden className="text-sm font-medium text-gray-900">
        {t("How should we let you know?", "Bagaimana kami memberi tahu Anda?")}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={mode === "email"} disabled={busy} onClick={() => void chooseEmail()} className={chip(mode === "email")}>
          <Mail className="size-4" aria-hidden /> {t("Email", "Email")}
        </button>
        <button
          type="button"
          aria-pressed={mode === "whatsapp"}
          disabled={busy}
          onClick={() => {
            setMode("whatsapp");
            setProblem(null);
          }}
          className={chip(mode === "whatsapp")}
        >
          <MessageCircle className="size-4" aria-hidden /> {t("WhatsApp", "WhatsApp")}
        </button>
      </div>
      {mode === "email" ? (
        email && (
          <p className="text-xs text-muted-foreground">
            {t(`We'll write to ${email}.`, `Kami akan mengirim ke ${email}.`)}
          </p>
        )
      ) : saved && !draft ? (
        <p className="text-xs text-muted-foreground">
          {t(
            `We'll message you on WhatsApp at ${formatWhatsApp(saved)}.`,
            `Kami akan mengirim pesan WhatsApp ke ${formatWhatsApp(saved)}.`
          )}{" "}
          <button type="button" onClick={() => setDraft(formatWhatsApp(saved))} className="font-medium text-gray-900 underline underline-offset-4">
            {t("Change", "Ubah")}
          </button>
        </p>
      ) : (
        <form onSubmit={(e) => void saveNumber(e)} className="flex flex-col gap-2">
          <Label htmlFor="tell-whatsapp" className="text-xs font-medium text-gray-900">
            {t("Your WhatsApp number", "Nomor WhatsApp Anda")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="tell-whatsapp"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="0812 3456 7890"
              maxLength={24}
              className="min-h-[44px] flex-1"
            />
            <Button type="submit" disabled={busy || !draft.trim()} className="min-h-[44px] rounded-lg">
              {busy && <Loader2 className="animate-spin" />} {t("Save", "Simpan")}
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(
              "We'll use your number only to tell you you're approved, then delete it. ",
              "Nomor Anda hanya kami pakai untuk memberi tahu bahwa Anda sudah disetujui, lalu kami hapus. "
            )}
            <Link
              href={locale === "id" ? "/privasi#household-requests" : "/privacy#household-requests"}
              className="font-medium text-gray-900 underline underline-offset-4"
            >
              {t("Privacy policy", "Kebijakan privasi")}
            </Link>
          </p>
        </form>
      )}
      {problem && (
        <p className="text-xs text-destructive" role="alert">
          {problem === "invalid"
            ? t(
                "Enter an Indonesian mobile number, like 0812 3456 7890.",
                "Masukkan nomor HP Indonesia, misalnya 0812 3456 7890."
              )
            : t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi.")}
        </p>
      )}
    </fieldset>
  );
}

function RejectedScreen() {
  const t = useT();
  return (
    <Screen icon={<ShieldX className="size-5" />}>
      <Heading>{t("Request not approved", "Permintaan tidak disetujui")}</Heading>
      <Body>
        {t(
          `Miamus can't set up a household for this account right now. Questions? Email ${LEGAL.contactEmail}.`,
          `Miamus belum dapat membuat rumah untuk akun ini. Ada pertanyaan? Kirim email ke ${LEGAL.contactEmail}.`
        )}
      </Body>
      <StaffHint />
      <SignOutButton />
    </Screen>
  );
}

// --- Approved: name the household -----------------------------------------------

function CreateHouseholdForm({ onNotApproved }: { onNotApproved: () => Promise<void> }) {
  const t = useT();
  const router = useRouter();
  const { reloadTenant } = useHousehold();
  const [name, setName] = useState("");
  // "Who lives here?" (Phase 162, D2): nothing pre-selected, so an untouched
  // chip means no pets.
  const [hasPets, setHasPets] = useState(false);
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
    const { error } = await supabase.rpc("create_household", {
      p_name: residence,
      p_has_pets: hasPets,
    });
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
        // Over the day's cap since the page opened, or approval withdrawn.
        // The screen may stay on this form (the request came back approved:
        // Codex, PR #84), so the button must work again.
        await onNotApproved();
        setSaving(false);
        return;
      case "invalid_name":
        setFailed(t("Use a name of up to 60 characters.", "Gunakan nama paling banyak 60 karakter."));
        break;
      default:
        setFailed(t("Couldn't create your household. Try again.", "Rumah gagal dibuat. Coba lagi."));
    }
    setSaving(false);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <BrandMark size={56} rounded />

      <h1 className="mt-6 text-2xl font-semibold tracking-tight text-gray-900">
        {t("Welcome to Miamus", "Selamat datang di Miamus")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          "Let's set up your household. It takes one step — then you can add your chores, staff and family.",
          "Mari siapkan rumah Anda. Cukup satu langkah — lalu Anda bisa menambahkan tugas, staf dan keluarga."
        )}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-3">
        <Label htmlFor="residence" className="text-sm font-medium text-gray-900">
          {t("Name your household", "Beri nama rumah Anda")}
        </Label>
        <Input
          id="residence"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("e.g. The Smith Residence", "mis. Rumah Keluarga Wijaya")}
          autoFocus
          autoComplete="off"
          maxLength={60}
          className="min-h-[48px]"
        />
        <p className="text-xs text-muted-foreground">
          {t(
            "Shown at the top of every screen, for everyone in the house.",
            "Ditampilkan di bagian atas setiap layar, untuk semua orang di rumah."
          )}
        </p>
        <WhoLivesHere hasPets={hasPets} onChange={setHasPets} />
        <Button type="submit" disabled={saving || !name.trim()} className="min-h-[52px]">
          {saving && <Loader2 className="animate-spin" />} {t("Create household", "Buat rumah")}
        </Button>
        {failed && <p className="text-sm text-destructive">{failed}</p>}
        <p className="text-xs leading-relaxed text-muted-foreground">
          {/* Moved here from the Request screen (Phase 172): creating a
              household is now what shares it. */}
          {t(
            `Creating a household shares your Google name and email with ${LEGAL.operatorName}, who runs Miamus. By creating it, you confirm you've read the `,
            `Membuat rumah membagikan nama dan email Google Anda kepada ${LEGAL.operatorName}, pengelola Miamus. Dengan membuatnya, Anda menyatakan sudah membaca `
          )}
          <PrivacyLink />
          {t(
            " and will let the people who work in your home know that Miamus records their tasks, photos and leave.",
            " dan akan memberi tahu orang yang bekerja di rumah Anda bahwa Miamus mencatat tugas, foto dan cuti mereka."
          )}
        </p>
      </form>
      <LanguageSwitch />
    </main>
  );
}

// --- Who lives here? (Phase 162) ------------------------------------------------------

/**
 * One question under the name, so sign-up stays one step. Pets now; Kids and
 * Elders shown greyed as "Soon" so people see where it's going (D1). They are
 * not buttons and store nothing: recording that children or elderly people
 * live in a home needs its own privacy-policy update, with the Care tab.
 */
function WhoLivesHere({
  hasPets,
  onChange,
}: {
  hasPets: boolean;
  onChange: (next: boolean) => void;
}) {
  const t = useT();
  return (
    <fieldset className="mt-3 flex flex-col gap-2">
      <legend className="text-sm font-medium text-gray-900">
        {t("Who lives here?", "Siapa yang tinggal di sini?")}
      </legend>
      <p className="text-xs text-muted-foreground">
        {t(
          "Miamus shows only what fits your home. Change it any time under Household.",
          "Miamus hanya menampilkan yang sesuai dengan rumah Anda. Bisa diubah kapan saja di tab Rumah."
        )}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={hasPets}
          onClick={() => onChange(!hasPets)}
          className={
            hasPets
              ? "flex min-h-11 items-center gap-1.5 rounded-full border border-gray-900 bg-gray-900 px-4 text-sm font-medium text-white"
              : "flex min-h-11 items-center gap-1.5 rounded-full border bg-white px-4 text-sm font-medium text-gray-700 active:bg-muted"
          }
        >
          <PawPrint className="size-4" aria-hidden />
          {t("Pets", "Hewan")}
        </button>
        {[t("Kids", "Anak"), t("Elders", "Lansia")].map((label) => (
          <span
            key={label}
            aria-disabled="true"
            className="flex min-h-11 items-center gap-1 rounded-full border border-dashed px-4 text-sm text-gray-400"
          >
            {label}
            <span className="text-[11px]">· {t("Soon", "Segera")}</span>
          </span>
        ))}
      </div>
    </fieldset>
  );
}

// --- Pieces ----------------------------------------------------------------------------

function Screen({
  icon,
  switcher = true,
  children,
}: {
  icon?: ReactNode;
  /** The small "other language" link at the foot; off on the picker itself. */
  switcher?: boolean;
  children: ReactNode;
}) {
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
      {switcher && <LanguageSwitch />}
    </main>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{children}</h1>
  );
}

function Body({
  children,
  tone,
  muted,
}: {
  children: ReactNode;
  tone?: "error";
  muted?: boolean;
}) {
  const color =
    tone === "error" ? "text-destructive" : muted ? "text-muted-foreground" : "text-gray-700";
  return <p className={`text-sm leading-relaxed ${color}`}>{children}</p>;
}

/** /privacy or /privasi, whichever matches the language on screen. */
function PrivacyLink() {
  const { locale } = useOwnerLocaleContext();
  return (
    <Link
      href={locale === "id" ? "/privasi" : "/privacy"}
      className="font-medium text-gray-900 underline underline-offset-4"
    >
      {locale === "id" ? "Kebijakan Privasi" : "Privacy Policy"}
    </Link>
  );
}

/** "Bahasa Indonesia" under the English screens, "English" under the Indonesian. */
function LanguageSwitch() {
  const { locale, setLocale } = useOwnerLocaleContext();
  const other = locale === "id" ? "en" : "id";
  return (
    <button
      type="button"
      lang={other}
      onClick={() => void setLocale(other)}
      className="mt-2 flex min-h-[44px] items-center justify-center gap-1.5 self-center rounded-lg px-3 text-xs font-medium text-muted-foreground active:bg-muted"
    >
      <Languages className="size-3.5" /> {LOCALE_NAMES[other]}
    </button>
  );
}

/**
 * For the staff member who tapped "Continue with Google" by mistake (it has
 * happened in production — see app/page.tsx). Staff sign in with an invite
 * link and a PIN, never Google. Both languages whatever the owner chose, and
 * Bahasa Indonesia first: it is for them.
 */
function StaffHint() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p lang="id" className="text-sm leading-relaxed font-medium text-amber-900">
        Staf rumah? Anda tidak perlu akun Google — minta link undangan ke pemilik rumah.
      </p>
      <p lang="en" className="mt-1 text-xs leading-relaxed text-amber-800">
        Household staff? You don&apos;t need a Google account — ask the homeowner for your invite
        link.
      </p>
    </div>
  );
}

/** `bilingual` on the language picker, where neither language is chosen yet. */
function SignOutButton({ bilingual = false }: { bilingual?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function signOut() {
    setSigningOut(true);
    clearCachedOwnerLocale();
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
      {signingOut && <Loader2 className="animate-spin" />} {bilingual ? "Sign out · Keluar" : t("Sign out", "Keluar")}
    </Button>
  );
}
