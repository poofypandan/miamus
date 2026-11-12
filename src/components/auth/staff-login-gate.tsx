"use client";

import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Delete, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { StaffSplash } from "@/components/staff/staff-splash";
import { StaffLoadingScreen } from "@/components/brand/loading-screens";
import { dataProvider } from "@/lib/data";
import { readSessionState, waitForSession } from "@/lib/auth/device-session";
import { clearHouseholdDataOnThisPhone, PHONE_REMOVED_KEY } from "@/lib/local-data";
import { phoneLinkedAnywhere, phoneLinkState } from "@/lib/phone-link";
import { forgetOutbox } from "@/lib/offline-queue";
import { forgetPhotoQueue } from "@/lib/photo-queue";
import { readStoredTenantId } from "@/lib/tenant";
import { cn } from "@/lib/utils";
import { activeMemberProfile } from "@/lib/member-identity";
import type { PinCheck } from "@/lib/data/types";
import { formatTime } from "@/lib/time";
import type { StaffProfile } from "@/types/database";

const STAFF_ID_KEY = "banyuwangi11:staffId";
const STAFF_NAME_KEY = "banyuwangi11:staffName";
const PIN_LENGTH = 4;
const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

interface StaffIdentity {
  staffId: string | null;
  staffName: string | null;
  /**
   * The usual PIN screen for one person, over the page (Phase 166): "Ganti
   * ke Sari" after a notification meant for her, or when the server wants
   * the PIN before adding her to this phone's notifications. Resolves true
   * once the PIN is right, and that person is then on duty here; false if
   * they go back. Never offered to an admin.
   */
  confirmPerson: (person: Pick<StaffProfile, "id" | "name">) => Promise<boolean>;
}

const StaffIdentityContext = createContext<StaffIdentity>({
  staffId: null,
  staffName: null,
  confirmPerson: async () => false,
});

/** Who is currently on duty on this device. Null before anyone has chosen. */
export function useStaffIdentity(): StaffIdentity {
  return useContext(StaffIdentityContext);
}

/**
 * Reads the active staff id outside React — for the data layer, where an
 * insert needs to stamp its author but has no hooks to read from.
 *
 * Deliberately not cached: the value changes whenever someone hands the phone
 * over, and a stale copy would file one person's work under another's name.
 */
export function readActiveStaffId(): string | null {
  if (typeof window === "undefined") return null;
  // An admin is always themselves (Phase 139): their own roster row, never a
  // staff name that may once have been picked on this phone — which would
  // file the admin's work under someone else.
  const member = activeMemberProfile();
  if (member !== undefined) return member?.id ?? null;
  try {
    return window.localStorage.getItem(STAFF_ID_KEY);
  } catch {
    // Private browsing or blocked site data: the app keeps working, the rows
    // just carry no author.
    return null;
  }
}

/**
 * Gates the staff view behind "who is on duty?".
 *
 * Staff pick their name once per device and set their own four-digit PIN the
 * first time; after that the choice is remembered in localStorage and this is
 * invisible. The PIN separates the household's own people from each other on a
 * shared phone — it is stored as typed and readable with the public key (see
 * migrations/071), so it is not a lock against outsiders.
 *
 * Staff-facing, so entirely Bahasa Indonesia per the Phase 46 language boundary.
 */
