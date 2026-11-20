"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, RotateCcw, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StaffWelcome } from "@/components/dashboard/staff-welcome";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { useSetUpChores } from "@/hooks/use-set-up-chores";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { useToday } from "@/hooks/use-today";
import { dataProvider } from "@/lib/data";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { applyHouseholdSetup, isMockBackend, type ApplyOutcome } from "@/lib/setup-apply";
import { cadenceLabel, nameKey } from "@/lib/setup-templates";
import { isSetUp } from "@/lib/rooms-view";
import type { StaffArea } from "@/lib/staff-areas";
import {
  NEW_STAFF_KEY,
  STAFF_JOBS,
  STAFF_JOB_LABELS,
  STAFF_NAME_MAX,
  addStaffPayload,
  choresToMove,
  cleanStaffName,
  formerStaffWithName,
  TRIAL_CHOICES,
  trialChore,
  hiddenAreasFor,
  kitchenStarters,
  staffWithName,
  type StarterChore,
} from "@/lib/staff-onboarding";
import { cn } from "@/lib/utils";
import type { StaffProfile } from "@/types/database";

/**
 * Add staff (staff onboarding plan, step 2): one sheet in place of the name
 * field, the eye icon and typing each chore. A name, what they do (chips
 * that set what they see), the kitchen's usual chores when Kitchen is
 * picked, and one save. Then the welcome to send.
 *
 * The person and their new chores are saved in one all-or-nothing call
 * (apply_household_setup, migrations/147). What they see is set right
 * after, on the row that call made (staff_profiles takes only a name on
 * insert, migrations/096), and chores the household already had are moved
 * one by one; both say so if they fail, and nothing is lost.
 *
 * Owner-facing: English or Bahasa Indonesia. Chore titles are Indonesian,
 * as staff read them, with the meaning beside them for English owners.
 */
/**
 * Kakak's add_staff card, filled into the sheet (staff onboarding step 5).
 * With autoSave the owner already confirmed on Kakak's card, so the sheet
 * saves at once (or brings back someone who left with that name) and shows
 * the welcome; a name already on the list waits for the owner, as by hand.
 */
export interface AddStaffPreset {
  name: string;
  areas: StaffArea[];
  starterChores: boolean;
  /** Kakak's trial_days (decision 3): 0, 14 or 30. */
  trialDays?: number;
  autoSave?: boolean;
}

export function AddStaffSheet({
  open,
  onClose,
  roster,
  reload,
  preset,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Everyone on the roster, including owners and people no longer here; null
   * until it has loaded (nothing is added before the name can be checked).
   */
  roster: StaffProfile[] | null;
  reload: () => Promise<void>;
  preset?: AddStaffPreset;
  /** After the person is added or brought back. */
  onAdded?: (person: { id: string; name: string }) => void;
}) {
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto" data-testid="add-staff-sheet">
        {/* Mounted only while open: a fresh form each time, and the household's
            chores are read only when the sheet needs them. */}
        {open && <AddStaffForm onClose={onClose} roster={roster} reload={reload} preset={preset} onAdded={onAdded} />}
      </SheetContent>
    </Sheet>
  );
}

type Added = { id: string; name: string; chores: number; back?: boolean; trialOn?: string };

