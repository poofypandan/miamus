"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import { assigneeOptions } from "@/lib/leave";
import { useHouseholdLocations } from "@/hooks/use-household-locations";
import { LocationCombobox } from "@/components/chores/location-combobox";
import { SpotField } from "@/components/chores/spot-field";
import { dayKeyLabel } from "@/lib/date-label";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { staffWillBeNotified } from "@/lib/staff-push";
import {
  REPEAT_CHOICES,
  intervalOf,
  repeatLabel,
  startAfterSkippingFirst,
  recurrenceOf,
} from "@/lib/chore-recurrence";
import { REMIND_CHOICES, remindLabel } from "@/lib/chore-reminders";
import { useBillPayments } from "@/hooks/use-bill-payments";
import { historyFor, paidOn } from "@/lib/bill-payments";
import { formatIdr } from "@/lib/repairs";
import { photoSrc } from "@/lib/photos";
import {
  HOUSEHOLD_TASK_CATEGORIES,
  categoryIcon,
  categoryLabel,
} from "@/lib/household-tasks";
import type {
  ChoreRecurrence,
  HouseholdLocation,
  HouseholdTask,
  HouseholdTaskCategory,
} from "@/types/database";

// Radix rejects an empty SelectItem value, so "nobody in particular" needs a
// real sentinel. It never reaches the database — save() maps it back to the
// null that actually means unassigned.
const UNASSIGNED = "unassigned";

/**
 * Add and edit, in one dialog (Phase 100).
 *
 * Owner-facing, in the language the owner chose (Phase 149) — and
 * owner-only in a stronger sense than that: this is the whole mutation surface
 * for chores, and nothing in the staff view imports it.
 *
 * `task` null is Add; a task is Edit. Deliberately one component rather than
 * two: they share every field, and the pair that existed before this phase had
 * already drifted (the add form could set a time, nothing could change one).
 *
 * Editing a repeat edits the repeat — every occurrence that has not been
 * written yet. Occurrences already completed are rows of their own and keep
 * whatever they recorded, which is the behaviour that makes a rota safe to
 * adjust halfway through a month.
 */
