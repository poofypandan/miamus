"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { ChevronLeft, Delete, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { dataProvider } from "@/lib/data";
import { cn } from "@/lib/utils";
import type { StaffProfile } from "@/types/database";

const STAFF_ID_KEY = "banyuwangi11:staffId";
const STAFF_NAME_KEY = "banyuwangi11:staffName";
const PIN_LENGTH = 4;
const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

interface StaffIdentity {
  staffId: string | null;
  staffName: string | null;
}

const StaffIdentityContext = createContext<StaffIdentity>({
  staffId: null,
  staffName: null,
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
  const { userRole, roleHydrated } = useHousehold();
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

  // The owner opens this view to look, not to work. Making them borrow a staff
  // member's name would both annoy them and file their taps under someone
  // else, so they pass straight through — their rows carry no staff_id, which
  // is the truthful answer.
  const ownerBypass = userRole === "owner";

  // Nothing is rendered until both the stored identity and the owner role have
  // been read back. Deciding earlier would flash the sign-in screen at an owner
  // for the moment before their role restores — and this screen is meant to be
  // seen exactly once per device, on the very first visit.
  if (!hydrated || !roleHydrated) return null;

  if (!staffId && !ownerBypass) {
    return <StaffGateScreen onIdentified={identify} />;
  }

  // There is deliberately no way back out from here: each person works from
  // their own phone, so once the identity is stored the gate never appears
  // again. Correcting a wrong choice means clearing the browser's site data
  // for this app.
  return (
    <StaffIdentityContext.Provider value={{ staffId, staffName }}>
      {children}
    </StaffIdentityContext.Provider>
  );
}

type GateStep =
  | { kind: "choose" }
  | { kind: "create"; profile: StaffProfile; confirming: string | null }
  | { kind: "enter"; profile: StaffProfile };

function StaffGateScreen({ onIdentified }: { onIdentified: (profile: StaffProfile) => void }) {
  const [profiles, setProfiles] = useState<StaffProfile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState<GateStep>({ kind: "choose" });

  useEffect(() => {
    let live = true;
    dataProvider
      .listStaffProfiles()
      .then((rows) => live && setProfiles(rows))
      .catch((err) => {
        console.error(err);
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, []);

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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">Siapa yang bertugas?</h1>
        <p className="text-sm text-muted-foreground">Pilih nama kamu untuk mulai mencatat.</p>
      </div>

      {failed ? (
        <p className="text-center text-sm text-destructive">
          Gagal memuat daftar staf. Periksa koneksi lalu muat ulang halaman.
        </p>
      ) : profiles === null ? (
        <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Memuat…
        </p>
      ) : profiles.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Belum ada staf terdaftar. Minta pemilik menambahkan nama kamu dulu.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {profiles.map((profile) => (
            <button
              key={profile.id}
              type="button"
              onClick={() =>
                setStep(
                  profile.pin
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
              {!profile.pin && (
                <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                  Buat PIN
                </span>
              )}
            </button>
          ))}
        </div>
      )}

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
      if (value !== step.profile.pin) {
        reject("PIN salah");
        return;
      }
      onDone(step.profile);
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
      const saved = await dataProvider.setStaffPin(step.profile.id, value);
      onDone(saved);
    } catch (err) {
      console.error(err);
      busy.current = false;
      setSaving(false);
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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-10">
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
              "size-3.5 rounded-full border-2 transition-colors",
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