function AddStaffForm({
  onClose,
  roster,
  reload,
  preset,
  onAdded,
}: {
  onClose: () => void;
  roster: StaffProfile[] | null;
  reload: () => Promise<void>;
  preset?: AddStaffPreset;
  onAdded?: (person: { id: string; name: string }) => void;
}) {
  const t = useT();
  // The name is checked against who is here and who left before anything is
  // saved, by hand or from Kakak's card (Codex, PR #173): a roster that
  // hasn't loaded is not an empty one.
  const rosterReady = roster !== null;
  const people = useMemo(() => roster ?? [], [roster]);
  const locale = useOwnerLocale();
  const { activeHouseholdId, refresh, updateHouseholdTask, createHouseholdTasks } = useHousehold();
  const { petsOn } = useHouseholdProfile();
  const { repairs: repairsOn } = useHouseholdFeatures();
  const { locations, failed: roomsFailed, reload: reloadRooms } = useHouseholdLocations();
  const today = formatDateLocal(useToday());
  const { rows: chores, loaded: choresLoaded, failed: choresFailed, reload: reloadChores } = useSetUpChores(today);
  const [name, setName] = useState(preset?.name ?? "");
  const [jobs, setJobs] = useState<Set<StaffArea>>(() => new Set(preset?.areas ?? []));
  // Kakak may say no starter chores: then none start ticked (the owner can still tick).
  const startersOn = preset?.starterChores ?? true;
  // A reminder to decide (step 6, decision 3): the owner's own chore, so no
  // new data is kept about the person.
  const [trial, setTrial] = useState<number>(() =>
    (TRIAL_CHOICES as readonly number[]).includes(preset?.trialDays ?? 0) ? (preset?.trialDays ?? 0) : 0
  );
  // The owner's own changes to the ticks, by chore key; the rest follow the defaults.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<Added | null>(null);
  // Two taps in one tick must not add the same person twice (demo check F-1).
  const lock = useSubmitLock();

  const clean = cleanStaffName(name);
  const taken = staffWithName(clean, people);
  // Someone who left with this name (step 4): offered back, with a fresh
  // welcome link, instead of a second "Sri" (migrations/180).
  const former = taken ? null : formerStaffWithName(clean, people);
  // The roster refuses these (migrations/147): said here, not as a failed save.
  const badName = /[<>]/.test(clean);
  const kitchen = jobs.has("kitchen");
  const shownJobs = STAFF_JOBS.filter((job) => (job === "pets" ? petsOn || jobs.has(job) : job === "repairs" ? repairsOn || jobs.has(job) : true));

  const starters = useMemo(
    () => (kitchen && chores ? kitchenStarters({ locations: locations ?? [], chores, today }) : []),
    [kitchen, chores, locations, today]
  );
  const ticked = useMemo(
    () => new Set(starters.filter((s) => (startersOn && s.ticked) !== flipped.has(s.key)).map((s) => s.key)),
    [starters, flipped, startersOn]
  );
  // Until every set-up chore is read, a "move" can't be told from a new one: wait.
  const startersReady = !kitchen || (choresLoaded && locations !== null);
  // A trial needs every open chore read, to find a reminder already there.
  const trialReady = trial === 0 || choresLoaded;
  const canAdd = trialReady && rosterReady && clean.length > 0 && jobs.size > 0 && !taken && !badName && !saving && startersReady;

  const ownerOf = useMemo(() => {
    const byId = new Map(people.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (byId.get(id) ?? null) : null);
  }, [people]);

  /**
   * Demo mode (no Supabase, the mock provider): no apply_household_setup to
   * call, so the person and their chores go through the provider's own
   * actions, as the old name field did (Codex, PR #170).
   */
  async function addInMock(person: string, payload: ReturnType<typeof addStaffPayload>): Promise<ApplyOutcome> {
    try {
      const profile = await dataProvider.createStaffProfile(person);
      const chores = payload.chores.filter((c) => c.assignee && "staff" in c.assignee);
      if (chores.length > 0) {
        await createHouseholdTasks(
          chores.map((c) => ({
            title: c.title,
            category: c.category,
            assigned_to: profile.id,
            due_date: c.due_date,
            recurrence: c.recurrence,
          }))
        );
      }
      return {
        ok: true,
        result: { rooms_added: 0, chores_added: chores.length, bills_added: 0, staff_added: 1, skipped: 0 },
        staff: { [NEW_STAFF_KEY]: profile.id },
      };
    } catch (err) {
      console.error("Add staff (demo)", err);
      return { ok: false, reason: "failed" };
    }
  }

  /**
   * Someone who left, back on the list with a fresh welcome (180). From
   * Kakak's card (withCard) the confirmed card applies too, as for someone
   * new: what they do, the ticked chores (given to them by id) and the trial
   * reminder (Codex, PR #173). By hand they come back with what they saw
   * before, as the line above the button says.
   */
  async function bringBack(person: StaffProfile, withCard = false) {
    if (saving || !lock.acquire()) return;
    setSaving(true);
    try {
      await dataProvider.restoreStaffProfile(person.id);
      let chores = 0;
      let trialOn: string | undefined;
      if (withCard) {
        if (jobs.size > 0) {
          await dataProvider.setStaffHiddenAreas(person.id, hiddenAreasFor(jobs)).catch((err) => {
            console.error("Bring back: areas not saved", err);
            toast.error(
              t(
                `${person.name} is back, but what they see wasn't saved. Tap the eye beside ${person.name} to set it.`,
                `${person.name} sudah kembali, tetapi yang dia lihat belum tersimpan. Ketuk ikon mata di samping ${person.name} untuk mengaturnya.`
              ),
              { duration: 10000 }
            );
          });
        }
        const payload = addStaffPayload({ name: person.name, starters, ticked, locations: locations ?? [] });
        const theirs = payload.chores.map((c) => ({ ...c, assignee: { profile: person.id } as const }));
        const reminder = trial > 0 ? trialChore(person.name, trial, today, locale) : null;
        const openReminder = reminder ? openTrialReminder(reminder.title) : null;
        if (reminder && openReminder && (await moveTrialReminder(openReminder, reminder.due_date))) {
          trialOn = dayLabel(reminder.due_date);
        }
        const newReminder = reminder && !openReminder ? reminder : null;
        if (newReminder) await dataProvider.ensureMyMemberProfile(activeHouseholdId).catch(() => null);
        const all = newReminder ? [...theirs, newReminder] : theirs;
        if (all.length > 0) {
          const outcome = await applyHouseholdSetup(activeHouseholdId, { ...payload, staff: [], chores: all });
          if (outcome.ok) {
            chores = outcome.result.chores_added - (newReminder ? 1 : 0);
            if (newReminder) trialOn = dayLabel(newReminder.due_date);
          } else {
            toast.error(
              t(`${person.name} is back, but their chores weren't added. Add them in Home → Chores.`, `${person.name} sudah kembali, tetapi tugasnya belum ditambahkan. Tambahkan di Rumah → Tugas.`),
              { duration: 10000 }
            );
          }
        }
        const moves = choresToMove(starters, ticked);
        const moved = await Promise.allSettled(moves.map((taskId) => updateHouseholdTask(taskId, { assigned_to: person.id })));
        chores += moved.filter((r) => r.status === "fulfilled").length;
      }
      await Promise.allSettled([reload(), refresh({ silent: true })]);
      setAdded({ id: person.id, name: person.name, chores: Math.max(0, chores), back: true, trialOn });
      onAdded?.({ id: person.id, name: person.name });
    } catch (err) {
      console.error(err);
      lock.release();
      toast.error(t(`Couldn't bring ${person.name} back. Try again.`, `${person.name} gagal dikembalikan. Coba lagi.`));
    } finally {
      setSaving(false);
    }
  }

  /**
   * A trial reminder for this name that is still open (someone brought back
   * mid-trial): apply_household_setup would skip a second one with the same
   * title, so that one is moved to the new day instead (Codex, PR #173).
   */
  function openTrialReminder(title: string): string | null {
    return (chores ?? []).find((c) => isSetUp(c, today) && nameKey(c.title) === nameKey(title))?.id ?? null;
  }

  /** Moves an open trial reminder to the new day; false when that failed. */
  async function moveTrialReminder(id: string, due: string): Promise<boolean> {
    return updateHouseholdTask(id, { due_date: due, remind_days_before: 0 })
      .then(() => true)
      .catch((err) => {
        console.error("Trial reminder not moved", err);
        return false;
      });
  }

  /** "Thu 4 Dec" / "Kam 4 Des": the trial reminder's day. */
  function dayLabel(day: string): string {
    return new Date(`${day}T00:00:00`).toLocaleDateString(locale === "id" ? "id-ID" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function toggleJob(job: StaffArea) {
    setJobs((prev) => {
      const next = new Set(prev);
      if (next.has(job)) next.delete(job);
      else next.add(job);
      return next;
    });
  }

  function toggleChore(key: string) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function add() {
    if (!canAdd || !lock.acquire()) return;
    setSaving(true);
    const person = clean;
    const payload = addStaffPayload({ name: person, starters, ticked, locations: locations ?? [] });
    const mock = await isMockBackend();
    // In demo mode the trial reminder isn't made (no owner roster row to give it to).
    const trialWanted = trial > 0 && !mock ? trialChore(person, trial, today, locale) : null;
    const openReminder = trialWanted ? openTrialReminder(trialWanted.title) : null;
    const trialReminder = trialWanted && !openReminder ? trialWanted : null;
    if (trialReminder) {
      // "For you" needs the owner's own roster row (apply_household_setup
      // refuses no_owner_profile): made here if it is missing.
      await dataProvider.ensureMyMemberProfile(activeHouseholdId).catch(() => null);
      payload.chores.push(trialReminder);
    }
    const outcome = mock ? await addInMock(person, payload) : await applyHouseholdSetup(activeHouseholdId, payload);
    const id = outcome.ok ? outcome.staff[NEW_STAFF_KEY] : undefined;
    if (!outcome.ok || !id) {
      lock.release();
      setSaving(false);
      toast.error(
        outcome.ok === false && outcome.reason === "offline"
          ? t("You're offline. Nothing was saved; try again with a signal.", "Anda sedang offline. Belum ada yang tersimpan; coba lagi saat ada sinyal.")
          : t(`Couldn't add ${person}. Nothing was saved; try again.`, `${person} gagal ditambahkan. Belum ada yang tersimpan; coba lagi.`)
      );
      return;
    }

    // What they see, on the row just made. Tried twice: a failure leaves
    // today's default (everything), which the owner can still change.
    const hidden = hiddenAreasFor(jobs);
    if (hidden.length > 0) {
      const set = () => dataProvider.setStaffHiddenAreas(id, hidden);
      const ok = await set()
        .then(() => true)
        .catch(() => set().then(() => true))
        .catch((err) => {
          console.error("Add staff: areas not saved", err);
          return false;
        });
      if (!ok) {
        toast.error(
          t(
            `${person} is added, but what they see wasn't saved. Tap the eye beside ${person} to set it.`,
            `${person} sudah ditambahkan, tetapi yang dia lihat belum tersimpan. Ketuk ikon mata di samping ${person} untuk mengaturnya.`
          ),
          { duration: 10000 }
        );
      }
    }

    // Chores the household already had, moved to them one by one.
    const moves = choresToMove(starters, ticked);
    const moved = await Promise.allSettled(moves.map((taskId) => updateHouseholdTask(taskId, { assigned_to: id })));
    const notMoved = moved.filter((r) => r.status === "rejected").length;
    if (notMoved > 0) {
      toast.error(
        t(
          `${notMoved} ${notMoved === 1 ? "chore wasn't" : "chores weren't"} moved to ${person}. Change them in Home → Chores.`,
          `${notMoved} tugas belum dipindahkan ke ${person}. Ubah di Rumah → Tugas.`
        ),
        { duration: 10000 }
      );
    }

    const trialMoved = trialWanted && openReminder ? await moveTrialReminder(openReminder, trialWanted.due_date) : false;
    const chores = (outcome.result.chores_added ?? 0) - (trialReminder ? 1 : 0) + (moves.length - notMoved);
    await Promise.allSettled([reload(), refresh({ silent: true })]);
    setAdded({
      id,
      name: person,
      chores: Math.max(0, chores),
      trialOn: trialReminder || trialMoved ? dayLabel((trialReminder ?? trialWanted)!.due_date) : undefined,
    });
    setSaving(false);
    onAdded?.({ id, name: person });
  }

  // Kakak's card was the confirmation (step 5): save once everything is read.
  const autoTried = useRef(false);
  useEffect(() => {
    if (!preset?.autoSave || autoTried.current || added || saving || !rosterReady) return;
    if (former) {
      // The card's kitchen chores come too, so wait until they are read
      // (Codex, PR #173), as Add does through canAdd.
      if (!startersReady || !trialReady) return;
      autoTried.current = true;
      void bringBack(former, true);
    } else if (canAdd) {
      autoTried.current = true;
      void add();
    } else if (taken || badName || (startersReady && jobs.size === 0)) {
      // Left for the owner, as by hand.
      autoTried.current = true;
    }
  });

  if (added) {
    return (
      <>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserRoundCheck className="size-5 text-emerald-600" aria-hidden />
            {added.back
              ? t(`${added.name} is back`, `${added.name} sudah kembali`)
              : t(`${added.name} is added`, `${added.name} sudah ditambahkan`)}
          </SheetTitle>
          <SheetDescription>
            {t(
              `Send the welcome on WhatsApp, or show ${added.name} the QR code. They open the link, tap Ya and make a 4-digit PIN.`,
              `Kirim sambutan lewat WhatsApp, atau tunjukkan kode QR ke ${added.name}. Dia membuka link, mengetuk Ya, lalu membuat PIN 4 angka.`
            )}
          </SheetDescription>
        </SheetHeader>
        {added.chores > 0 && (
          <p className="px-4 text-sm text-muted-foreground">
            {t(
              `${added.chores} ${added.chores === 1 ? "chore is" : "chores are"} ${added.name}'s from today.`,
              `${added.chores} tugas jadi milik ${added.name} mulai hari ini.`
            )}
          </p>
        )}
        {added.trialOn && (
          <p className="px-4 text-sm text-muted-foreground">
            {t(
              `On ${added.trialOn}, My tasks reminds you to decide on ${added.name}'s trial.`,
              `Pada ${added.trialOn}, Tugas saya mengingatkan Anda untuk memutuskan masa percobaan ${added.name}.`
            )}
          </p>
        )}
        <div className="px-4">
          <StaffWelcome person={{ id: added.id, name: added.name }} />
        </div>
        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button variant="ghost" className="min-h-[48px]" onClick={onClose}>
            {t("Done", "Selesai")}
          </Button>
        </SheetFooter>
      </>
    );
  }

  const shown = clean || t("them", "dia");
  return (
    <>
      <SheetHeader>
        <SheetTitle>{t("Add staff", "Tambah staf")}</SheetTitle>
        <SheetDescription>
          {t(
            "Their name, and what they do. Miamus sets up the rest.",
            "Namanya, dan apa yang dikerjakan. Sisanya diatur Miamus."
          )}
        </SheetDescription>
      </SheetHeader>
      <form
        className="flex flex-col gap-5 px-4"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="add-staff-name" className="text-xs">
            {t("Name", "Nama")}
          </Label>
          <Input
            id="add-staff-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("e.g. Sri", "mis. Sri")}
            maxLength={STAFF_NAME_MAX}
            autoComplete="off"
            enterKeyHint="done"
          />
          {!rosterReady ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              {t("Checking your staff list…", "Memeriksa daftar staf…")}
              <button type="button" className="font-medium text-gray-900 underline" onClick={() => void reload()}>
                {t("Try again", "Coba lagi")}
              </button>
            </p>
          ) : badName ? (
            <p className="text-[11px] text-destructive" role="status">
              {t("A name can't have < or > in it.", "Nama tidak boleh berisi < atau >.")}
            </p>
          ) : taken ? (
            <p className="text-[11px] text-destructive" role="status">
              {t(`${taken.name} is already on the staff list.`, `${taken.name} sudah ada di daftar staf.`)}
            </p>
          ) : former ? (
            <div className="flex flex-col gap-2 rounded-lg bg-muted px-3 py-2" role="status">
              <p className="text-xs text-gray-700">
                {t(
                  `${former.name} used to work here. Bring them back with what they saw before?`,
                  `${former.name} pernah bekerja di sini. Kembalikan dengan yang dia lihat sebelumnya?`
                )}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 self-start rounded-lg"
                disabled={saving}
                onClick={() => void bringBack(former)}
              >
                <RotateCcw /> {t(`Bring ${former.name} back`, `Kembalikan ${former.name}`)}
              </Button>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {t(
                "The name they'll tap when signing in, so use what they go by.",
                "Nama yang dia ketuk saat masuk, jadi pakai nama panggilannya."
              )}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium">{t(`What does ${shown} do?`, `Apa yang dikerjakan ${shown}?`)}</legend>
          <div className="flex flex-wrap gap-2">
            {shownJobs.map((job) => {
              const on = jobs.has(job);
              const [en, id] = STAFF_JOB_LABELS[job];
              return (
                <button
                  key={job}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleJob(job)}
                  className={cn(
                    "flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                    on ? "border-gray-900 bg-gray-900 text-white" : "bg-white text-gray-700 active:bg-muted"
                  )}
                >
                  {on && <Check className="size-3.5" aria-hidden />}
                  {t(en, id)}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {jobs.has("home")
              ? t(
                  `Chores for anyone show to ${shown} too. Change what they see later with the eye.`,
                  `Tugas untuk siapa saja juga tampil untuk ${shown}. Ubah yang dia lihat nanti lewat ikon mata.`
                )
              : t(
                  "This sets what they see on their phone. Change it later with the eye.",
                  "Pilihan ini mengatur yang dia lihat di HP-nya. Ubah nanti lewat ikon mata."
                )}
          </p>
        </fieldset>

        {kitchen && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium">{t(`Kitchen chores for ${shown}`, `Tugas dapur untuk ${shown}`)}</p>
            {!startersReady && (choresFailed || roomsFailed) ? (
              // Without every chore read, a move can't be told from a new one
              // (as the starter list, code review PR #90).
              <div className="flex items-center justify-between gap-3 py-2">
                <p className="text-xs text-muted-foreground">
                  {choresFailed
                    ? t("Couldn't load your chores.", "Tugas Anda gagal dimuat.")
                    : t("Couldn't load your rooms.", "Ruangan Anda gagal dimuat.")}
                </p>
                <Button type="button" variant="outline" size="sm" className="min-h-10 rounded-lg" onClick={() => {
                    if (choresFailed) reloadChores();
                    if (roomsFailed) reloadRooms();
                  }}>
                  {t("Try again", "Coba lagi")}
                </Button>
              </div>
            ) : !startersReady ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              starters.map((s) => (
                <StarterRow
                  key={s.key}
                  starter={s}
                  checked={ticked.has(s.key)}
                  onToggle={() => toggleChore(s.key)}
                  label={locale === "en" ? s.en : s.title}
                  detail={starterDetail(s, shown, ownerOf, cadenceLabel(s, locale), t)}
                />
              ))
            )}
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs font-medium">{t("Trial", "Masa percobaan")}</legend>
          <div className="flex flex-wrap gap-2">
            {TRIAL_CHOICES.map((days) => {
              const on = trial === days;
              const label =
                days === 0
                  ? t("No trial", "Tanpa masa percobaan")
                  : days === 14
                    ? t("2 weeks", "2 minggu")
                    : t("1 month", "1 bulan");
              return (
                <button
                  key={days}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTrial(days)}
                  className={cn(
                    "flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
                    on ? "border-gray-900 bg-gray-900 text-white" : "bg-white text-gray-700 active:bg-muted"
                  )}
                >
                  {on && <Check className="size-3.5" aria-hidden />}
                  {label}
                </button>
              );
            })}
          </div>
          {trial > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {t(
                `A reminder in My tasks when it ends, to keep ${shown} or not. Nothing changes for ${shown}.`,
                `Pengingat di Tugas saya saat selesai, untuk memutuskan lanjut atau tidak. Tidak ada yang berubah untuk ${shown}.`
              )}
            </p>
          )}
        </fieldset>

        <SheetFooter className="px-0 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button type="submit" className="min-h-[48px] rounded-xl" disabled={!canAdd}>
            {saving && <Loader2 className="animate-spin" />}
            {clean ? t(`Add ${clean}`, `Tambah ${clean}`) : t("Add", "Tambah")}
          </Button>
          <Button type="button" variant="ghost" className="min-h-[48px]" disabled={saving} onClick={onClose}>
            {t("Cancel", "Batal")}
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}

function starterDetail(
  s: StarterChore,
  who: string,
  ownerOf: (id: string | null) => string | null,
  repeat: string,
  t: ReturnType<typeof useT>
): string {
  if (!s.existing) return repeat;
  const owner = ownerOf(s.existing.assignedTo);
  return owner
    ? t(`${repeat} · now ${owner}'s, move to ${who}?`, `${repeat} · sekarang milik ${owner}, pindahkan ke ${who}?`)
    : t(`${repeat} · for anyone now, give to ${who}?`, `${repeat} · sekarang untuk siapa saja, berikan ke ${who}?`);
}

function StarterRow({
  starter,
  checked,
  onToggle,
  label,
  detail,
}: {
  starter: StarterChore;
  checked: boolean;
  onToggle: () => void;
  label: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`${label}, ${detail}`}
      data-starter={starter.key}
      onClick={onToggle}
      className="flex min-h-12 items-center gap-3 rounded-lg px-1 text-left active:bg-muted"
    >
      <span
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border",
          checked ? "border-gray-900 bg-gray-900 text-white" : "bg-white"
        )}
      >
        {checked && <Check className="size-3.5" aria-hidden />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-gray-900">{label}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </button>
  );
}
