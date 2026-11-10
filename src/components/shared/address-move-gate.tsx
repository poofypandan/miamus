"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, CloudUpload, Copy, Loader2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UiLabelsProvider } from "@/components/ui/ui-labels";
import { BrandMark } from "@/components/brand/brand-mark";
import { CANONICAL_HOST, CANONICAL_ORIGIN, isOldHost } from "@/config/hosts";
import { OwnerLocaleProvider, translator, useT, type Translate } from "@/context/owner-locale-context";
import { initialPublicLocale } from "@/hooks/use-public-locale";
import {
  countChoreDrafts,
  mayMove,
  movedUrl,
  sendBeforeMove,
  type MoveAudience,
  type SendDeps,
  type SendOutcome,
} from "@/lib/address-move";
import { peekStoredUser, readSessionState } from "@/lib/auth/device-session";
import { choreDraftKey, clearChoreDraft } from "@/lib/chore-draft";
import { drainOutbox, getOfflineQueue, type DrainReport } from "@/lib/offline-queue";
import { getActiveHouseholdId } from "@/lib/tenant";
import { useHousehold } from "@/context/household-context";

/**
 * "This app is no longer in use" (address move, 2026-11-10): the only thing
 * the app shows on an old address (config/hosts.ts). No working app behind
 * it and no way to dismiss it — the owner has told staff to stop using the
 * old one, and this screen says the same, in the same steps as the owner's
 * WhatsApp message.
 *
 * It first sends what is waiting on this phone, by itself: the saves in
 * lib/offline-queue.ts live in this address's storage, which miamus.app can
 * never read, and losing logs would hurt the household. With saves still
 * waiting (no signal, a weak one), it says so, keeps them, and offers "Coba
 * lagi". It opens miamus.app only once the queue is empty, or after "Pindah
 * sekarang" and a plain warning that what is waiting stays on the old
 * address. The logic is lib/address-move.ts.
 *
 * Sign-in does not carry over (storage, again), so the steps say how to get
 * back in: Google for owners, the house code from the admin for staff.
 * Nothing secret goes in the link.
 *
 * Owners read their own language (useT); staff Bahasa Indonesia only; a
 * phone with nobody signed in, the start screen's language.
 */

const noSubscribe = () => () => {};

export function AddressMoveGate({ children }: { children: ReactNode }) {
  // Client-only: the server render cannot see which address the phone used,
  // and the old one serves the same build.
  const moved = useSyncExternalStore(noSubscribe, () => isOldHost(window.location.hostname), () => false);
  if (!moved) return <>{children}</>;
  return <MoveScreen />;
}

function hasStaffMarker(): boolean {
  try {
    return window.localStorage.getItem("banyuwangi11:staffId") !== null;
  } catch {
    return false;
  }
}