export function ChoreEditorDialog({
  open,
  onOpenChange,
  task,
  defaultDate,
  occurrenceDate = null,
  preset = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null to create. */
  task: HouseholdTask | null;
  /** The day being browsed, used as the due date for a new chore. */
  defaultDate: string;
  /**
   * The day this chore was opened from (Phase 128) — what "skip this day" and
   * "end the repeat here" act on. Null when adding.
   */
  occurrenceDate?: string | null;
  /**
   * What a new chore starts with, when it's added from somewhere that already
   * knows (Phase 158): the Rooms view's "Add chore here" fills in the room,
   * and a missing job's "Add" fills in the room and the job as the title.
   * Ignored when editing.
   */
  preset?: {
    title?: string;
    locationId?: string | null;
    /** Phase 159: "Schedule a visit" fills in a Maintenance chore for a repair. */
    category?: HouseholdTaskCategory;
    spot?: string | null;
    notes?: string | null;
    /** The repair the new chore is a visit for (migrations/130). */
    repairId?: string | null;
    /** Phase 164: "Other bill" starts a monthly bill with a reminder. */
    recurrence?: ChoreRecurrence;
    interval?: number;
    remindDaysBefore?: number | null;
    /**
     * Who it's for: the first-run checklist's "Give them a first task" (audit
     * B1); a bill starts with the owner adding it (Phase 164).
     */
    assigneeId?: string | null;
  } | null;
}) {
  const {
    createHouseholdTask,
    createHouseholdTasks,
    updateHouseholdTask,
    deleteHouseholdTask,
    householdTasks,
    materialiseChoreOccurrence,
    advanceChoreStart,
    skipChoreOccurrence,
    memberProfile,
    leaveRequests,
  } = useHousehold();
  const { profiles } = useStaffProfiles();
  const { locations } = useHouseholdLocations();
  const locale = useOwnerLocale();
  const t = useT();
  const editing = !!task;

  const [title, setTitle] = useState("");
  // One place when editing; when adding, up to 12, one chore each (Phase 158).
  const [places, setPlaces] = useState<HouseholdLocation[]>([]);
  const [spot, setSpot] = useState<string | null>(null);
  const [category, setCategory] = useState<HouseholdTaskCategory>("cleaning");
  const [assignee, setAssignee] = useState<string>(UNASSIGNED);
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [recurrence, setRecurrence] = useState<ChoreRecurrence>("none");
  // Every N weeks or months, and "Remind me" (Phase 164, migrations/137).
  const [repeatEvery, setRepeatEvery] = useState(1);
  const [remind, setRemind] = useState<number | null>(null);
  const [until, setUntil] = useState("");
  const [supervision, setSupervision] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Everyone in the house, admins included (Phase 139; migrations/106 put
  // them on the roster). Yourself first, since assigning your own chores is
  // the common case in a house without staff; anyone on leave on the chore's
  // day last and marked, so a one-off is not handed to someone away
  // (Phase 140).
  const assignees = useMemo(
    () =>
      assigneeOptions(profiles ?? [], {
        selfId: memberProfile?.id,
        leaves: leaveRequests,
        lang: locale,
        date: date || defaultDate,
      }),
    [profiles, memberProfile?.id, leaveRequests, date, defaultDate, locale]
  );

  useBackToClose(open, () => onOpenChange(false));

  // Reloads the form whenever the dialog opens, or opens on a different chore.
  // Keyed on `open` as well as the id so reopening Add after an edit does not
  // inherit the edited chore's fields.
  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    if (task) {
      setTitle(task.title);
      // A room that has since been deleted reads as none, and saves as none.
      const room = locations?.find((place) => place.id === task.location_id);
      setPlaces(room ? [room] : []);
      setSpot(room ? (task.spot?.trim() || null) : null);
      setCategory(task.category);
      setAssignee(task.assigned_to ?? UNASSIGNED);
      setDate(task.due_date);
      setTime(task.due_time ?? "");
      setNotes(task.notes ?? "");
      setRecurrence(recurrenceOf(task));
      setRepeatEvery(intervalOf(task));
      // A repeat's written day reminds through its repeat: that's what the
      // push and Today read (Codex, PR #60).
      setRemind((task.parent_task_id ? reminderSource?.remind_days_before : task.remind_days_before) ?? null);
      setUntil(task.recurrence_until ?? "");
      setSupervision(!!task.requires_supervision);
    } else {
      setTitle(preset?.title ?? "");
      const room = preset?.locationId ? locations?.find((place) => place.id === preset.locationId) : undefined;
      setPlaces(room ? [room] : []);
      setSpot(room ? (preset?.spot?.trim() || null) : null);
      setCategory(preset?.category ?? "cleaning");
      setAssignee(preset?.assigneeId ?? UNASSIGNED);
      setDate(defaultDate);
      setTime("");
      setNotes(preset?.notes ?? "");
      setRecurrence(preset?.recurrence ?? "none");
      setRepeatEvery(preset?.interval ?? 1);
      setRemind(preset?.remindDaysBefore ?? null);
      setUntil("");
      setSupervision(false);
    }
    // `locations` deliberately not a dependency: a background refresh of the
    // room list must not reset a form the owner is halfway through.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, defaultDate]);

  const untilBeforeStart = !!until && until < date;
  // Editing one written day of a repeat: its reminder is the repeat's.
  const dayOfRepeat = !!task?.parent_task_id;
  const reminderSource = dayOfRepeat
    ? (householdTasks.find((row) => row.id === task?.parent_task_id) ?? null)
    : task;
  // A visit for a repair: one place, linked on save (adding only).
  const repairId = !editing ? (preset?.repairId ?? null) : null;
  const placeIds = useMemo(() => places.map((place) => place.id), [places]);

  async function save() {
    if (!title.trim()) {
      toast.error(t("Give the chore a title", "Beri judul tugasnya"));
      return;
    }
    if (untilBeforeStart) {
      toast.error(t("The repeat cannot end before it starts", "Pengulangan tidak bisa berakhir sebelum dimulai"));
      return;
    }
    setSaving(true);
    try {
      // The interval belongs to weekly and monthly repeats only.
      const every = recurrence === "weekly" || recurrence === "monthly" ? repeatEvery : 1;
      const fields = {
        title: title.trim(),
        category,
        // The sentinel and an empty time both collapse to null here — the
        // column's "nobody in particular" and "sometime today".
        assigned_to: assignee === UNASSIGNED ? null : assignee,
        due_date: date,
        due_time: time || null,
        notes: notes.trim() || null,
        recurrence,
        // A one-off has no end date to carry; leaving a stale one behind would
        // quietly cap the repeat if it were ever turned back on.
        recurrence_until: recurrence === "none" ? null : until || null,
        // Sent when set, or to clear one this chore has; otherwise left out,
        // so a database before migrations/137 still takes the chore.
        ...(every !== 1 || intervalOf(task ?? {}) !== 1 ? { recurrence_interval: every } : {}),
        ...(!dayOfRepeat && (remind !== null || (task?.remind_days_before ?? null) !== null)
          ? { remind_days_before: remind }
          : {}),
        requires_supervision: supervision,
        location_id: places[0]?.id ?? null,
        // The spot goes only with a room. Sent when there is one, or to clear
        // one this chore has; otherwise left out, so a database before
        // migrations/129 still takes the chore.
        ...(places.length > 0 && spot
          ? { spot }
          : task?.spot
            ? { spot: null }
            : {}),
      };
      // Whether this save tells a staff phone (Phase 166, migrations/141):
      // a chore for someone, today, that is new or newly theirs, moved onto
      // today or re-timed. The server decides; this only words the toast.
      const forToday = !!fields.assigned_to && fields.due_date === formatDateLocal(new Date());
      const tellsStaff =
        forToday &&
        (!task ||
          task.assigned_to !== fields.assigned_to ||
          task.due_date !== fields.due_date ||
          (task.due_time ?? null) !== fields.due_time);
      const notified = async () => {
        if (!tellsStaff || !fields.assigned_to) return undefined;
        const reached = await staffWillBeNotified([fields.assigned_to]);
        if (!reached.includes(fields.assigned_to)) return undefined;
        const who = (profiles ?? []).find((p) => p.id === fields.assigned_to)?.name;
        return who
          ? { description: t(`${who} will get a notification.`, `${who} akan mendapat notifikasi.`) }
          : undefined;
      };
      if (task) {
        await updateHouseholdTask(task.id, fields);
        // A written day's reminder lives on its repeat.
        if (dayOfRepeat && reminderSource && (reminderSource.remind_days_before ?? null) !== remind) {
          await updateHouseholdTask(reminderSource.id, { remind_days_before: remind });
        }
        toast.success(t(`Saved "${fields.title}"`, `"${fields.title}" disimpan`), await notified());
      } else if (places.length > 1) {
        // One chore per room, saved together or not at all, so staff tick
        // each room off and the Rooms view counts each one.
        await createHouseholdTasks(places.map((place) => ({ ...fields, location_id: place.id })));
        toast.success(
          t(
            `Added "${fields.title}" to ${places.length} rooms`,
            `"${fields.title}" ditambahkan ke ${places.length} ruangan`
          ),
          await notified()
        );
      } else {
        await createHouseholdTask(repairId ? { ...fields, repair_id: repairId } : fields);
        toast.success(t(`Added "${fields.title}"`, `"${fields.title}" ditambahkan`), await notified());
      }
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(
        editing
          ? t("Failed to save the chore", "Tugas gagal disimpan")
          : t("Failed to add the chore", "Tugas gagal ditambahkan")
      );
    } finally {
      setSaving(false);
    }
  }

  // --- Removing (Phase 128) -----------------------------------------------
  //
  // Opening any day of a repeat hands this dialog either the repeat itself (a
  // day nothing is written for) or that day's own row. "Delete chore" used to
  // delete whichever it was given: the repeat, taking every completed day
  // with it through the parent_task_id cascade — the Phase 127 data loss —
  // or one written day, which then simply came back as a fresh pending chore.
  //
  // So removing is now a choice about scope, made against the series:
  //   skip    this day only: its row is written as cancelled, a tombstone that
  //           expandChores hides while the repeat goes on;
  //   end     the repeat stops before this day; every past record stays;
  //   delete  the chore and every record of it, said in exactly those words.
  // A one-off is just deleted, as before.

  /** The repeat this chore belongs to — itself, or its parent. */
  const series = task?.parent_task_id
    ? (householdTasks.find((t) => t.id === task.parent_task_id) ?? null)
    : task;
  const isSeries = !!series && recurrenceOf(series) !== "none";
  const day = isSeries ? occurrenceDate : null;
  /** This day's own row, when one is written. */
  const dayRow = task?.parent_task_id ? task : null;
  const isFirstDay = !!series && day === series.due_date;
  // A day with its own row is governed by that row, even the series' first
  // day (expandChores): the template's status then says nothing about it.
  const dayDone = dayRow
    ? dayRow.status === "completed"
    : isFirstDay && series?.status === "completed";
  // Every unfinished day of a repeat can be dropped, the first one included.
  // It used to be excluded because the first day IS the template row, so
  // there is nothing to write a cancelled tombstone against — which left the
  // owner opening day one of a repeat and being offered nothing but "delete
  // everything". skipDay handles that case by moving the series start
  // forward instead; see there.
  const canSkip = isSeries && !!day && !dayDone;
  const canEnd = isSeries && !!day && !!series && day > series.due_date;
  const dayName = day ? dayKeyLabel(day, new Date(), locale) : "";

  async function run(action: () => Promise<void>, failure: string) {
    setSaving(true);
    try {
      await action();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(failure);
    } finally {
      setSaving(false);
    }
  }

  function skipDay() {
    if (!series || !day) return;
    return run(async () => {
      // The first day is the template row itself. Cancelling it would cancel
      // the whole series, and a tombstone cannot stand in for a row that is
      // the definition — so the start moves to the next day the pattern
      // lands on instead. That drops day one and leaves every later day
      // exactly where it was: advancing by one period keeps the anchor
      // occursOn reads (weekday for weekly, day-of-month for monthly).
      //
      // Unless the first day already has its own row — an earlier skip can
      // move the start onto a day someone had claimed. That row governs the
      // day, so it is cancelled like any other day's below; moving the start
      // again would leave it pending and carried over (Codex review, PR #1).
      if (isFirstDay && !dayRow) {
        // Not simply the next occurrence: for a chore on the 31st that can be
        // 28 February, which would move every later month to the 28th.
        // Shorter months before the new start keep their own rows.
        const { start: next, clampedDays } = startAfterSkippingFirst(series);
        if (!next) {
          toast.error(
            t(
              `${dayName} is the only day left on this chore — use Delete everything instead`,
              `${dayName} adalah satu-satunya hari yang tersisa untuk tugas ini — pakai Hapus semuanya`
            )
          );
          return;
        }
        for (const clamped of clampedDays) await materialiseChoreOccurrence(series.id, clamped);
        // Only if the first day is still unfinished: another phone may have
        // finished it since this editor opened, and moving it then would
        // carry that finished record onto the next day.
        if (!(await advanceChoreStart(series.id, day, next))) {
          toast.error(
            t(
              "That day was already completed, so it was left as it is",
              "Hari itu sudah selesai, jadi dibiarkan apa adanya"
            )
          );
          return;
        }
        toast.success(
          t(`Skipped "${series.title}" for ${dayName}`, `"${series.title}" dilewati untuk ${dayName}`)
        );
        return;
      }
      // A day nothing is written for gets its row first; another phone may
      // have written it meanwhile, and a finished day is never cancelled.
      // Cancelled only while still pending: this editor's copy of the row can
      // be older than a completion saved on a staff phone (Codex review,
      // PR #1), and cancelling that would wipe its author and photos.
      const row = dayRow ?? (await materialiseChoreOccurrence(series.id, day));
      if (row.status === "completed" || !(await skipChoreOccurrence(row.id))) {
        toast.error(
          t(
            "That day was already completed, so it was left as it is",
            "Hari itu sudah selesai, jadi dibiarkan apa adanya"
          )
        );
        return;
      }
      toast.success(t(`Skipped "${series.title}" for ${dayName}`, `"${series.title}" dilewati untuk ${dayName}`));
    }, t("Failed to skip that day", "Gagal melewati hari itu"));
  }

  function endRepeat() {
    if (!series || !day) return;
    const lastDay = new Date(`${day}T00:00:00`);
    lastDay.setDate(lastDay.getDate() - 1);
    return run(async () => {
      await updateHouseholdTask(series.id, { recurrence_until: formatDateLocal(lastDay) });
      toast.success(
        t(
          `"${series.title}" no longer repeats from ${dayName}`,
          `"${series.title}" tidak lagi berulang mulai ${dayName}`
        )
      );
    }, t("Failed to end the repeat", "Gagal menghentikan pengulangan"));
  }

  function deleteAll() {
    const target = series ?? task;
    if (!target) return;
    return run(async () => {
      await deleteHouseholdTask(target.id);
      toast.success(t(`Deleted "${target.title}"`, `"${target.title}" dihapus`));
    }, t("Failed to delete the chore", "Tugas gagal dihapus"));
  }

  const repeats = recurrence !== "none";
  // A bill's payments (Phase 164 PR B), owners only: the history below, and
  // what deleting the bill would take with it.
  const editingBill = editing && (series ?? task)?.category === "bill";
  const { payments: billPayments } = useBillPayments(open && editingBill);
  const billHistory = editingBill && (series ?? task) ? historyFor(billPayments, (series ?? task)!.id) : [];
  // The form's repeats, plus this chore's own if it's one the form doesn't
  // offer (an interval set some other way), so opening it never changes it.
  const sameRepeat = (choice: { recurrence: ChoreRecurrence; interval: number }) =>
    choice.recurrence === recurrence &&
    (choice.recurrence === "weekly" || choice.recurrence === "monthly" ? choice.interval === repeatEvery : true);
  const repeatOptions: { key: string; recurrence: ChoreRecurrence; interval: number }[] = REPEAT_CHOICES.some(sameRepeat)
    ? [...REPEAT_CHOICES]
    : [...REPEAT_CHOICES, { key: "current", recurrence, interval: repeatEvery }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? t("Edit Chore", "Ubah Tugas") : t("Add Chore", "Tambah Tugas")}</DialogTitle>
          {editing && repeats && (
            <DialogDescription>
              {t(
                "This chore repeats. Changes apply to every occurrence that has not been done yet.",
                "Tugas ini berulang. Perubahan berlaku untuk setiap jadwal yang belum dikerjakan."
              )}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("Title", "Judul")}</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("e.g. Mop the terrace", "mis. Pel teras")}
            />
          </div>

          {/* Right under the title, which it used to be typed into (Phase 135). */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("Room (optional)", "Ruangan (opsional)")}</Label>
            <LocationCombobox
              values={places}
              onChange={(next) => {
                setPlaces(next);
                if (next.length === 0) setSpot(null);
              }}
              multiple={!editing && !repairId}
            />
          </div>

          {places.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("Spot (optional)", "Bagian (opsional)")}</Label>
              <SpotField value={spot} onChange={setSpot} placeIds={placeIds} />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("Category", "Kategori")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {HOUSEHOLD_TASK_CATEGORIES.map((c) => {
                const Icon = categoryIcon(c);
                return (
                  <Button
                    key={c}
                    type="button"
                    variant={category === c ? "default" : "outline"}
                    className="min-h-[44px]"
                    onClick={() => setCategory(c)}
                  >
                    <Icon /> {categoryLabel(c, locale)}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("Assignee", "Ditugaskan ke")}</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger className="min-h-[48px] w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* First, and the default: a chore nobody is named on gets
                    picked up by whoever is free, which is how most of these
                    actually get done. */}
                <SelectItem value={UNASSIGNED}>{t("Unassigned", "Belum ditugaskan")}</SelectItem>
                {assignees.map(({ profile, label }) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">{repeats ? t("Starts", "Mulai") : t("Date", "Tanggal")}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label className="text-xs">{t("Time (optional)", "Jam (opsional)")}</Label>
              {/* A real time control, and clearable: setting a chore back to
                  "sometime today" was impossible before this phase, because
                  the only way to change a time was to delete the chore. */}
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="min-w-0 flex-1"
                />
                {time && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-[44px] shrink-0 px-2 text-xs"
                    onClick={() => setTime("")}
                  >
                    {t("Clear", "Hapus")}
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">
            {t(
              "No time means “sometime today”, and sorts below timed chores.",
              "Tanpa jam berarti “kapan saja hari ini”, dan muncul di bawah tugas berjam."
            )}
          </p>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("Repeat", "Ulangi")}</Label>
            <div className="grid grid-cols-2 gap-2">
              {repeatOptions.map((choice) => (
                <Button
                  key={choice.key}
                  type="button"
                  variant={sameRepeat(choice) ? "default" : "outline"}
                  className="min-h-[44px]"
                  onClick={() => {
                    setRecurrence(choice.recurrence);
                    setRepeatEvery(choice.interval);
                  }}
                >
                  {repeatLabel(choice.recurrence, choice.interval, locale)}
                </Button>
              ))}
            </div>
          </div>

          {repeats && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t("Repeat until (optional)", "Ulangi sampai (opsional)")}</Label>
              <Input
                type="date"
                value={until}
                min={date}
                onChange={(e) => setUntil(e.target.value)}
              />
              {untilBeforeStart ? (
                <p className="text-[11px] font-medium text-destructive">
                  {t("The repeat cannot end before it starts.", "Pengulangan tidak bisa berakhir sebelum dimulai.")}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {t(
                    "Leave empty to keep repeating. Nothing is written in advance — occurrences appear on the agenda as their day comes round.",
                    "Kosongkan agar terus berulang. Tidak ada yang dibuat di muka — jadwal muncul di agenda saat harinya tiba."
                  )}
                </p>
              )}
            </div>
          )}

          {/* Remind me (Phase 164, D3): any chore, off by default. */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              {t("Remind me", "Ingatkan saya")}
              {dayOfRepeat && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  {t("(for the whole repeat)", "(untuk seluruh pengulangan)")}
                </span>
              )}
            </Label>
            <div className="flex flex-wrap gap-2">
              {REMIND_CHOICES.map((days) => (
                <Button
                  key={days ?? "off"}
                  type="button"
                  size="sm"
                  variant={remind === days ? "default" : "outline"}
                  className="min-h-[40px]"
                  aria-pressed={remind === days}
                  onClick={() => setRemind(days)}
                >
                  {remindLabel(days, locale)}
                </Button>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {remind === null
                ? t(
                    "No reminder. Turn one on for bills and visits someone has to be home for.",
                    "Tanpa pengingat. Nyalakan untuk tagihan dan kunjungan yang perlu ditunggu di rumah."
                  )
                : t(
                    "A notification at 7:00 AM that day, and again on the day itself if it isn't done. It also shows on Today.",
                    "Notifikasi pukul 07.00 pada hari itu, dan lagi saat jatuh tempo kalau belum selesai. Juga tampil di Hari ini."
                  )}
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <input
              type="checkbox"
              checked={supervision}
              onChange={(e) => setSupervision(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-amber-700"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-amber-900">
                {t("Wait for an owner", "Tunggu pemilik rumah")}
              </span>
              <span className="text-[11px] text-amber-900/80">
                {t(
                  "Whoever does this chore waits for one of you to be there, rather than starting on their own.",
                  "Yang mengerjakan tugas ini menunggu salah satu pemilik rumah ada, bukan mulai sendiri."
                )}
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t("Notes (optional)", "Catatan (opsional)")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t("e.g. the brush is in the back store room", "mis. sikatnya di gudang belakang")}
            />
          </div>

          {editingBill && billHistory.length > 0 && (
            <section aria-label={t("Payments", "Riwayat bayar")} className="flex flex-col gap-1.5">
              <h4 className="flex items-center gap-1.5 text-xs font-medium">
                {t("Payments", "Riwayat bayar")}
                <Lock className="size-3 text-muted-foreground" aria-label={t("Owners only", "Hanya pemilik")} />
              </h4>
              <ul className="overflow-hidden rounded-xl border">
                {billHistory.map((p) => (
                  <li key={p.id} className="flex min-h-12 items-center gap-3 border-t px-3 py-2 text-sm first:border-t-0">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">
                        {p.amount_idr != null ? formatIdr(p.amount_idr) : t("No amount", "Tanpa jumlah")}
                      </span>
                      <span className="text-xs text-muted-foreground">{paidOn(p, locale)}</span>
                    </span>
                    {p.receipt_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoSrc(p.receipt_url, 160)}
                        alt={t("Receipt", "Bukti bayar")}
                        className="size-10 shrink-0 rounded-md bg-muted object-cover"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {editing && (
            <div className="flex flex-col gap-2 border-t pt-4">
              {confirmDelete ? (
                isSeries ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">
                      {t("This chore repeats. Remove what?", "Tugas ini berulang. Hapus yang mana?")}
                    </p>
                    {canSkip && (
                      <RemoveOption
                        label={t(`Skip ${dayName} only`, `Lewati ${dayName} saja`)}
                        detail={t(
                          "Just this day is removed. The repeat carries on as before.",
                          "Hanya hari ini yang dihapus. Pengulangan berjalan seperti biasa."
                        )}
                        disabled={saving}
                        onClick={skipDay}
                      />
                    )}
                    {canEnd && (
                      <RemoveOption
                        label={t(`Stop repeating from ${dayName}`, `Berhenti berulang mulai ${dayName}`)}
                        detail={t(
                          "Nothing new from this day on. Every past day and its photos are kept.",
                          "Tidak ada jadwal baru mulai hari ini. Semua hari sebelumnya dan fotonya tetap disimpan."
                        )}
                        disabled={saving}
                        onClick={endRepeat}
                      />
                    )}
                    {/* A finished day cannot be skipped — its photo and its
                        author are the record — so on a completed first day
                        both narrower options are gone. Say why, rather than
                        leaving the red box looking like the only thing this
                        chore supports. */}
                    {!canSkip && !canEnd && (
                      <p className="text-xs text-muted-foreground">
                        {dayDone
                          ? t(
                              `${dayName} is already done, so it can't be skipped without losing that record.`,
                              `${dayName} sudah selesai, jadi tidak bisa dilewati tanpa menghapus catatannya.`
                            )
                          : t(
                              "There's no single day to drop here.",
                              "Tidak ada satu hari pun yang bisa dilewati di sini."
                            )}
                      </p>
                    )}
                    <div className="flex flex-col gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3">
                      <p className="text-xs text-red-900">
                        {t(
                          "This will delete this chore and all its past completed records.",
                          "Ini akan menghapus tugas ini beserta semua catatan penyelesaiannya."
                        )}
                      </p>
                      {editingBill && (
                        <p className="text-xs font-medium text-red-900">
                          {t(
                            "Deleting this bill also deletes its payment history. Stop repeating keeps it.",
                            "Menghapus tagihan ini juga menghapus riwayat bayarnya. Hentikan pengulangan untuk menyimpannya."
                          )}
                        </p>
                      )}
                      <Button
                        variant="destructive"
                        className="min-h-[44px]"
                        disabled={saving}
                        onClick={deleteAll}
                      >
                        {saving ? <Loader2 className="animate-spin" /> : <Trash2 />}{" "}
                        {t("Delete everything", "Hapus semuanya")}
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      className="min-h-[44px]"
                      disabled={saving}
                      onClick={() => setConfirmDelete(false)}
                    >
                      {t("Cancel", "Batal")}
                    </Button>
                  </div>
                ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {t("This cannot be undone.", "Ini tidak bisa dibatalkan.")}
                    {editingBill &&
                      ` ${t("Its payment, if any, is deleted too.", "Pembayarannya, kalau ada, ikut terhapus.")}`}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="min-h-[44px] flex-1"
                      disabled={saving}
                      onClick={() => setConfirmDelete(false)}
                    >
                      {t("Cancel", "Batal")}
                    </Button>
                    <Button
                      variant="destructive"
                      className="min-h-[44px] flex-1"
                      disabled={saving}
                      onClick={deleteAll}
                    >
                      {saving ? <Loader2 className="animate-spin" /> : <Trash2 />} {t("Delete", "Hapus")}
                    </Button>
                  </div>
                </>
                )
              ) : (
                <Button
                  variant="ghost"
                  className="min-h-[44px] text-destructive hover:text-destructive"
                  disabled={saving}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 /> {isSeries ? t("Remove…", "Hapus…") : t("Delete chore", "Hapus tugas")}
                </Button>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={saving} className="min-h-[48px]">
            {saving ? <Loader2 className="animate-spin" /> : editing ? <Save /> : <Plus />}
            {editing ? t("Save Changes", "Simpan Perubahan") : t("Add Chore", "Tambah Tugas")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** One way of removing part of a repeat: what it does, then the button. */
function RemoveOption({
  label,
  detail,
  disabled,
  onClick,
}: {
  label: string;
  detail: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="outline"
      className="h-auto min-h-[52px] flex-col items-start gap-0.5 px-3 py-2 text-left whitespace-normal"
      disabled={disabled}
      onClick={onClick}
    >
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs font-normal text-muted-foreground">{detail}</span>
    </Button>
  );
}