export function StaffLoginGate({ children }: { children: ReactNode }) {
  const { userRole, roleHydrated, memberProfile, memberProfileReady, signedOut } = useHousehold();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);
  // Starts false so the server HTML and the first client render agree; the
  // stored identity is read in the effect below, the same pattern as the
  // owner-role restore in household-context.
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setStaffId(window.localStorage.getItem(STAFF_ID_KEY));
      setStaffName(window.localStorage.getItem(STAFF_NAME_KEY));
    } catch {
      // Nothing stored and nothing storable — the gate simply asks every time.
    }
    setHydrated(true);
  }, []);

  // The remembered person was taken off the roster (migrations/109, /119):
  // forget them, so the phone asks "who is on duty?" again instead of
  // carrying on in a removed person's name.
  const forget = useCallback((quiet: boolean) => {
    setStaffId(null);
    setStaffName(null);
    try {
      window.localStorage.removeItem(STAFF_ID_KEY);
      window.localStorage.removeItem(STAFF_NAME_KEY);
    } catch {
      // Not stored, so nothing to forget.
    }
    if (!quiet) toast.info("Nama ini sudah tidak ada di daftar staf. Pilih nama Anda lagi.");
  }, []);

  const identify = useCallback((profile: StaffProfile) => {
    setStaffId(profile.id);
    setStaffName(profile.name);
    try {
      window.localStorage.setItem(STAFF_ID_KEY, profile.id);
      window.localStorage.setItem(STAFF_NAME_KEY, profile.name);
    } catch {
      // The session still works; it just won't be remembered next time.
    }
  }, []);

  // Who the PIN screen is open for over the page, and who is waiting on it.
  const [confirming, setConfirming] = useState<{
    profile: StaffProfile;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const waiting = useRef<((ok: boolean) => void) | null>(null);
  const confirmPerson = useCallback(
    (person: Pick<StaffProfile, "id" | "name">) =>
      new Promise<boolean>((resolve) => {
        // A second request replaces the first, which is told "no".
        waiting.current?.(false);
        waiting.current = resolve;
        // The PIN screen reads only the id and the name (and has_pin, which
        // "enter" implies).
        setConfirming({ profile: { ...person, has_pin: true } as StaffProfile, resolve });
      }),
    []
  );
  // Kembali, or the phone's Back: nobody switches, and whoever asked is told.
  const cancelConfirm = useCallback(() => {
    waiting.current?.(false);
    waiting.current = null;
    setConfirming(null);
  }, []);
  // Back closes the PIN screen rather than leaving the page (the sheets'
  // own rule, use-back-to-close).
  useBackToClose(confirming !== null && userRole !== "owner", cancelConfirm);

  // An admin never meets the PIN screen: they signed in with Google, and
  // their roster row is linked to that account (Phase 139, migrations/106).
  // They pass straight through as themselves — so Action Mode shows their own
  // chores, and what they finish is filed under their name. Before 106 there
  // is no row, and they pass through as nobody, as they always did.
  const ownerBypass = userRole === "owner";

  // Nothing is rendered until both the stored identity and the owner role have
  // been read back. Deciding earlier would flash the sign-in screen at an owner
  // for the moment before their role restores — and this screen is meant to be
  // seen exactly once per device, on the very first visit.
  //
  // The RUMAH screen rather than nothing while that happens (Phase 121): the
  // same one app/staff/loading.tsx shows, so a cold start is one calm screen
  // instead of white, then rules, then the list.
  //
  // An admin on a first launch also waits for their roster row, so the list
  // does not show every chore and then narrow to theirs.
  if (!hydrated || !roleHydrated || (ownerBypass && !memberProfileReady)) {
    return <StaffLoadingScreen />;
  }

  // No session on this phone at all (signedOut): nothing can load, whoever is
  // remembered. The gate says the phone has to be linked again.
  if ((!staffId || signedOut) && !ownerBypass) {
    return <StaffGateScreen onIdentified={identify} />;
  }

  // There is deliberately no way back out from here: each person works from
  // their own phone, so once the identity is stored the gate never appears
  // again. Correcting a wrong choice means clearing the browser's site data
  // for this app.
  return (
    <StaffIdentityContext.Provider
      value={
        ownerBypass
          ? { staffId: memberProfile?.id ?? null, staffName: memberProfile?.name ?? null, confirmPerson: async () => false }
          : { staffId, staffName, confirmPerson }
      }
    >
      {!ownerBypass && staffId && (
        // Its own boundary: the roster's first read suspends, and the page
        // must not wait on this check.
        <Suspense fallback={null}>
          <RemovedFromRosterCheck staffId={staffId} onRemoved={forget} />
        </Suspense>
      )}
      {children}
      {confirming && !ownerBypass && (
        // Over the page rather than instead of it, so what was open stays
        // as it was when they come back.
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-50">
          <PinStep
            step={{ kind: "enter", profile: confirming.profile }}
            onBack={cancelConfirm}
            onDone={(profile) => {
              identify(profile);
              waiting.current = null;
              confirming.resolve(true);
              setConfirming(null);
            }}
            setStep={() => {}}
          />
        </div>
      )}
    </StaffIdentityContext.Provider>
  );
}

/**
 * Forgets a remembered person who is no longer on this household's roster:
 * archived (migrations/109) or gone. Only acts on a roster that actually
 * loaded — offline, or on a failed read, nobody is signed out.
 */
function RemovedFromRosterCheck({
  staffId,
  onRemoved,
}: {
  staffId: string;
  /** quiet: the whole roster came back empty, so the phone itself was most
   * likely removed; the gate says so instead of "pick your name again". */
  onRemoved: (quiet: boolean) => void;
}) {
  const { allProfiles } = useStaffProfiles();
  useEffect(() => {
    if (!allProfiles) return;
    const person = allProfiles.find((p) => p.id === staffId);
    if (!person || person.archived_at) onRemoved(allProfiles.length === 0);
  }, [allProfiles, staffId, onRemoved]);
  return null;
}

