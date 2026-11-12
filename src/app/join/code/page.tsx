"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Loader2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UiLabelsProvider } from "@/components/ui/ui-labels";
import { StaffPinScreen } from "@/components/auth/staff-pin-screen";
import { PIN_LENGTH } from "@/components/auth/pin-pad";
import { pinFailureMessage, rememberStaffOnThisPhone } from "@/components/auth/staff-login-gate";
import { ensureAnonymousSession } from "@/lib/auth/device-session";
import { dataProvider } from "@/lib/data";
import type { HouseCodePerson } from "@/lib/data/types";
import { storeTenantId } from "@/lib/tenant";
import { markStaffTipsSeenOnJoin } from "@/lib/whats-new";
import { claimFromFragment, codeFromFragment, typedHouseCode } from "@/lib/setup-apply";
import { VideoTip } from "@/components/shared/video-tip";

/**
 * Staff sign in with the house code (Phase 151, migrations/115): code → name
 * → PIN. For a phone that got signed out — a cleaner app wiped the browser,
 * or the WhatsApp link opened in a different browser — so nobody has to wait
 * for an admin to send a new invite link. Invite links still work.
 *
 * Staff-facing, so Bahasa Indonesia only. Public, like /join/staff: the phone
 * signs in anonymously first, and the database links it to the household only
 * when code, name and PIN are all right.
 */
export default function JoinWithCodePage() {
  return (
    <UiLabelsProvider locale="id">
      <JoinWithCode />
    </UiLabelsProvider>
  );
}

type Step =
  | { kind: "code" }
  | { kind: "names"; code: string; people: HouseCodePerson[] }
  | { kind: "pin"; code: string; people: HouseCodePerson[]; person: HouseCodePerson }
  | { kind: "claim"; code: string; people: HouseCodePerson[]; person: HouseCodePerson };

function JoinWithCode() {
  const [step, setStep] = useState<Step>({ kind: "code" });
  // The claim code from the owner's link (audit L5): without it, a name
  // without a PIN can't be picked here, only signed into with a PIN.
  const [claim, setClaim] = useState<string | null>(null);

  if (step.kind === "claim") {
    return (
      <ClaimStep
        code={step.code}
        claim={claim}
        person={step.person}
        onBack={() => setStep({ kind: "names", code: step.code, people: step.people })}
      />
    );
  }
  if (step.kind === "pin") {
    return (
      <PinStep
        code={step.code}
        person={step.person}
        onBack={() => setStep({ kind: "names", code: step.code, people: step.people })}
      />
    );
  }
  if (step.kind === "names") {
    return (
      <NamesStep
        people={step.people}
        canClaim={!!claim}
        onPick={(person) => {
          if (person.has_pin) setStep({ ...step, kind: "pin", person });
          else if (person.claimable && claim) setStep({ ...step, kind: "claim", person });
          // The code typed by hand: the link from the owner's WhatsApp has the claim code.
          else if (person.claimable) toast.info("Buka link dari WhatsApp pemilik rumah untuk membuat PIN.");
          // Added more than a week ago without a PIN: an invite link, as before.
          else toast.info("Belum punya PIN. Minta link undangan ke admin rumah untuk membuat PIN.");
        }}
        onBack={() => setStep({ kind: "code" })}
      />
    );
  }
  return <CodeStep onFound={(code, people) => setStep({ kind: "names", code, people })} onClaim={setClaim} />;
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <main
      lang="id"
      className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 pb-[calc(3rem+env(safe-area-inset-bottom))]"
    >
      {children}
    </main>
  );
}