function MoveScreen() {
  const { isHouseholdMember } = useHousehold();
  const [found, setFound] = useState<MoveAudience | null>(null);

  useEffect(() => {
    let cancelled = false;
    void peekStoredUser().then((user) => {
      if (cancelled) return;
      if (user && !user.isAnonymous) setFound("owner");
      else if (user?.isAnonymous || hasStaffMarker()) setFound("staff");
      else setFound("visitor");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const audience: MoveAudience | null = isHouseholdMember ? "owner" : found;
  if (!audience) return <Frame />;

  if (audience === "owner") {
    return (
      <OwnerLocaleProvider>
        <OwnerMoveView />
      </OwnerLocaleProvider>
    );
  }
  const locale = audience === "staff" ? "id" : initialPublicLocale();
  return (
    <UiLabelsProvider locale={locale}>
      <MoveView audience={audience} t={translator(locale)} />
    </UiLabelsProvider>
  );
}

function OwnerMoveView() {
  return <MoveView audience="owner" t={useT()} />;
}

/** Other tabs of the app share the queue: one drain at a time (as useOfflineSync). */
async function withDrainLock<T>(run: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return (await navigator.locks.request("miamus-offline-drain", run)) as T;
  }
  return run();
}

/** A sent chore's photos are on the server with it: its draft is done (as useOfflineSync). */
async function clearSentDrafts(report: DrainReport): Promise<void> {
  const household = getActiveHouseholdId();
  for (const item of report.sent) {
    if (item.job.kind === "chore") clearChoreDraft(choreDraftKey(household, item.job.templateId, item.job.date));
  }
}

const deps: SendDeps = {
  readQueue: getOfflineQueue,
  drain: () => withDrainLock(() => drainOutbox(clearSentDrafts)),
  online: () => typeof navigator === "undefined" || navigator.onLine !== false,
  signedOut: async () => (await readSessionState()) === "none",
};

function draftCount(): number {
  try {
    return countChoreDrafts(Object.keys(window.localStorage));
  } catch {
    return 0;
  }
}

/** Notifications here would keep arriving beside miamus.app's, and open this address. */
async function stopPushHere(): Promise<void> {
  const push = await import("@/lib/push");
  const stop = push.disablePush().catch(async () => {
    await push
      .currentSubscription()
      .then((subscription) => subscription?.unsubscribe())
      .catch(() => undefined);
  });
  // Never holds the move up for long on a weak signal.
  await Promise.race([stop, new Promise((resolve) => setTimeout(resolve, 4_000))]);
}

async function hasPushHere(): Promise<boolean> {
  try {
    const push = await import("@/lib/push");
    return (await push.currentSubscription()) !== null;
  } catch {
    return false;
  }
}

function saves(t: Translate, n: number): string {
  return t(n === 1 ? "1 save" : `${n} saves`, `${n} catatan`);
}

function MoveView({ audience, t }: { audience: MoveAudience; t: Translate }) {
  const { tenantReady } = useHousehold();
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [sending, setSending] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [drafts, setDrafts] = useState(0);
  const [push, setPush] = useState(false);
  const running = useRef(false);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      setOutcome(await sendBeforeMove(deps, setSending));
    } finally {
      running.current = false;
      setSending(null);
      setBusy(false);
      setDrafts(draftCount());
    }
  }, []);

  // Once the household is known: drainOutbox sends only the active
  // household's saves, and before this it is a placeholder.
  useEffect(() => {
    if (tenantReady) void run();
  }, [tenantReady, run]);

  useEffect(() => {
    setDrafts(draftCount());
    void hasPushHere().then(setPush);
  }, []);

  // The signal came back while saves were waiting: try again at once.
  useEffect(() => {
    if (outcome?.status !== "waiting") return;
    const again = () => void run();
    window.addEventListener("online", again);
    return () => window.removeEventListener("online", again);
  }, [outcome, run]);

  // Everything sent while the warning was open: nothing left to warn about.
  useEffect(() => {
    if (outcome?.status === "empty") setConfirming(false);
  }, [outcome]);

  const waiting = outcome?.status === "waiting" ? outcome.waiting : 0;
  const ready = mayMove(outcome, false);

  /** `chose`: the person saw the warning and chose to go anyway. */
  async function leave(chose: boolean) {
    if (!mayMove(outcome, chose)) return;
    setLeaving(true);
    // Another tab of the app on this address may have kept a save since the
    // check: look once more, and send it first.
    if (!chose && (await getOfflineQueue().catch(() => [])).length > 0) {
      setLeaving(false);
      void run();
      return;
    }
    if (push) await stopPushHere();
    window.location.assign(movedUrl(window.location, audience));
  }

  return (
    <Frame>
      <h1 className="text-xl font-semibold tracking-tight">
        {t("This app is no longer in use", "Aplikasi ini sudah tidak dipakai")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          `From today, Miamus has a new address: ${CANONICAL_HOST}. Please don't use the old app any more.`,
          `Mulai hari ini, Miamus pakai alamat baru: ${CANONICAL_HOST}. Jangan pakai aplikasi yang lama lagi ya.`
        )}
      </p>

      <QueueStatus t={t} outcome={outcome} sending={sending} busy={busy || !tenantReady} />

      {drafts > 0 && (
        <Notice tone="amber" icon={<AlertTriangle className="size-4" />}>
          {t(
            drafts === 1
              ? "1 chore on this phone has photos but wasn't finished. It doesn't move: do it again in the new Miamus."
              : `${drafts} chores on this phone have photos but weren't finished. They don't move: do them again in the new Miamus.`,
            `${drafts} tugas di HP ini sudah ada fotonya tapi belum selesai. Tugas itu tidak ikut pindah: kerjakan lagi di Miamus yang baru.`
          )}
        </Notice>
      )}

      {confirming ? (
        <div role="alert" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">{t("Move without them?", "Pindah tanpa catatan ini?")}</p>
          <p className="mt-1">
            {t(
              `${waiting === null ? "The saves waiting on this phone" : `The ${saves(t, waiting)} waiting`} stay on this old address. They are sent only if you open this old address again with a signal.`,
              `${waiting === null ? "Catatan yang menunggu di HP ini" : `${saves(t, waiting)} yang menunggu`} tetap tertinggal di alamat lama. Catatan baru terkirim kalau Anda membuka alamat lama ini lagi saat ada sinyal.`
            )}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="outline"
              className="h-10 flex-1 rounded-xl bg-background"
              onClick={() => setConfirming(false)}
              disabled={leaving}
            >
              {t("Cancel", "Batal")}
            </Button>
            <Button className="h-10 flex-1 rounded-xl" onClick={() => void leave(true)} disabled={leaving}>
              {leaving && <Loader2 className="animate-spin" />}
              {t("Yes, move now", "Ya, pindah sekarang")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {outcome?.status === "waiting" ? (
            <>
              <Button className="h-12 w-full rounded-xl text-base" onClick={() => void run()} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                {t("Try again", "Coba lagi")}
              </Button>
              <Button variant="outline" className="h-11 w-full rounded-xl" onClick={() => setConfirming(true)} disabled={busy}>
                {t("Move now", "Pindah sekarang")}
              </Button>
            </>
          ) : (
            <Button
              className="h-12 w-full rounded-xl text-base"
              onClick={() => void leave(false)}
              disabled={!ready || leaving}
            >
              {!ready || leaving ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              {t("Open the new Miamus", "Buka Miamus yang baru")}
            </Button>
          )}
        </div>
      )}

      <Steps t={t} audience={audience} push={push} />
    </Frame>
  );
}

/** The owner's WhatsApp message to staff, as steps on the screen. */
function Steps({ t, audience, push }: { t: Translate; audience: MoveAudience; push: boolean }) {
  const steps = [
    t("Tap the button above.", "Tekan tombol di atas."),
    signInAgain(t, audience),
    t(
      "Remove the old Miamus icon from your home screen, then add the new one: open the browser menu and choose 'Add to Home Screen'.",
      "Hapus ikon Miamus yang lama dari layar HP, lalu tambahkan yang baru: buka menu browser, pilih 'Tambahkan ke Layar Utama'."
    ),
  ];
  return (
    <section className="mt-6 rounded-xl border border-border px-4 py-3 text-sm">
      <h2 className="font-medium">{t("How to move", "Cara pindah")}</h2>
      <ol className="mt-2 space-y-2">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
              {i + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>
      {push && (
        <p className="mt-3 text-muted-foreground">
          {t(
            `Notifications on this old address are turned off when you move. Turn them on again in ${CANONICAL_HOST}.`,
            `Notifikasi di alamat lama dimatikan saat pindah. Nyalakan lagi di ${CANONICAL_HOST}.`
          )}
        </p>
      )}
      <CopyLink t={t} />
      <p className="mt-3 font-medium">{t("Thank you!", "Terima kasih!")}</p>
    </section>
  );
}

/** The address itself, to open in another browser or send on. Only the address: no session, no code. */
function CopyLink({ t }: { t: Translate }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(CANONICAL_ORIGIN);
      setCopied(true);
      toast.success(t("Link copied", "Link disalin"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard needs a secure context and sometimes a permission; the
      // link stays on screen to be copied by hand.
      toast.error(t("Couldn't copy — select the link and copy it", "Gagal menyalin — pilih link-nya lalu salin"));
    }
  }
  return (
    <div className="mt-3 flex items-center gap-2">
      <p className="min-w-0 flex-1 rounded-lg bg-muted px-3 py-2 text-sm break-all select-all">{CANONICAL_ORIGIN}</p>
      <Button variant="outline" className="h-10 shrink-0 rounded-xl" onClick={() => void copy()}>
        {copied ? <Check /> : <Copy />}
        {t("Copy link", "Salin link")}
      </Button>
    </div>
  );
}

function signInAgain(t: Translate, audience: MoveAudience): string {
  switch (audience) {
    case "owner":
      return t(
        "Sign in again with Google. Your household and everything in it are already there.",
        "Masuk lagi dengan Google. Rumah Anda dan semua isinya sudah ada di sana."
      );
    case "staff":
      return t(
        "Sign in again with the house code from the admin, then your PIN.",
        "Masuk lagi pakai kode rumah dari admin, lalu PIN Anda."
      );
    case "visitor":
      return t(
        "Sign in again: owners with Google, staff with the house code from the admin.",
        "Masuk lagi: pemilik dengan Google, staf pakai kode rumah dari admin."
      );
  }
}

function QueueStatus({
  t,
  outcome,
  sending,
  busy,
}: {
  t: Translate;
  outcome: SendOutcome | null;
  sending: number | null;
  busy: boolean;
}) {
  if (sending !== null) {
    return (
      <Notice tone="neutral" icon={<Loader2 className="size-4 animate-spin" />}>
        {t(`Sending ${saves(t, sending)} from this phone first…`, `Mengirim ${saves(t, sending)} dari HP ini dulu…`)}
      </Notice>
    );
  }
  if (!outcome || (busy && outcome.status !== "waiting")) {
    return (
      <Notice tone="neutral" icon={<Loader2 className="size-4 animate-spin" />}>
        {t("Checking this phone for unsent saves…", "Memeriksa catatan yang belum terkirim…")}
      </Notice>
    );
  }

  const refused =
    outcome.refused > 0
      ? t(
          `The server refused ${saves(t, outcome.refused)}, so ${outcome.refused === 1 ? "it was" : "they were"} not kept. Please enter ${outcome.refused === 1 ? "it" : "them"} again in the new Miamus.`,
          `${saves(t, outcome.refused)} ditolak server dan tidak tersimpan. Catat lagi di Miamus yang baru.`
        )
      : null;

  if (outcome.status === "empty") {
    return (
      <>
        <Notice tone="green" icon={<CheckCircle2 className="size-4" />}>
          {outcome.sent > 0
            ? t("All saves sent. Nothing is left on this phone.", "Semua catatan sudah terkirim. Tidak ada yang tertinggal di HP ini.")
            : t("Nothing is waiting on this phone.", "Tidak ada catatan yang menunggu di HP ini.")}
        </Notice>
        {refused && (
          <Notice tone="amber" icon={<AlertTriangle className="size-4" />}>
            {refused}
          </Notice>
        )}
      </>
    );
  }

  const n = outcome.waiting;
  const still =
    n === null
      ? t("Saves may still be on this phone.", "Mungkin masih ada catatan di HP ini.")
      : t(`${saves(t, n)} ${n === 1 ? "is" : "are"} still on this phone.`, `${saves(t, n)} masih di HP ini.`);
  const why: Record<typeof outcome.reason, string> = {
    offline: t(
      "There is no signal right now, so they could not be sent. They are kept safe here.",
      "Sekarang tidak ada sinyal, jadi belum bisa dikirim. Catatan tetap aman di sini."
    ),
    "no-answer": t(
      "The signal is too weak to send them. They are kept safe here.",
      "Sinyal terlalu lemah untuk mengirim. Catatan tetap aman di sini."
    ),
    "signed-out": t(
      "This phone is signed out of the old app, so they can't be sent from here. Enter them again in the new Miamus if needed.",
      "HP ini sudah keluar dari aplikasi lama, jadi catatan itu tidak bisa dikirim dari sini. Kalau perlu, catat lagi di Miamus yang baru."
    ),
    "other-household": t(
      "They belong to another household this phone was linked to, and can only be sent from that household.",
      "Catatan itu milik rumah lain yang pernah terhubung ke HP ini, dan hanya bisa dikirim dari rumah itu."
    ),
    error: t(
      "They could not be sent from this phone right now. They are kept here.",
      "Sekarang belum bisa dikirim dari HP ini. Catatan tetap disimpan di sini."
    ),
  };
  return (
    <>
      <Notice
        tone="amber"
        icon={outcome.reason === "offline" ? <WifiOff className="size-4" /> : <CloudUpload className="size-4" />}
      >
        <span className="font-medium">{still}</span> {why[outcome.reason]}
      </Notice>
      {refused && (
        <Notice tone="amber" icon={<AlertTriangle className="size-4" />}>
          {refused}
        </Notice>
      )}
    </>
  );
}

const TONES = {
  neutral: { box: "border-border bg-muted/40 text-foreground", icon: "text-muted-foreground" },
  green: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "text-emerald-700" },
  amber: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: "text-amber-700" },
} as const;

function Notice({ tone, icon, children }: { tone: keyof typeof TONES; icon: ReactNode; children: ReactNode }) {
  return (
    <div role="status" className={`mt-4 flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${TONES[tone].box}`}>
      <span className={`mt-0.5 shrink-0 ${TONES[tone].icon}`}>{icon}</span>
      <p className="min-w-0 flex-1">{children}</p>
    </div>
  );
}

function Frame({ children }: { children?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-1 flex-col px-6 pt-12 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div aria-hidden className="mb-6">
        <BrandMark size={56} rounded />
      </div>
      {children}
    </main>
  );
}