/**
 * True only when the server says this phone no longer reaches its household:
 * it was linked before (a stored household, or already found removed once),
 * and get_user_household_ids now leaves that household out. "no_answer" and
 * "unknown" are false, so a slow or offline load never reads as removed.
 */
async function wasRemoved(): Promise<boolean> {
  let marked = false;
  try {
    marked = window.localStorage.getItem(PHONE_REMOVED_KEY) === "1";
  } catch {
    // Storage blocked: only the stored household can say.
  }
  const household = readStoredTenantId();
  if (household) return (await phoneLinkState(household)) === "unlinked";
  if (marked) return (await phoneLinkedAnywhere()) === "unlinked";
  return false;
}

/**
 * What owner sign-out removes, removed here too: the household's menu,
 * recipes, features, snapshot, the household id and who this phone was
 * (local-data.ts), and the saves and photos still waiting to be sent. The marker keeps the "removed" message on the next load.
 */
function forgetRemovedPhone() {
  clearHouseholdDataOnThisPhone();
  // Waiting saves and photos too, as sign-out clears them (Codex P2, PR #102):
  // they can't be sent from a removed phone, and they hold household data.
  void forgetOutbox();
  void forgetPhotoQueue();
  try {
    window.localStorage.setItem(PHONE_REMOVED_KEY, "1");
  } catch {
    // Storage blocked: nothing was kept to begin with.
  }
}

type GateStep =
  | { kind: "choose" }
  | { kind: "create"; profile: StaffProfile; confirming: string | null }
  | { kind: "enter"; profile: StaffProfile };

