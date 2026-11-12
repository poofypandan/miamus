"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronLeft, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { BrandMark } from "@/components/brand/brand-mark";
import { SetupReview } from "@/components/setup/setup-review";
import { SendStaffMessageButton } from "@/components/setup/send-staff-message";
import { VideoTip } from "@/components/shared/video-tip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHousehold } from "@/context/household-context";
import { OwnerLocaleProvider, useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { useSetUpChores } from "@/hooks/use-set-up-chores";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { applyHouseholdSetup, recordSetup } from "@/lib/setup-apply";
import {
  SETUP_JOBS,
  SETUP_JOB_LABELS,
  alreadyInHousehold,
  assigneeFor,
  buildSetupDraft,
  countsFor,
  setupAddLabel,
  isHomeType,
  leftOut,
  shapeFor,
  toApplyPayload,
  type DraftStaff,
  type Shape,
} from "@/lib/setup-templates";
import { cn } from "@/lib/utils";

/**
 * The first 10 minutes, after "What kind of home?" (Phase 172 PR A2;
 * docs/phase-172-first-ten-minutes-plan.md, sections 2 and 4): the starter
 * list for that kind of home, everything ticked (D5); then staff names with
 * an optional job chip each (D6); one call adds it all; then one WhatsApp
 * message with the house link (D10). Every step can be skipped: nothing on
 * the default path is required.
 *
 * Full screen, like /onboarding: no tab bar, no sixth tab. Owner-facing:
 * English or Bahasa Indonesia; chore and room names Indonesian, as saved.
 * Counts what setup took (household_setup, migrations/142), never content.
 */
export default function SetupPage() {
  return (
    <OwnerLocaleProvider>
      <Suspense fallback={null}>
        <Setup />
      </Suspense>
    </OwnerLocaleProvider>
  );
}

type Step = "review" | "staff" | "done";

/** Seconds with the setup screen in front of the owner (D13: measured on the phone). */
function useActiveSeconds(): () => number {
  const total = useRef(0);
  const since = useRef<number | null>(null);
  useEffect(() => {
    const start = () => {
      if (since.current === null && document.visibilityState === "visible") since.current = Date.now();
    };
    const stop = () => {
      if (since.current !== null) total.current += Date.now() - since.current;
      since.current = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, []);
  // Takes the share so far and starts counting again: each send adds its own.
  return () => {
    const running = since.current !== null ? Date.now() - since.current : 0;
    const seconds = Math.round((total.current + running) / 1000);
    total.current = 0;
    if (since.current !== null) since.current = Date.now();
    return Math.min(seconds, 100_000);
  };
}

function Setup() {
  const t = useT();
  const locale = useOwnerLocale();
  const router = useRouter();
  const params = useSearchParams();
  const homeParam = params.get("home");
  const home = isHomeType(homeParam) ? homeParam : null;
  const isOwner = useRequireOwner();
  const { activeHouseholdId, tenantReady, refresh } = useHousehold();
  const { bills: billsOn } = useHouseholdFeatures();
  const today = formatDateLocal(useToday());
  const { locations, reload: reloadRooms } = useHouseholdLocations();
  // A returning owner's chores must be read before Added and the counts
  // mean anything (code review, PR #90); a failed read doesn't block Add,
  // the database skips duplicates anyway.
  const { rows: chores, loaded: choresLoaded, failed: choresFailed } = useSetUpChores(today);
  const { reload: reloadStaff } = useStaffProfiles();
  const takeSeconds = useActiveSeconds();

  const [shape, setShape] = useState<Shape>(() => shapeFor(home));
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set());
  const [step, setStep] = useState<Step>("review");
  const [staff, setStaff] = useState<DraftStaff[]>([{ key: "s1", name: "", job: null }]);
  const [saving, setSaving] = useState(false);
  // Set at once on the first tap: `saving` disables the button only on the
  // next render, so a double tap sent the list twice and the second, refused
  // as a repeat, put an error toast over "Your home is ready" (demo check P-1).
  const adding = useRef(false);
  const [sentStaff, setSentStaff] = useState(0);

  const draft = useMemo(
    () => buildSetupDraft(shape, { homeType: home, today, locale, billsOn }),
    [shape, home, today, locale, billsOn]
  );
  const added = useMemo(
    () => alreadyInHousehold(draft, { locations: locations ?? [], chores: chores ?? [], today }),
    [draft, locations, chores, today]
  );
  const counts = countsFor(draft, unticked, added);
  const named = staff.filter((s) => s.name.trim());

  // The first setup screen: when setup started (the first start stays).
  const started = useRef(false);
  useEffect(() => {
    if (!tenantReady || !isOwner || started.current) return;
    started.current = true;
    void recordSetup(activeHouseholdId, { started_at: new Date().toISOString() });
  }, [tenantReady, isOwner, activeHouseholdId]);

  function toggle(key: string) {
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function skip() {
    void recordSetup(activeHouseholdId, { path: "manual", active_seconds: takeSeconds() }).then(() =>
      recordSetup(activeHouseholdId, { finished_at: new Date().toISOString() })
    );
    router.replace("/dashboard");
  }

  async function add() {
    if (saving || adding.current) return;
    adding.current = true;
    setSaving(true);
    const payload = toApplyPayload(draft, unticked, added, staff);
    const outcome = await applyHouseholdSetup(activeHouseholdId, payload);
    if (!outcome.ok) {
      adding.current = false;
      setSaving(false);
      toast.error(
        outcome.reason === "offline"
          ? t("You're offline. Nothing was added; try again when you're back online.", "Anda sedang offline. Belum ada yang ditambahkan; coba lagi saat online.")
          : t("Couldn't add the list. Nothing was added; try again.", "Daftar gagal ditambahkan. Belum ada yang ditambahkan; coba lagi.")
      );
      return;
    }
    const r = outcome.result;
    // Counts and the finish time go separately: the database takes a finish
    // time only within a day of the household's creation, and a refused
    // timestamp must not take the counts with it (an owner back days later).
    void recordSetup(activeHouseholdId, {
      path: "template",
      active_seconds: takeSeconds(),
      typed_fields: named.length,
      unticked: unticked.size,
      rooms_added: r.rooms_added,
      chores_added: r.chores_added,
      bills_added: r.bills_added,
      staff_added: r.staff_added,
    }).then(() => recordSetup(activeHouseholdId, { finished_at: new Date().toISOString() }));
    // The screens behind this one read their own copies: bring them up to date.
    await Promise.allSettled([refresh({ silent: true }), Promise.resolve(reloadRooms()), Promise.resolve(reloadStaff())]);
    setSentStaff(named.length);
    setSaving(false);
    setStep("done");
  }

  if (!isOwner) return null;

  if (step === "done") {
    return <Done staffCount={sentStaff} onFinish={() => router.replace("/dashboard")} />;
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-2">
        {step === "staff" ? (
          <button
            type="button"
            onClick={() => setStep("review")}
            className="-ml-2 flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-muted-foreground active:bg-muted"
          >
            <ChevronLeft className="size-4" /> {t("Your home", "Rumah Anda")}
          </button>
        ) : (
          <BrandMark size={36} rounded />
        )}
        <button
          type="button"
          onClick={() => void skip()}
          className="min-h-11 rounded-lg px-3 text-sm font-medium text-muted-foreground active:bg-muted"
        >
          {t("Skip for now", "Lewati dulu")}
        </button>
      </header>

      {step === "review" ? (
        <>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">{t("Your home", "Rumah Anda")}</h1>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("Untick what you don't have.", "Hapus centang yang tidak ada.")}</p>
          <SetupReview
            draft={draft}
            shape={shape}
            onShape={setShape}
            unticked={unticked}
            onToggle={toggle}
            added={added}
            locale={locale}
          />
        </>
      ) : (
        <StaffStep staff={staff} onChange={setStaff} draftJobs={draft.chores.filter((c) => !leftOut(draft, unticked).has(c.key) && !added.has(c.key)).map((c) => c.job)} />
      )}

      {/* The footer stays put: what Add will add, and the one button. */}
      <div className="sticky bottom-0 -mx-4 mt-6 border-t bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur">
        <p className="mb-2 text-center text-xs text-muted-foreground" aria-live="polite">
          {t(
            `${counts.rooms} rooms · ${counts.chores} chores · ${counts.bills} bills`,
            `${counts.rooms} ruangan · ${counts.chores} tugas · ${counts.bills} tagihan`
          )}
        </p>
        {step === "review" ? (
          <Button className="min-h-[52px] w-full" onClick={() => setStep("staff")}>
            {t("Next: your staff", "Lanjut: staf Anda")}
          </Button>
        ) : (
          <Button
            className="min-h-[52px] w-full"
            disabled={saving || !(choresLoaded || choresFailed) || (counts.total === 0 && named.length === 0)}
            onClick={() => void add()}
          >
            {saving && <Loader2 className="animate-spin" />}
            {setupAddLabel(counts, named.length, locale) ?? t("Everything's added", "Semua sudah ditambahkan")}
          </Button>
        )}
      </div>
    </main>
  );
}

/** "Your staff" (D6): names, an optional job chip each. */
function StaffStep({
  staff,
  onChange,
  draftJobs,
}: {
  staff: DraftStaff[];
  onChange: (next: DraftStaff[]) => void;
  draftJobs: string[];
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const set = (key: string, patch: Partial<DraftStaff>) => onChange(staff.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  return (
    <>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-gray-900">{t("Your staff", "Staf Anda")}</h1>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        {t(
          "Add their names. A job is optional: we'll give them the right chores.",
          "Tulis nama mereka. Tugas utama boleh dipilih: kami bagikan tugas yang sesuai."
        )}
      </p>
      <div className="flex flex-col gap-3">
        {staff.map((person, index) => {
          // The chores this person's job gives them (none when two share it).
          const mine =
            person.job && assigneeFor(person.job, staff) === person.key
              ? draftJobs.filter((j) => j === person.job).length
              : 0;
          return (
            <div key={person.key} className="flex flex-col gap-2 rounded-xl border bg-card p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={person.name}
                  onChange={(e) => set(person.key, { name: e.target.value })}
                  placeholder={t("Name", "Nama")}
                  aria-label={t(`Staff name ${index + 1}`, `Nama staf ${index + 1}`)}
                  maxLength={40}
                  autoComplete="off"
                  className="min-h-11"
                />
                {staff.length > 1 && (
                  <button
                    type="button"
                    aria-label={t("Remove", "Hapus")}
                    onClick={() => onChange(staff.filter((s) => s.key !== person.key))}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Job", "Tugas utama")}>
                {SETUP_JOBS.map((job) => (
                  <button
                    key={job}
                    type="button"
                    aria-pressed={person.job === job}
                    onClick={() => set(person.key, { job: person.job === job ? null : job })}
                    className={cn(
                      "flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium",
                      person.job === job ? "border-gray-900 bg-gray-900 text-white" : "bg-white text-gray-700 active:bg-muted"
                    )}
                  >
                    {person.job === job && <Check className="size-3" aria-hidden />}
                    {SETUP_JOB_LABELS[locale][job]}
                  </button>
                ))}
              </div>
              {mine > 0 && person.name.trim() && (
                <p className="text-xs text-muted-foreground">
                  {t(`${mine} chores for ${person.name.trim()}`, `${mine} tugas untuk ${person.name.trim()}`)}
                </p>
              )}
            </div>
          );
        })}
        {staff.length < 12 && (
          <Button
            variant="outline"
            className="min-h-11 self-start"
            onClick={() => onChange([...staff, { key: `s${Date.now()}`, name: "", job: null }])}
          >
            <Plus /> {t("Add another", "Tambah lagi")}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {t("Chores no one has the job for go to anyone on staff.", "Tugas yang tidak cocok dengan tugas utama siapa pun bisa dikerjakan siapa saja.")}
        </p>
      </div>
    </>
  );
}

/** Added: one WhatsApp message to the staff (D10), then Today. */
function Done({ staffCount, onFinish }: { staffCount: number; onFinish: () => void }) {
  const t = useT();
  const locale = useOwnerLocale();
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-6 pb-[calc(3rem+env(safe-area-inset-bottom))]">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Check className="size-6" aria-hidden />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{t("Your home is ready", "Rumah Anda siap")}</h1>
      {staffCount > 0 ? (
        <>
          <p className="text-sm text-muted-foreground">
            {t("Send this to your staff. Each person picks their name.", "Kirim ke staf Anda. Masing-masing memilih namanya.")}
          </p>
          <SendStaffMessageButton />
          <VideoTip id="owner-staff-phones" locale={locale} />
          <Button variant="outline" className="min-h-[48px]" onClick={onFinish}>
            {t("Go to Today", "Ke Hari ini")}
          </Button>
        </>
      ) : (
        <Button className="min-h-[52px]" onClick={onFinish}>
          {t("Go to Today", "Ke Hari ini")}
        </Button>
      )}
    </main>
  );
}