function CodeStep({
  onFound,
  onClaim,
}: {
  onFound: (code: string, people: HouseCodePerson[]) => void;
  onClaim: (claim: string | null) => void;
}) {
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const ready = code.replace(/[^a-z0-9]/gi, "").length === 6;

  // The owner's one WhatsApp message (Phase 172 PR A2) carries the code in
  // the fragment, #c=K7P-M2Q, so it never reaches server logs. Fill it in,
  // take it out of the address bar, and go straight to the names.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current) return;
    prefilled.current = true;
    const fromLink = codeFromFragment(window.location.hash);
    if (!fromLink) return;
    onClaim(claimFromFragment(window.location.hash));
    window.history.replaceState(window.history.state, "", window.location.pathname);
    setCode(typedHouseCode(fromLink));
    void check(fromLink);
    // check is stable enough for a once-on-mount fill: it reads only its argument.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || checking) return;
    await check(code);
  }

  async function check(code: string) {
    setChecking(true);
    setProblem(null);
    try {
      const userId = await ensureAnonymousSession();
      if (!userId) throw new Error("anonymous sign-in unavailable");
      const people = await dataProvider.houseCodeRoster(code);
      if (people.length === 0) {
        setProblem("Kode rumah salah. Periksa lagi, atau tanya admin rumah.");
        return;
      }
      onFound(code, people);
    } catch (err) {
      const message = err instanceof Error ? err.message : String((err as { message?: string })?.message ?? "");
      if (message.includes("too_many_attempts")) {
        setProblem("Terlalu banyak kode salah. Coba lagi 1 jam lagi.");
      } else if (message.includes("staff_phones_only")) {
        setProblem("HP ini sedang masuk sebagai pemilik rumah. Kode rumah hanya untuk HP staf.");
      } else {
        console.error("House code check failed", err);
        setProblem("Gagal memeriksa kode. Periksa koneksi lalu coba lagi.");
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Masuk dengan kode rumah</h1>
      <p className="mt-3 text-base leading-relaxed text-gray-700">
        Ketik kode rumah dari admin rumah. Contoh: K7M-2QX.
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <Input
          value={code}
          onChange={(e) => setCode(typedHouseCode(e.target.value))}
          placeholder="XXX-XXX"
          aria-label="Kode rumah"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={7}
          className="h-14 text-center font-mono text-2xl tracking-[0.3em]"
        />
        {problem && <p className="text-sm text-destructive">{problem}</p>}
        <Button type="submit" disabled={!ready || checking} className="min-h-[52px]">
          {checking && <Loader2 className="animate-spin" />}
          Lanjut
        </Button>
      </form>
      <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
        Tidak tahu kodenya? Tanya admin rumah, atau buka link undangan Miamus dari WhatsApp.
      </p>
      <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
        Jangan masuk dengan Google. Itu hanya untuk pemilik rumah.
      </p>
      <Link href="/" className="mt-6 flex min-h-[44px] items-center gap-1 text-sm font-medium text-gray-900">
        <ChevronLeft className="size-4" />
        Kembali
      </Link>
    </Screen>
  );
}

function NamesStep({
  people,
  canClaim,
  onPick,
  onBack,
}: {
  people: HouseCodePerson[];
  /** Opened from the owner's WhatsApp link, which carries the claim code. */
  canClaim: boolean;
  onPick: (person: HouseCodePerson) => void;
  onBack: () => void;
}) {
  // A typed code can never set a first PIN (audit L5), so this screen only
  // promises "buat PIN" when the link's claim code is here (demo check F-3).
  const claimHere = canClaim && people.some((p) => p.claimable);
  const someoneWithoutPin = people.some((p) => !p.has_pin);
  return (
    <Screen>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Siapa yang bertugas?</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {claimHere ? "Pilih nama Anda, lalu buat PIN." : "Pilih nama Anda."}
      </p>
      {!claimHere && someoneWithoutPin && (
        <p className="mt-1 text-sm text-muted-foreground">Belum punya PIN? Buka link dari WhatsApp pemilik rumah.</p>
      )}
      <div className="mt-6 flex flex-col gap-2">
        {people.map((person) => (
          <button
            key={person.id}
            type="button"
            onClick={() => onPick(person)}
            className="flex min-h-[56px] items-center gap-3 rounded-xl border bg-card px-4 text-left text-base font-medium active:bg-muted"
          >
            <span className="flex size-9 items-center justify-center rounded-full bg-muted">
              <UserRound className="size-4 text-muted-foreground" />
            </span>
            <span className="flex-1">{person.name}</span>
            {!person.has_pin &&
              (person.claimable && canClaim ? (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Buat PIN</span>
              ) : (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Belum punya PIN</span>
              ))}
          </button>
        ))}
      </div>
      {claimHere && (
        <div className="mt-4">
          <VideoTip id="staff-house-code" locale="id" />
        </div>
      )}
      <Button variant="ghost" onClick={onBack} className="mt-6 min-h-[48px]">
        <ChevronLeft />
        Kembali
      </Button>
    </Screen>
  );
}

function PinStep({ code, person, onBack }: { code: string; person: HouseCodePerson; onBack: () => void }) {
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  function reject(message: string) {
    setNotice(message);
    setShake(true);
    setTimeout(() => {
      setPin("");
      setShake(false);
    }, 400);
  }

  async function submit(value: string) {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const result = await dataProvider.signInWithHouseCode(code, person.id, value);
      if (result.status === "ok") {
        storeTenantId(result.household_id);
        rememberStaffOnThisPhone(person);
        markStaffTipsSeenOnJoin();
        // A full load, as after an invite link: HouseholdProvider resolves the
        // household once at startup.
        window.location.replace("/staff");
        return;
      }
      if (result.status === "wrong_code") reject("Kode rumah sudah diganti. Kembali dan ketik kode yang baru.");
      // From this phone's wrong codes, or (146) too many wrong PINs.
      else if (result.status === "too_many_attempts") reject("Terlalu banyak percobaan. Coba lagi 1 jam lagi.");
      else reject(pinFailureMessage(result));
    } catch (err) {
      console.error("House code sign-in failed", err);
      reject("Gagal memeriksa PIN. Periksa koneksi.");
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }

  function pressDigit(digit: string) {
    if (shake || checking || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  }

  return (
    <StaffPinScreen
      title={person.name}
      subtitle="Masukkan PIN"
      pin={pin}
      shake={shake}
      busy={checking}
      notice={notice}
      onDigit={pressDigit}
      onBackspace={() => !checking && setPin((p) => p.slice(0, -1))}
      onBack={onBack}
    />
  );
}

/**
 * Staff in one go (Phase 172 PR A2, D10): a name with no PIN yet. Make a
 * PIN, enter it again, and the phone is linked (migrations/147:
 * claim_staff_with_house_code, only within 7 days of being added).
 */
function ClaimStep({
  code,
  claim,
  person,
  onBack,
}: {
  code: string;
  claim: string | null;
  person: HouseCodePerson;
  onBack: () => void;
}) {
  const [first, setFirst] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [shake, setShake] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = useRef(false);

  function reject(message: string, startOver = false) {
    setNotice(message);
    setShake(true);
    setTimeout(() => {
      setPin("");
      if (startOver) setFirst(null);
      setShake(false);
    }, 400);
  }

  async function submitClaim(value: string) {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    try {
      const result = await dataProvider.claimStaffWithHouseCode(code, person.id, value, claim);
      if (result.status === "ok") {
        storeTenantId(result.household_id);
        rememberStaffOnThisPhone(person);
        markStaffTipsSeenOnJoin();
        // A full load, as after an invite link.
        window.location.replace("/staff");
        return;
      }
      if (result.status === "no_claim_link") {
        toast.info("Link ini sudah tidak berlaku. Minta link baru ke pemilik rumah.");
        onBack();
        return;
      }
      if (result.status === "not_claimable") {
        toast.info("Nama ini tidak bisa dipilih lagi. Minta link undangan ke admin rumah.");
        onBack();
        return;
      }
      if (result.status === "wrong_code") reject("Kode rumah sudah diganti. Kembali dan ketik kode yang baru.", true);
      else if (result.status === "too_many_attempts") reject("Terlalu banyak kode salah. Coba lagi 1 jam lagi.", true);
      else reject("PIN harus 4 angka.", true);
    } catch (err) {
      console.error("Claiming a name failed", err);
      reject("Gagal menyimpan PIN. Periksa koneksi.", true);
    } finally {
      busy.current = false;
      setChecking(false);
    }
  }

  function pressDigit(digit: string) {
    if (shake || checking || pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length < PIN_LENGTH) return;
    if (first === null) {
      setNotice(null);
      setTimeout(() => {
        setFirst(next);
        setPin("");
      }, 150);
    } else if (next !== first) {
      reject("PIN tidak sama. Buat PIN lagi.", true);
    } else {
      void submitClaim(next);
    }
  }

  return (
    <StaffPinScreen
      title={person.name}
      subtitle={first === null ? "Buat PIN" : "Ulangi PIN"}
      pin={pin}
      shake={shake}
      busy={checking}
      notice={notice}
      onDigit={pressDigit}
      onBackspace={() => !checking && setPin((p) => p.slice(0, -1))}
      onBack={onBack}
    />
  );
}