function StaffGateScreen({ onIdentified }: { onIdentified: (profile: StaffProfile) => void }) {
  const [profiles, setProfiles] = useState<StaffProfile[] | null>(null);
  const [failed, setFailed] = useState(false);
  // No session on this phone: it hasn't redeemed an invite or a house code,
  // so there is no roster it may read. Asked first, so nothing goes out.
  const [notLinked, setNotLinked] = useState(false);
  // The owner removed this phone (Rumah → Masuk staf → HP yang terhubung →
  // Hapus): it still has a sign-in, but the roster comes back empty because
  // the phone no longer reaches the household (demo check F-4). Only set on
  // the server's clear "unlinked"; offline or slow answers never set it.
  const [removed, setRemoved] = useState(false);
  // Bumped to fetch the roster again — by the button, the timer and the
  // "online" event below (Phase 146).
  const [attempt, setAttempt] = useState(0);
  // The last attempt that finished, either way. The retry timer waits for the
  // current one: on slow Wi-Fi a renewal plus the roster read can take longer
  // than the retry interval, and starting the next attempt would discard the
  // one about to succeed (Codex review, PR #2).
  const [settled, setSettled] = useState(-1);
  const [step, setStep] = useState<GateStep>({ kind: "choose" });

  useEffect(() => {
    let live = true;
    const stop = new AbortController();
    // Checked first for the same reason as in refresh(): with the session out
    // of reach, the query would go out with only the public key and RLS would
    // answer with no names at all — shown below as "nobody is registered,
    // ask the admin", which sends staff off to fix the wrong thing.
    readSessionState()
      .then(async (state) => {
        if (state === "unreachable") throw new Error("Session could not be renewed — no connection");
        if (live) setNotLinked(state === "none");
        // Without a session the roster read would go out with only the
        // public key and be refused. Wait for one instead (a sign-in in
        // another tab, or a renewal that finally gets through).
        if (state === "none") await waitForSession(stop.signal);
        if (!live) return [];
        if (state === "none") setNotLinked(false);
        return dataProvider.listStaffProfiles();
      })
      // Admins sign in with Google, not here: offering their names would let
      // anyone holding this phone set a PIN and act as them (Phase 139).
      // Archived people are off the roster (Phase 141) — their PIN is already
      // revoked, so leaving the name here would only offer a dead end, or
      // worse, let whoever holds the phone set a fresh PIN and come back.
      .then(async (rows) => {
        if (!live) return;
        // An empty roster from a phone that was linked before: ask whether it
        // still is, before telling anyone "nobody is registered".
        if (rows.length === 0 && (await wasRemoved())) {
          if (!live) return;
          setRemoved(true);
          forgetRemovedPhone();
        }
        if (live) setProfiles(rows.filter((row) => !row.user_id && !row.archived_at));
      })
      .then(() => live && setFailed(false))
      .catch((err) => {
        console.error(err);
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setSettled(attempt);
      });
    return () => {
      live = false;
      stop.abort();
    };
  }, [attempt]);

  // While it is failing, keep trying: 10 seconds after each attempt has
  // finished, and at once when the phone says it is back online. "Reload the
  // page" was the old advice, and an installed app has no reload button to
  // press. Nothing is scheduled while an attempt is still running.
  useEffect(() => {
    if (!failed || settled !== attempt) return;
    const again = () => setAttempt((n) => n + 1);
    const timer = setTimeout(again, 10_000);
    window.addEventListener("online", again);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("online", again);
    };
  }, [failed, settled, attempt]);

  if (step.kind !== "choose") {
    return (
      <PinStep
        step={step}
        onBack={() => setStep({ kind: "choose" })}
        onDone={onIdentified}
        setStep={setStep}
      />
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      {/* The house rules and the install prompt, which used to be the landing
          page at "/" (Phase 87). A phone sees them on the day it is set up,
          and goes straight to the tasks every day after. */}
      <StaffSplash />

      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Siapa yang bertugas?</h1>
        <p className="text-sm text-muted-foreground">Pilih nama Anda untuk mulai mencatat.</p>
      </div>

      {notLinked ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">
            HP ini belum terhubung ke rumah. Buka link undangan dari admin rumah, atau masuk dengan kode rumah.
          </p>
          <Button asChild variant="outline" className="min-h-[44px] rounded-lg">
            <Link href="/join/code">Masuk dengan kode rumah</Link>
          </Button>
        </div>
      ) : failed && profiles === null ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-destructive">
            Gagal memuat daftar nama. Periksa Wi-Fi atau data seluler — dicoba lagi otomatis.
          </p>
          <Button
            variant="outline"
            onClick={() => setAttempt((n) => n + 1)}
            className="min-h-[44px] rounded-lg"
          >
            Coba lagi
          </Button>
        </div>
      ) : profiles === null ? (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </p>
      ) : removed ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-muted-foreground" data-testid="phone-removed">
            HP ini sudah dihapus dari rumah. Minta link baru ke pemilik rumah.
          </p>
          <Button asChild variant="outline" className="min-h-[44px] rounded-lg">
            <Link href="/join/code">Masuk dengan kode rumah</Link>
          </Button>
        </div>
      ) : profiles.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Belum ada nama terdaftar. Minta admin rumah menambahkan nama Anda dulu.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() =>
                setStep(
                  profile.has_pin
                    ? { kind: "enter", profile }
                    : { kind: "create", profile, confirming: null }
                )
              }
              className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border bg-white px-4 text-left text-lg font-medium shadow-sm transition-transform active:scale-[0.99]"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                <UserRound className="size-5" />
              </span>
              <span className="flex-1 truncate">{profile.name}</span>
              {!profile.has_pin && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                  Buat PIN
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Transparency for staff (Phase 143, UU PDP): what is recorded about
          them, and where to read more. Staff-facing, so Bahasa Indonesia. */}
      <p className="text-center text-xs leading-relaxed text-muted-foreground">
        Miamus mencatat tugas, foto, dan cuti Anda untuk rumah ini.{" "}
        <Link href="/privasi" className="font-medium text-gray-900 underline underline-offset-4">
          Baca Kebijakan Privasi
        </Link>
      </p>
    </div>
  );
}

