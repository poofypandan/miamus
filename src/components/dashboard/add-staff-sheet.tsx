"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, UserRoundCheck } from "lucide-react";
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
import { cadenceLabel } from "@/lib/setup-templates";
import type { StaffArea } from "@/lib/staff-areas";
import {
  NEW_STAFF_KEY,
  STAFF_JOBS,
  STAFF_JOB_LABELS,
  STAFF_NAME_MAX,
  addStaffPayload,
  choresToMove,
  cleanStaffName,
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
export function AddStaffSheet({
  open,
  onClose,
  roster,
  reload,
}: {
  open: boolean;
  onClose: () => void;
  /** Everyone on the roster, including owners and people no longer here. */
  roster: StaffProfile[];
  reload: () => Promise<void>;
}) {
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto" data-testid="add-staff-sheet">
        {/* Mounted only while open: a fresh form each time, and the household's
            chores are read only when the sheet needs them. */}
        {open && <AddStaffForm onClose={onClose} roster={roster} reload={reload} />}
      </SheetContent>
    </Sheet>
  );
}

type Added = { id: string; name: string; chores: number };

function AddStaffForm({
  onClose,
  roster,
  reload,
}: {
  onClose: () => void;
  roster: StaffProfile[];
  reload: () => Promise<void>;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const { activeHouseholdId, refresh, updateHouseholdTask, createHouseholdTasks } = useHousehold();
  const { petsOn } = useHouseholdProfile();
  const { repairs: repairsOn } = useHouseholdFeatures();
  const { locations, failed: roomsFailed, reload: reloadRooms } = useHouseholdLocations();
  const today = formatDateLocal(useToday());
  const { rows: chores, loaded: choresLoaded, failed: choresFailed, reload: reloadChores } = useSetUpChores(today);
  const [name, setName] = useState("");
  const [jobs, setJobs] = useState<Set<StaffArea>>(() => new Set());
  // The owner's own changes to the ticks, by chore key; the rest follow the defaults.
  const [flipped, setFlipped] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<Added | null>(null);
  // Two taps in one tick must not add the same person twice (demo check F-1).
  const lock = useSubmitLock();

  const clean = cleanStaffName(name);
  const taken = staffWithName(clean, roster);
  // The roster refuses these (migrations/147): said here, not as a failed save.
  const badName = /[<>]/.test(clean);
  const kitchen = jobs.has("kitchen");
  const shownJobs = STAFF_JOBS.filter((job) => (job === "pets" ? petsOn || jobs.has(job) : job === "repairs" ? repairsOn || jobs.has(job) : true));

  const starters = useMemo(
    () => (kitchen && chores ? kitchenStarters({ locations: locations ?? [], chores, today }) : []),
    [kitchen, chores, locations, today]
  );
  const ticked = useMemo(
    () => new Set(starters.filter((s) => s.ticked !== flipped.has(s.key)).map((s) => s.key)),
    [starters, flipped]
  );
  // Until every set-up chore is read, a "move" can't be told from a new one: wait.
  const startersReady = !kitchen || (choresLoaded && locations !== null);
  const canAdd = clean.length > 0 && jobs.size > 0 && !taken && !badName && !saving && startersReady;

  const ownerOf = useMemo(() => {
    const byId = new Map(roster.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (byId.get(id) ?? null) : null);
  }, [roster]);

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
    const outcome = (await isMockBackend())
      ? await addInMock(person, payload)
      : await applyHouseholdSetup(activeHouseholdId, payload);
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

    const chores = (outcome.result.chores_added ?? 0) + (moves.length - notMoved);
    await Promise.allSettled([reload(), refresh({ silent: true })]);
    setAdded({ id, name: person, chores });
    setSaving(false);
  }

  if (added) {
    return (
      <>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <UserRoundCheck className="size-5 text-emerald-600" aria-hidden />
            {t(`${added.name} is added`, `${added.name} sudah ditambahkan`)}
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
          {badName ? (
            <p className="text-[11px] text-destructive" role="status">
              {t("A name can't have < or > in it.", "Nama tidak boleh berisi < atau >.")}
            </p>
          ) : taken ? (
            <p className="text-[11px] text-destructive" role="status">
              {t(`${taken.name} is already on the staff list.`, `${taken.name} sudah ada di daftar staf.`)}
            </p>
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
