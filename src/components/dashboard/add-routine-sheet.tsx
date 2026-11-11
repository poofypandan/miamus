"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Camera, Check, CircleCheck, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { useFormatTime } from "@/components/ui/ui-labels";
import { dataProvider } from "@/lib/data";
import {
  ROUTINE_KINDS,
  ROUTINE_NOTE_MAX,
  proofChoices,
  routineKindInfo,
} from "@/lib/pet-routine-kinds";
import {
  draftFromRows,
  endedRowPatch,
  draftProblem,
  newDraft,
  planRoutineSave,
  type RoutineDraft,
  type RoutineRepeat,
} from "@/lib/routine-groups";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { MasterSchedule, RoutineKind, RoutineProof } from "@/types/database";

/**
 * What the sheet is opened for: a new routine for these pets, or the rows of
 * an existing one (a group, or one old "Others" row) to edit.
 */
export type AddRoutineTarget = { petIds: string[] } | { rows: MasterSchedule[] };

const FIELD_CLASS =
  "min-h-[44px] w-full min-w-0 rounded-xl border border-input bg-transparent px-2.5 text-base font-medium tabular-nums outline-none [color-scheme:light] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const WEEKDAYS: { iso: number; en: string; id: string }[] = [
  { iso: 1, en: "Mon", id: "Sen" },
  { iso: 2, en: "Tue", id: "Sel" },
  { iso: 3, en: "Wed", id: "Rab" },
  { iso: 4, en: "Thu", id: "Kam" },
  { iso: 5, en: "Fri", id: "Jum" },
  { iso: 6, en: "Sat", id: "Sab" },
  { iso: 7, en: "Sun", id: "Min" },
];

/**
 * Add routine / Tambah rutinitas (Phase 173): pick what, pick the pets, pick
 * the time. Every day, no end date, a photo, for anyone, unless the owner says
 * otherwise. Only What and When matter, and both come with defaults from the
 * chip (stop rule: no new required field).
 *
 * Owner-facing, in the owner's language. The saved title is Indonesian,
 * because staff read it (lib/pet-routine-kinds).
 */