function PinStep({
  step,
  onBack,
  onDone,
  setStep,
}: {
  step: GateStep;
  onBack: () => void;
  onDone: (profile: StaffProfile) => void;
  setStep: (step: GateStep) => void;
}) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [saving, setSaving] = useState(false);
  // Guards against a second submission while the first is still in flight —
  // four quick taps can otherwise fire twice on a slow connection.
  const busy = useRef(false);

  if (step.kind === "choose") return null;
  const creating = step.kind === "create";
  const confirming = creating && step.confirming !== null;

  function reject(message: string) {
    toast.error(message);
    setShake(true);
    setTimeout(() => {
      setPin("");
      setShake(false);
    }, 400);
  }

  async function submit(value: string) {
    if (busy.current || step.kind === "choose") return;

    if (step.kind === "enter") {
      // Checked by the database, not here: the PIN is a bcrypt hash in a
      // column this app cannot read (migrations/095). A wrong PIN and an
      // unreachable server are told apart so the second one doesn't read as
      // "you typed it wrong".
      busy.current = true;
      try {
        const result = await dataProvider.checkStaffPin(step.profile.id, value);
        busy.current = false;
        if (result.status !== "ok") {
          reject(pinFailureMessage(result));
          return;
        }
        onDone(step.profile);
      } catch (err) {
        console.error(err);
        busy.current = false;
        reject("Gagal memeriksa PIN. Periksa koneksi.");
      }
      return;
    }

    // First pass of a new PIN: ask for it twice before writing it. A typo here
    // would otherwise lock the person out until the owner resets them.
    if (step.confirming === null) {
      setPin("");
      setStep({ ...step, confirming: value });
      return;
    }

    if (value !== step.confirming) {
      reject("PIN tidak sama, coba lagi");
      setStep({ ...step, confirming: null });
      return;
    }

    busy.current = true;
    setSaving(true);
    try {
      await dataProvider.setStaffPin(step.profile.id, value);
      // The stored row now has a PIN; the gate only ever needed that flag.
      onDone({ ...step.profile, has_pin: true });
    } catch (err) {
      console.error(err);
      busy.current = false;
      setSaving(false);
      // Since Phase 142 a staff phone may only claim a name with no PIN yet.
      // If someone else claimed it first — another phone, a moment ago — the
      // name now has a PIN, so send them to enter it rather than leaving them
      // retrying a save that will never succeed.
      // Supabase throws a PostgrestError, which is not reliably an Error
      // instance across client versions — read `message` off any object.
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : String(err ?? "");
      if (message.includes("pin_already_set")) {
        reject("Nama ini sudah punya PIN — masukkan PIN-nya");
        setStep({ kind: "enter", profile: { ...step.profile, has_pin: true } });
        return;
      }
      reject("Gagal menyimpan PIN");
    }
  }

  function pressDigit(digit: string) {
    if (shake || saving || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) submit(next);
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">{step.profile.name}</h1>
        <p className="text-sm text-muted-foreground">
          {creating
            ? confirming
              ? "Ulangi PIN untuk memastikan"
              : "Buat PIN baru (4 Angka)"
            : "Masukkan PIN"}
        </p>
      </div>

      <div className={cn("flex justify-center gap-3 py-2", shake && "animate-shake")}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-3.5 rounded-full border-2",
              shake
                ? "border-destructive bg-destructive"
                : i < pin.length
                  ? "border-primary bg-primary"
                  : "border-input bg-transparent"
            )}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {PAD_KEYS.map((key, i) =>
          key === "" ? (
            <span key={i} aria-hidden />
          ) : key === "back" ? (
            <Button
              key={i}
              type="button"
              variant="ghost"
              className="min-h-[56px] text-lg"
              onClick={() => setPin((p) => p.slice(0, -1))}
              disabled={saving}
            >
              <Delete className="size-5" />
            </Button>
          ) : (
            <Button
              key={i}
              type="button"
              variant="outline"
              className="min-h-[56px] text-xl font-semibold"
              onClick={() => pressDigit(key)}
              disabled={saving}
            >
              {key}
            </Button>
          )
        )}
      </div>

      <Button variant="ghost" className="min-h-[48px]" onClick={onBack} disabled={saving}>
        {saving ? <Loader2 className="animate-spin" /> : <ChevronLeft />}
        {saving ? "Menyimpan…" : "Kembali"}
      </Button>
    </div>
  );
}

/**
 * What a staff member reads when a PIN is refused (Phase 151): the tries left
 * before the 5-try lock, or until when it is locked, in 24-hour time. Since
 * migrations/146 a third lock lasts until an admin sets a new PIN, and too
 * many wrong PINs in an hour pause PIN tries.
 */
export function pinFailureMessage(result: Exclude<PinCheck, { status: "ok" }>): string {
  if (result.status === "locked") {
    if (result.until_reset || !result.locked_until) {
      return "PIN terkunci karena terlalu sering salah. Minta admin rumah membuat PIN baru untuk Anda.";
    }
    return `PIN terkunci karena 5 kali salah. Coba lagi pukul ${formatTime(new Date(result.locked_until), "id")}.`;
  }
  if (result.status === "too_many_attempts") {
    return "Terlalu banyak PIN salah. Coba lagi 1 jam lagi.";
  }
  if (result.status === "wrong_pin" && result.attempts_left > 0) {
    return `PIN salah. Sisa ${result.attempts_left} kali coba.`;
  }
  return "PIN salah";
}

/**
 * Remembers who is holding this phone, as picking a name on the gate does, so
 * the staff page opens straight on their schedule (Phase 151: the house-code
 * sign-in has already checked the PIN).
 */
export function rememberStaffOnThisPhone(profile: { id: string; name: string }): void {
  try {
    window.localStorage.setItem(STAFF_ID_KEY, profile.id);
    window.localStorage.setItem(STAFF_NAME_KEY, profile.name);
  } catch {
    // Blocked storage: the gate asks for the name and PIN again instead.
  }
}