export function AddRoutineSheet({
  target,
  onClose,
}: {
  target: AddRoutineTarget | null;
  onClose: () => void;
}) {
  const { pets, createSchedulesBatch, updateSchedule, deleteSchedule } = useHousehold();
  const t = useT();
  const locale = useOwnerLocale();
  const formatTime = useFormatTime();
  const today = formatDateLocal(useToday());
  const editing = !!target && "rows" in target;
  const [draft, setDraft] = useState<RoutineDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showEnds, setShowEnds] = useState(false);
  // The chip the owner picked; null until they pick one for a new routine, so
  // nothing is preset that they didn't choose.
  const [picked, setPicked] = useState<RoutineKind | null>(null);

  useBackToClose(!!target, onClose);
  useBackToClose(confirmRemove, () => setConfirmRemove(false));

  // A fresh draft each time the sheet opens, from what it was opened for.
  useEffect(() => {
    if (!target) {
      setDraft(null);
      return;
    }
    const next = "rows" in target ? draftFromRows(target.rows, today) : newDraft("walk", target.petIds, today);
    // For a new routine the draft's kind is a placeholder until a chip is picked.
    setDraft("rows" in target ? next : { ...next, title: "" });
    setPicked("rows" in target ? next.kind : null);
    setShowEnds(!!next.endsOn);
    setConfirmRemove(false);
    // `today` changes only at midnight; re-deriving then is fine.
  }, [target, today]);

  const petsById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);
  // An archived pet can still be on an old row; it isn't offered, and isn't saved.
  const chosenPets = draft ? draft.petIds.filter((id) => petsById.has(id)) : [];

  if (!target || !draft) {
    return <Sheet open={false} onOpenChange={() => onClose()} />;
  }

  const set = (patch: Partial<RoutineDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  function pickKind(kind: RoutineKind) {
    const info = routineKindInfo(kind)!;
    setPicked(kind);
    setDraft((d) =>
      d
        ? {
            ...d,
            kind,
            // Other keeps what was typed; a chip names it in Indonesian.
            title: info.title ?? (d.kind === "other" ? d.title : ""),
            // A new routine takes the chip's time; an edit keeps its times.
            times: editing ? d.times : [info.time],
            proof: info.proof,
          }
        : d
    );
  }

  function togglePet(id: string) {
    set({ petIds: draft!.petIds.includes(id) ? draft!.petIds.filter((p) => p !== id) : [...draft!.petIds, id] });
  }

  function toggleDay(iso: number) {
    set({ days: draft!.days.includes(iso) ? draft!.days.filter((d) => d !== iso) : [...draft!.days, iso] });
  }

  function setTime(index: number, value: string) {
    if (!value) return;
    set({ times: draft!.times.map((t, i) => (i === index ? value : t)) });
  }

  function addTime() {
    const last = draft!.times[draft!.times.length - 1] ?? "08:00";
    const hour = (Number(last.slice(0, 2)) + 8) % 24;
    set({ times: [...draft!.times, `${String(hour).padStart(2, "0")}:${last.slice(3, 5)}`] });
  }

  const valid = { ...draft, petIds: chosenPets };
  const problem = picked ? draftProblem(valid) : "title";
  const kindInfo = picked ? routineKindInfo(picked) : null;

  async function save() {
    if (!draft || !target) return;
    if (problem) {
      toast.error(
        problem === "title"
          ? picked
            ? t("Give the routine a name", "Beri nama rutinitasnya")
            : t("Choose what the routine is", "Pilih rutinitasnya")
          : problem === "pets"
            ? t("Choose at least one pet", "Pilih minimal satu hewan")
            : problem === "days"
              ? t("Choose at least one day", "Pilih minimal satu hari")
              : t("Add a time", "Tambah jam")
      );
      return;
    }
    setSaving(true);
    try {
      const existing = "rows" in target ? target.rows : [];
      const groupId = existing.find((r) => r.routine_group_id)?.routine_group_id ?? crypto.randomUUID();
      const plan = planRoutineSave({
        draft: valid,
        existing,
        groupId,
        onceStart: new Date(`${draft.onceDate}T00:00:00`).toISOString(),
        nowIso: new Date().toISOString(),
        today,
      });
      if (plan.create.length > 0) await createSchedulesBatch(plan.create);
      for (const { id, patch } of plan.update) await updateSchedule(id, patch);
      await removeRows(plan.remove);
      toast.success(
        editing
          ? t("Routine saved", "Rutinitas disimpan")
          : t(`${kindLabel(picked!)} added`, `${kindLabel(picked!)} ditambahkan`)
      );
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(t("Routine not saved. Try again.", "Rutinitas gagal disimpan. Coba lagi."));
    } finally {
      setSaving(false);
    }
  }

  // A row with logs ends yesterday and leaves the group, so its history keeps
  // its title and it is never read back as part of the routine; a row with
  // none is deleted (D3 editing rules).
  async function removeRows(rows: MasterSchedule[]) {
    if (rows.length === 0) return;
    const withLogs = await dataProvider.schedulesWithLogs(rows.map((r) => r.id));
    for (const row of rows) {
      if (withLogs.has(row.id)) await updateSchedule(row.id, endedRowPatch(today));
      else await deleteSchedule(row.id);
    }
  }

  async function removeRoutine() {
    if (!target || !("rows" in target)) return;
    setSaving(true);
    try {
      await removeRows(target.rows);
      toast.success(t("Routine removed", "Rutinitas dihapus"));
      setConfirmRemove(false);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(t("Routine not removed. Try again.", "Rutinitas gagal dihapus. Coba lagi."));
    } finally {
      setSaving(false);
    }
  }

  function kindLabel(kind: RoutineKind) {
    const info = routineKindInfo(kind)!;
    return kind === "other" ? draft!.title.trim() || info[locale] : info[locale];
  }

  const onlyPet = chosenPets.length === 1 ? petsById.get(chosenPets[0]) : null;
  const buttonLabel = editing
    ? t("Save", "Simpan")
    : onlyPet
      ? t(`Add for ${onlyPet.name}`, `Tambah untuk ${onlyPet.name}`)
      : t(`Add for ${chosenPets.length} pets`, `Tambah untuk ${chosenPets.length} hewan`);

  const repeatSegments: { value: RoutineRepeat; label: string }[] = [
    { value: "daily", label: t("Every day", "Setiap hari") },
    { value: "days", label: t("Some days", "Hari tertentu") },
    { value: "once", label: t("Once", "Sekali saja") },
  ];
  const proofLabel: Record<RoutineProof, string> = {
    three: t("3 photos", "3 foto"),
    photo: picked === "walk" || picked === "other" ? t("1 photo", "1 foto") : t("Photo", "Foto"),
    tick: t("Tick", "Centang"),
  };
  const proofHint: Record<RoutineProof, string> = {
    three: t(
      "Three photos from the camera: at the gate, where they walked to, back at the gate. Miamus notes how long it took.",
      "Tiga foto dari kamera: di gerbang, di tempat tujuan, dan di gerbang saat pulang. Miamus mencatat berapa lama."
    ),
    photo: t("One photo covers every pet on the card.", "Satu foto untuk semua hewan di kartu itu."),
    tick: t("Staff tick it off, with no photo.", "Staf cukup mencentang, tanpa foto."),
  };

  return (
    <>
      <Sheet open onOpenChange={(open) => !open && onClose()}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[92dvh] max-w-md gap-0 overflow-y-auto rounded-t-2xl"
          data-testid="add-routine-sheet"
        >
          <SheetHeader className="border-b">
            <SheetTitle>{editing ? t("Edit routine", "Ubah rutinitas") : t("Add routine", "Tambah rutinitas")}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("Choose what, for which pets, and when.", "Pilih apa, untuk hewan mana, dan kapan.")}
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-col gap-5 px-4 py-4">
            <Row label={t("What", "Apa")}>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("What", "Apa")}>
                {ROUTINE_KINDS.map((k) => {
                  const on = picked === k.kind;
                  return (
                    <button
                      key={k.kind}
                      type="button"
                      aria-pressed={on}
                      onClick={() => pickKind(k.kind)}
                      className={cn(
                        "flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium",
                        on ? "border-zinc-900 bg-zinc-900 text-white" : "border-border bg-card text-zinc-700"
                      )}
                    >
                      <k.icon className="size-4" aria-hidden />
                      {k[locale]}
                    </button>
                  );
                })}
              </div>
              {picked === "other" && (
                <Input
                  value={draft.title}
                  onChange={(e) => set({ title: e.target.value })}
                  maxLength={60}
                  autoFocus={!editing}
                  aria-label={t("Routine name", "Nama rutinitas")}
                  placeholder={t("e.g. Brush coat (staff read it as typed)", "mis. Sisir bulu")}
                  className="mt-2 min-h-[44px]"
                />
              )}
            </Row>

            <Row label={t("For", "Untuk")}>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t("For", "Untuk")}>
                {pets.map((pet) => {
                  const on = draft.petIds.includes(pet.id);
                  return (
                    <button
                      key={pet.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => togglePet(pet.id)}
                      className={cn(
                        "flex min-h-10 items-center gap-1 rounded-full border px-3 text-sm font-medium",
                        on ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-border bg-card text-zinc-600"
                      )}
                    >
                      {on && <Check className="size-3.5" aria-hidden />}
                      {pet.name}
                    </button>
                  );
                })}
              </div>
            </Row>

            <Row label={t("When", "Kapan")}>
              <div className="flex flex-wrap items-center gap-2">
                {draft.times.map((time, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <input
                      type="time"
                      step={60}
                      value={time}
                      onChange={(e) => setTime(i, e.target.value)}
                      aria-label={t(`Time ${i + 1}`, `Jam ${i + 1}`)}
                      className={cn(FIELD_CLASS, "w-[7.5rem]")}
                    />
                    {draft.times.length > 1 && (
                      <button
                        type="button"
                        onClick={() => set({ times: draft.times.filter((_, j) => j !== i) })}
                        aria-label={t(`Remove ${formatTime(time)}`, `Hapus ${formatTime(time)}`)}
                        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    )}
                  </span>
                ))}
                {draft.times.length < 6 && (
                  <Button type="button" variant="ghost" size="sm" onClick={addTime} className="min-h-10 rounded-lg">
                    <Plus className="size-4" /> {t("Add time", "Tambah jam")}
                  </Button>
                )}
              </div>
              <SegmentedControl
                className="mt-3"
                segments={repeatSegments}
                value={draft.repeat}
                onChange={(repeat) => set({ repeat })}
                ariaLabel={t("Repeats", "Ulangi")}
              />
              {draft.repeat === "days" && (
                <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={t("Days", "Hari")}>
                  {WEEKDAYS.map((d) => {
                    const on = draft.days.includes(d.iso);
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleDay(d.iso)}
                        className={cn(
                          "min-h-10 min-w-11 rounded-full border px-2 text-sm font-medium",
                          on ? "border-zinc-900 bg-zinc-900 text-white" : "border-border bg-card text-zinc-600"
                        )}
                      >
                        {d[locale]}
                      </button>
                    );
                  })}
                </div>
              )}
              {draft.repeat === "once" ? (
                <input
                  type="date"
                  value={draft.onceDate}
                  min={editing ? undefined : today}
                  onChange={(e) => e.target.value && set({ onceDate: e.target.value })}
                  aria-label={t("Date", "Tanggal")}
                  className={cn(FIELD_CLASS, "mt-3")}
                />
              ) : showEnds ? (
                <div className="mt-3 flex items-center gap-2">
                  <span className="shrink-0 text-sm text-muted-foreground">{t("Ends", "Berakhir")}</span>
                  <input
                    type="date"
                    value={draft.endsOn ?? ""}
                    min={today}
                    onChange={(e) => set({ endsOn: e.target.value || null })}
                    aria-label={t("Ends", "Berakhir")}
                    className={FIELD_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      set({ endsOn: null });
                      setShowEnds(false);
                    }}
                    aria-label={t("No end date", "Tanpa tanggal berakhir")}
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowEnds(true)}
                  className="mt-2 min-h-9 text-sm text-muted-foreground underline-offset-2 active:underline"
                >
                  {t("Ends (optional): never", "Berakhir (opsional): tidak")}
                </button>
              )}
            </Row>

            <Row label={t("Who", "Siapa")}>
              <Suspense fallback={null}>
                <StaffChips value={draft.staffId} onChange={(staffId) => set({ staffId })} />
              </Suspense>
            </Row>

            <Row label={t("Note for staff", "Catatan untuk staf")} optional={t("optional", "opsional")}>
              <Input
                value={draft.note}
                onChange={(e) => set({ note: e.target.value.slice(0, ROUTINE_NOTE_MAX) })}
                maxLength={ROUTINE_NOTE_MAX}
                aria-label={t("Note for staff", "Catatan untuk staf")}
                placeholder={t("e.g. Living room and the dogs' room", "mis. Lampu ruang tamu dan kamar anjing")}
                className="min-h-[44px]"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Staff read it as you type it.", "Staf membacanya persis seperti yang Anda tulis.")}
              </p>
            </Row>

            {picked && (
              <Row label={t("Proof", "Bukti")}>
                <SegmentedControl
                  segments={proofChoices(picked).map((p) => ({ value: p, label: proofLabel[p] }))}
                  value={proofChoices(picked).includes(draft.proof) ? draft.proof : "photo"}
                  onChange={(proof) => set({ proof })}
                  ariaLabel={t("Proof", "Bukti")}
                />
                <p className="mt-1 text-xs text-muted-foreground">{proofHint[draft.proof]}</p>
              </Row>
            )}

            {picked && kindInfo && (
              <StaffPreview
                icon={kindInfo.icon}
                time={draft.times[0]}
                title={draft.title.trim() || kindInfo.id}
                note={draft.note.trim()}
                pets={chosenPets.map((id) => petsById.get(id)!.name)}
                proof={draft.proof}
                label={t("Staff will see", "Yang dilihat staf")}
              />
            )}
          </div>

          <SheetFooter className="border-t pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button
              onClick={save}
              disabled={saving}
              className="min-h-[52px] w-full rounded-xl text-base"
            >
              {saving ? <Loader2 className="animate-spin" /> : editing ? <Check /> : <Plus />}
              {buttonLabel}
            </Button>
            {editing && (
              <Button
                variant="outline"
                onClick={() => setConfirmRemove(true)}
                disabled={saving}
                className="min-h-12 w-full rounded-xl text-destructive"
              >
                <Trash2 /> {t("Remove routine", "Hapus rutinitas")}
              </Button>
            )}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={confirmRemove} onOpenChange={(open) => !open && setConfirmRemove(false)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("Remove this routine?", "Hapus rutinitas ini?")}</DialogTitle>
            <DialogDescription>
              {t(
                "It stops for every pet from today. Photos already taken are kept.",
                "Rutinitas berhenti untuk semua hewan mulai hari ini. Foto yang sudah diambil tetap disimpan."
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="min-h-12 flex-1" onClick={() => setConfirmRemove(false)} disabled={saving}>
              {t("Keep", "Batal")}
            </Button>
            <Button variant="destructive" className="min-h-12 flex-1" onClick={removeRoutine} disabled={saving}>
              {saving ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t("Remove", "Hapus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, optional, children }: { label: string; optional?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
        {optional && <span className="ml-1 font-normal normal-case">({optional})</span>}
      </h3>
      {children}
    </section>
  );
}

/** Anyone, or one person (D10). Staff still all see the card; it carries the name. */
function StaffChips({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const t = useT();
  const { profiles } = useStaffProfiles();
  const people = profiles ?? [];
  const chip = (id: string | null, name: string) => {
    const on = value === id;
    return (
      <button
        key={id ?? "anyone"}
        type="button"
        aria-pressed={on}
        onClick={() => onChange(id)}
        className={cn(
          "min-h-10 rounded-full border px-3 text-sm font-medium",
          on ? "border-zinc-900 bg-zinc-900 text-white" : "border-border bg-card text-zinc-600"
        )}
      >
        {name}
      </button>
    );
  };
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("Who", "Siapa")}>
      {chip(null, t("Anyone", "Siapa saja"))}
      {people.map((p) => chip(p.id, p.name))}
    </div>
  );
}

/** The staff card as staff will see it (Bahasa Indonesia, as on their phones). */
function StaffPreview({
  icon: Icon,
  time,
  title,
  note,
  pets,
  proof,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  time: string;
  title: string;
  note: string;
  pets: string[];
  proof: RoutineProof;
  label: string;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3" aria-label={label}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-col gap-1.5 rounded-xl border bg-card p-3" lang="id">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-zinc-500" />
          <span className="text-sm font-medium tabular-nums">{time.replace(":", ".")}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
          <span className="flex min-h-8 items-center gap-1 rounded-full bg-zinc-900 px-2.5 text-xs font-medium text-white">
            {proof === "tick" ? <CircleCheck className="size-4" /> : <Camera className="size-4" />}
            {proof === "three" ? "Mulai" : null}
          </span>
        </div>
        {note && <p className="text-[13px] text-zinc-600">{note}</p>}
        <div className="flex flex-wrap gap-1">
          {pets.map((name) => (
            <span key={name} className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
