"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Home,
  Loader2,
  Stethoscope,
  Trash2,
  CircleSlash,
  UserRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TapHint } from "@/components/staff/tap-hint";
import { DONE_TONE } from "@/lib/agenda-tones";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useTapGuard } from "@/hooks/use-tap-guard";
import { compressPhoto } from "@/lib/image";
import { isAdmitted } from "@/lib/pets";
import { categoryCardTint, categoryIconColor, routineIcon } from "@/lib/schedule-categories";
import { useFormatTime } from "@/components/ui/ui-labels";
import { UNDO_WINDOW_MS } from "@/lib/undo-window";
import {
  cardWalkState,
  isFreshCapture,
  stepSubType,
  stepTime,
  walkMinutes,
  type ThreePhotoStep,
} from "@/lib/staff-agenda";
import { vetVisitState } from "@/lib/staff-agenda";
import { SaveStillWaitingError } from "@/lib/offline-queue";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import type { AgendaGroup, AgendaItem } from "@/lib/scheduleEngine";
import type { LogSubType, TaskLog } from "@/types/database";
import { cn } from "@/lib/utils";
import { SyncedImg } from "@/components/shared/synced-img";
import { discardPhoto, enqueuePhoto } from "@/lib/photo-queue";
import { usePrefetchHighRes } from "@/hooks/use-prefetch-high-res";
import { CouldntDoSheet } from "@/components/staff/couldnt-do-sheet";
import { CouldntDoNote } from "@/components/staff/couldnt-do-note";
import { useTaskExceptions } from "@/hooks/use-task-exceptions";
import { canFileFor, groupExceptions, staffCouldntLine } from "@/lib/couldnt-do";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { useToday } from "@/hooks/use-today";

interface PendingCapture {
  photoUrl: string;
  items: AgendaItem[];
  selected: Set<string>; // entityId
}

// NOTE: the window is measured from completed_at, not created_at — task_logs
// has no created_at column (see supabase/schema.sql), so reading one would
// yield NaN and quietly disable deletion everywhere. For a photo taken in the
// app the two are the same moment anyway; for a log replayed from the Phase 29
// offline queue, completed_at is when the task actually happened, which is the
// timestamp staff would expect this window to run from.
function deletableUntil(completedAt: string): number {
  return new Date(completedAt).getTime() + UNDO_WINDOW_MS;
}

export function AgendaGroupCard({ group }: { group: AgendaGroup }) {
  const formatTime = useFormatTime();
  const { logTasksBatch, pets, deleteLogWithPhoto, logs, updateEntity, pendingIds, selectedDate } =
    useHousehold();
  // "Tidak bisa dikerjakan" (Phase 165): this block's day, its records, and the sheet.
  const date = formatDateLocal(selectedDate);
  const todayKey = formatDateLocal(useToday());
  const { exceptions } = useTaskExceptions();
  const [couldntOpen, setCouldntOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // The photo a pressed Simpan handed to the save queue (see dropCapture).
  const submittedPhoto = useRef<string | null>(null);
  const [capture, setCapture] = useState<PendingCapture | null>(null);
  // The position in the strip, not the tile itself — the tile is re-derived
  // from photoGroups below, so a delete (or any refresh) flows straight through
  // instead of leaving a stale copy on screen. It follows the gallery as staff
  // swipe, which is what keeps the delete window tied to the photo on screen.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // The card is a compact row on the list (Phase 130); everything it does —
  // photos, tagging, the vet flow, the 5-minute undo — happens in this sheet.
  const [sheetOpen, setSheetOpen] = useState(false);
  // "Batalkan jalan-jalan" (Phase 173, D14): asks first, then removes the walk's photos.
  const [confirmCancelWalk, setConfirmCancelWalk] = useState(false);
  // Only how an *open* visit is being closed — "Bawa Pulang" or "Rawat Inap".
  // Which half of the visit a photo records is derived from the card's own
  // state below, never from a click handler: the camera can be opened from a
  // label, from the finish dialog, or by the browser restoring a file input,
  // and a mode set on the way in is a mode that can be wrong on the way out.
  const [finishChoice, setFinishChoice] = useState<LogSubType>("check_out");
  const [finishOpen, setFinishOpen] = useState(false);
  // The capture input lives inside a <label> for ordinary tasks; finishing a
  // vet visit has to ask what happened first, so that path opens the camera
  // from code instead.
  const fileRef = useRef<HTMLInputElement>(null);
  // One guard per card is enough — only one finger is ever mid-gesture, and
  // touchstart re-arms it for whichever tile that gesture began on.
  const tap = useTapGuard();

  // Every overlay in this card claims its own history entry, so Back unwinds
  // one layer at a time instead of collapsing the lot. The lightbox still
  // clears the confirmation as a backstop for the non-Back close paths.
  useBackToClose(sheetOpen, () => setSheetOpen(false));
  useBackToClose(!!capture, () => dropCapture());
  useBackToClose(confirmDelete, () => setConfirmDelete(false));
  useBackToClose(confirmCancelWalk, () => setConfirmCancelWalk(false));
  // No useBackToClose for the lightbox: PhotoLightbox claims its own history
  // entry, and a second one here would need two Back presses to leave a photo.

  // One entry per dog, not per task. A consolidated medicine group holds
  // several tasks for the same dog, and both the chips and the tagging dialog
  // are about dogs — left as-is they rendered "Mocha Mocha" and handed React
  // duplicate keys. A dog counts as done only when all of its tasks in the
  // group are.
  const dogsIn = (items: AgendaItem[]) => {
    const byEntity = new Map<string, { entityId: string; entityName: string; items: AgendaItem[] }>();
    for (const item of items) {
      const entry = byEntity.get(item.entityId);
      if (entry) entry.items.push(item);
      else byEntity.set(item.entityId, { entityId: item.entityId, entityName: item.entityName, items: [item] });
    }
    return [...byEntity.values()];
  };

  const isVet = group.category === "vet";
  // Several medicines at the same time for the same dog, rolled into one block
  // by buildAgenda. The card then names the errand rather than one of its
  // items, and lists what the errand actually consists of.
  const consolidated = group.category === "medication" && group.titles.length > 1;
  const cardTitle = consolidated ? "Obat & Vitamin" : group.title;

  // A dog staying at the clinic is somebody else's responsibility until it is
  // collected, so its meals and potty breaks are suspended rather than left
  // sitting there overdue. Per dog, not per card: one admitted dog must not
  // suspend the potty round for the three that are home. Vet tasks are exempt —
  // the admission itself is a vet task, and greying it out would hide the
  // record of what happened.
  const suspendedIds = useMemo(() => {
    if (isVet) return new Set<string>();
    return new Set(pets.filter(isAdmitted).map((p) => p.id));
  }, [isVet, pets]);
  const isSuspended = (item: AgendaItem) => suspendedIds.has(item.entityId);
  const activeItems = group.items.filter((i) => !isSuspended(i));
  // Every dog on this card is at the clinic: nothing here is actionable.
  const wholeCardSuspended = activeItems.length === 0 && group.items.length > 0;

  const pendingItems = activeItems.filter((i) => i.status !== "completed");
  const allDone = pendingItems.length === 0;
  const anyOverdue = pendingItems.some((i) => i.status === "overdue");

  const petById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets]);

  // One card can hold several photos: a batch logs every tagged dog against a
  // single upload, but a staff member who photographs the dogs separately
  // produces one log (and one URL) each. Collapsing by photo_url rebuilds
  // "who was in this shot" — the batch's rows merge back into one tile, while
  // separate shots stay separate. Logs with no photo (offline-queued, ad-hoc)
  // are skipped; they have nothing to show.
  const photoGroups = useMemo(() => {
    const byUrl = new Map<
      string,
      {
        url: string;
        entityIds: string[];
        names: string[];
        titles: string[];
        at: string;
        logs: TaskLog[];
      }
    >();
    for (const item of group.items) {
      const url = item.log?.photo_url;
      if (!url || !item.log) continue;
      const existing = byUrl.get(url);
      if (existing) {
        if (!existing.entityIds.includes(item.entityId)) {
          existing.entityIds.push(item.entityId);
          existing.names.push(item.entityName);
        }
        if (!existing.titles.includes(item.title)) existing.titles.push(item.title);
        // Every row behind this photo is kept — including a second medicine
        // for a dog already listed (Phase 118: this used to sit inside the
        // new-dog check, so one photo of three medicines carried one log, and
        // removing it left the other two marked done with nothing to show).
        existing.logs.push(item.log);
      } else {
        byUrl.set(url, {
          url,
          entityIds: [item.entityId],
          names: [item.entityName],
          titles: [item.title],
          at: item.log.completed_at,
          logs: [item.log],
        });
      }
    }
    return [...byUrl.values()].sort((a, b) => a.at.localeCompare(b.at));
  }, [group.items]);

  // Check-in, then check-out or admission — see vetVisitState (lib).
  const visit = useMemo(
    () =>
      isVet
        ? vetVisitState(group.items, logs)
        : { checkedIn: false, closed: false, admitted: false },
    [isVet, group.items, logs]
  );
  // Open visit: checked in, not yet resolved. The row keeps asking for a tap
  // through this, or a dog would read as "done" while still at the clinic.
  const visitOpen = isVet && visit.checkedIn && !visit.closed;

  // --- Routines from the Add routine sheet (Phase 173) ----------------------
  // One photo, or one tap for a Tick routine, settles every open pet on the
  // card (D4): the card's own round button opens the camera straight away,
  // with no pet-picking step. A photo of the switched-off lamp proves the
  // routine, not which dog was in frame. Meals, potty, medicines, vet and
  // grooming keep the photo-then-pick flow below.
  const isRoutine = group.category === "routine";
  const three = isRoutine && group.proof === "three";
  const tick = isRoutine && group.proof === "tick";
  // Where a three-photo routine stands, from the day's logs (queued saves
  // included), so closing the app at the park loses nothing.
  const walk = useMemo(
    () => (three ? cardWalkState(group.items, logs, date) : null),
    [three, group.items, logs, date]
  );
  const walkStarted = !!walk?.start && !walk.end;
  // A finished walk can still be taken back for 5 minutes from its end photo
  // (UNDO_WINDOW_MS), from the card's sheet as well as the toast (Codex, PR #85).
  const walkUndoable = !!walk?.end && now < deletableUntil(walk.end.completed_at);

  // Clamped, so deleting the last photo in the strip lands on the new last one
  // rather than reading past the end.
  const lightbox =
    lightboxIndex === null ? null : (photoGroups[Math.min(lightboxIndex, photoGroups.length - 1)] ?? null);

  // Ticks only while the lightbox is open, so a photo that ages out of its
  // window while staff are looking at it loses the button there and then.
  // Also while a finished walk's sheet is open: its Batalkan jalan-jalan
  // leaves when the 5 minutes run out.
  // And while a Tick routine's sheet is open: its Batalkan centang likewise.
  const walkEndAt = walk?.end?.completed_at ?? null;
  useEffect(() => {
    if (!sheetOpen || (!walkEndAt && !tick)) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [sheetOpen, walkEndAt, tick]);

  useEffect(() => {
    if (lightboxIndex === null) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [lightboxIndex]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    // allDone blocks a stray capture on a finished group — except while a vet
    // visit is open, where the group counts as done from the check-in onward
    // and the closing photo is the whole point.
    if (!file || busy || (allDone && !visitOpen)) return;
    setBusy(true);
    try {
      const compressed = await compressPhoto(file);
      // Kept on the phone and uploaded in the background (Phase 161): the log
      // it ends up on waits for it in the save queue, so a weak signal never
      // costs the photo or the log.
      const url = await enqueuePhoto(compressed, `pet/batch-${group.time.replace(":", "")}`);
      // Upload first, confirm who's in frame second — the photo is what
      // needs the camera round-trip, tagging is a quick local decision.
      // Starts empty on purpose: pre-ticking every pending dog meant a
      // distracted tap on Simpan silently marked dogs done that were never in
      // the frame. Staff now have to say who they actually photographed.
      setCapture({
        photoUrl: url,
        // Closing a vet visit offers the dogs that went in, not the pending
        // ones: the check-in already marked them done, so pendingItems is
        // empty by then and the dialog would have nobody to tick.
        items: visitOpen ? group.items : pendingItems,
        selected: new Set(),
      });
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengunggah foto");
    } finally {
      setBusy(false);
    }
  }

  // The card's round button (Phase 173, D4/D14): one photo (or none, for a
  // Tick routine) saved for every open pet in one batch, through the save
  // queue like every log. A walk's three steps are the same button.
  async function quickSave(file: File | null, targetsOverride?: AgendaItem[]) {
    const targets = targetsOverride ?? quickTargets;
    if (busy || !targets.length) return;
    const step: ThreePhotoStep | null = three ? (walk?.next ?? null) : null;
    if (three && !step) return;
    // Live camera only for a three-photo routine (D14 rule 2): a file more
    // than 2 minutes from the phone's clock came from the gallery.
    if (three && file && !isFreshCapture(file.lastModified)) {
      toast.error("Ambil foto langsung dari kamera.");
      return;
    }
    if (!tick && !file) return;
    setBusy(true);
    let photoUrl: string | null = null;
    try {
      if (file) {
        const compressed = await compressPhoto(file);
        photoUrl = await enqueuePhoto(compressed, `pet/batch-${group.time.replace(":", "")}`);
      }
      const saved = await logTasksBatch({
        entries: targets.map((item) => ({ schedule_id: item.scheduleId, entity_id: item.entityId })),
        module: group.module,
        photo_url: photoUrl,
        sub_type: step ? stepSubType(step) : "complete",
      });
      photoUrl = null; // the save holds it now
      const names = [...new Set(targets.map((i) => i.entityName))].join(", ");
      const message =
        step === "start"
          ? `${names} · ${cardTitle} dimulai`
          : step === "arrived"
            ? `${names} · sudah sampai`
            : `${names} · ${cardTitle} selesai`;
      // Mid-walk steps need no undo: the walk is cancelled from its sheet.
      if (step === "start" || step === "arrived") toast.success(message);
      else
        toast.success(message, {
          duration: 10_000,
          action: { label: "Batalkan", onClick: () => void undoLogs(step === "end" ? walkLogsWith(saved) : saved) },
        });
    } catch (err) {
      console.error(err);
      if (photoUrl) void discardPhoto(photoUrl);
      toast.error("Gagal menyimpan catatan");
    } finally {
      setBusy(false);
    }
  }

  // Undo a quick save within its 5 minutes (UNDO_WINDOW_MS), or a whole walk
  // after its end photo: the logs go, and each photo once.
  async function undoLogs(toRemove: TaskLog[]) {
    const fresh = toRemove.filter((log) => Date.now() < deletableUntil(log.completed_at) || three);
    if (fresh.length === 0) {
      toast.error("Batas waktu 5 menit sudah lewat");
      return;
    }
    try {
      await removeLogs(fresh);
      toast.success("Dibatalkan");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof SaveStillWaitingError
          ? "Foto ini belum terkirim. Tunggu sampai terkirim, lalu hapus."
          : "Gagal membatalkan"
      );
    }
  }

  async function removeLogs(toRemove: TaskLog[]) {
    // Nothing still waiting in the queue is removed: it would come back.
    if (toRemove.some((log) => pendingIds.has(log.id))) throw new SaveStillWaitingError();
    const lastByUrl = new Map<string, string>();
    for (const log of toRemove) if (log.photo_url) lastByUrl.set(log.photo_url, log.id);
    for (const log of toRemove) {
      const isLast = !!log.photo_url && lastByUrl.get(log.photo_url) === log.id;
      await deleteLogWithPhoto(isLast ? log : { ...log, photo_url: null });
    }
  }

  // The whole walk behind an end photo: its start and arrived logs too.
  function walkLogsWith(saved: TaskLog[]): TaskLog[] {
    const ids = new Set(saved.map((l) => l.id));
    return [...(walk?.logs ?? []).filter((l) => !ids.has(l.id)), ...saved];
  }

  async function cancelWalk() {
    if (!walk) return;
    // Re-checked at the tap: a finished walk is final after 5 minutes.
    if (walk.end && Date.now() >= deletableUntil(walk.end.completed_at)) {
      toast.error("Batas waktu 5 menit sudah lewat");
      setConfirmCancelWalk(false);
      setNow(Date.now());
      return;
    }
    setBusy(true);
    try {
      await removeLogs(walk.logs);
      toast.success(`${cardTitle} dibatalkan`);
      setConfirmCancelWalk(false);
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof SaveStillWaitingError
          ? "Foto ini belum terkirim. Tunggu sampai terkirim, lalu batalkan."
          : "Gagal membatalkan"
      );
    } finally {
      setBusy(false);
    }
  }

  function handleQuickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (file) void quickSave(file);
  }

  function toggleDog(entityId: string) {
    setCapture((prev) => {
      if (!prev) return prev;
      const next = new Set(prev.selected);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return { ...prev, selected: next };
    });
  }

  async function handleConfirm() {
    if (!capture || capture.selected.size === 0) {
      toast.error("Pilih minimal satu hewan");
      return;
    }
    setConfirming(true);
    submittedPhoto.current = capture.photoUrl;
    let logSubmitted = false;
    try {
      const chosen = capture.items.filter((i) => capture.selected.has(i.entityId));
      // Derived at the moment of saving: a first vet photo is the check-in, a
      // second closes the visit the way the dialog was answered, and anything
      // that is not a vet task is simply complete.
      const subType: LogSubType = isVet ? (visitOpen ? finishChoice : "check_in") : "complete";
      await logTasksBatch({
        entries: chosen.map((item) => ({
          schedule_id: item.scheduleId,
          entity_id: item.entityId,
        })),
        module: group.module,
        photo_url: capture.photoUrl,
        sub_type: subType,
      });
      // Saved, or queued holding the photo: from here on a failure (the
      // admission below) must not release it (Codex, PR #41).
      logSubmitted = true;
      // The admission is what suspends the dog's meals and potty breaks, so it
      // is written after the log rather than before: a failed photo must not
      // leave a dog marked as living at the clinic.
      if (subType === "admitted") {
        for (const item of chosen) {
          await updateEntity(item.entityId, { status: "admitted" });
        }
      }
      // Deduped: a consolidated medicine group holds several tasks per dog, and
      // "Mocha, Mocha selesai" reads like a bug.
      const names = [...new Set(chosen.map((i) => i.entityName))].join(", ");
      toast.success(
        subType === "check_in"
          ? `${names} · sudah di klinik`
          : subType === "admitted"
            ? `${names} · rawat inap — jadwal harian dihentikan sementara`
            : subType === "check_out"
              ? `${names} · sudah pulang`
              : `${names} · ${cardTitle} selesai`
      );
      setFinishChoice("check_out");
      // Back to the list once nothing is left on this card: every dog done,
      // or a vet step recorded (the visit's next step is hours away). With
      // dogs still to photograph — one shot per dog is common — the sheet
      // stays, ready for the next.
      const remaining = pendingItems.filter((i) => !capture.selected.has(i.entityId));
      if (isVet || remaining.length === 0) setSheetOpen(false);
      setCapture(null);
    } catch (err) {
      console.error(err);
      // Refused, so no save holds it: closing the dialog may discard it again.
      if (!logSubmitted) submittedPhoto.current = null;
      toast.error("Gagal menyimpan catatan");
    } finally {
      setConfirming(false);
    }
  }

  // Closed without saving: the photo on the phone is for nothing now.
  // Once Simpan is pressed the photo belongs to the save in the queue, even
  // if the dialog is dismissed while it is still uploading (Codex, PR #41).
  function dropCapture() {
    if (capture && submittedPhoto.current !== capture.photoUrl) void discardPhoto(capture.photoUrl);
    setCapture(null);
  }

  async function handleDeletePhoto() {
    if (!lightbox) return;
    // Not on the server yet (Phase 161): there is nothing there to delete,
    // and the queued save would put it back.
    if (lightbox.logs.some((log) => pendingIds.has(log.id))) {
      toast.error("Foto ini belum terkirim. Tunggu sampai terkirim, lalu hapus.");
      setConfirmDelete(false);
      return;
    }
    // Re-checked at the moment of the tap, not just at render: a phone left
    // open on this screen must not be able to delete past the window.
    if (Date.now() >= deletableUntil(lightbox.at)) {
      toast.error("Batas waktu 5 menit sudah lewat");
      setConfirmDelete(false);
      setNow(Date.now());
      return;
    }
    setDeleting(true);
    try {
      // deleteLogWithPhoto drops the row and then best-effort removes the
      // storage object. Only the last call carries photo_url so a batch shared
      // by four dogs deletes the file once instead of four times.
      const logs = lightbox.logs;
      for (let i = 0; i < logs.length; i++) {
        const isLast = i === logs.length - 1;
        await deleteLogWithPhoto(isLast ? logs[i] : { ...logs[i], photo_url: null });
      }
      toast.success("Foto berhasil dihapus");
      setConfirmDelete(false);
      setLightboxIndex(null);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menghapus foto");
    } finally {
      setDeleting(false);
    }
  }

  const CategoryIcon = routineIcon(group.category, group.kind);

  // --- The row (Phase 130) ------------------------------------------------
  //
  // Every state of the card is one compact row now, the height of a chore
  // card. It used to carry a full-width "Ambil Foto untuk 3 Anjing" button,
  // which made a day of meals and potty breaks a long scroll of buttons; the
  // capture lives in the sheet the row opens, as a chore's does. The row says
  // what a tap will do in a pill at the end of its badges (TapHint), so the
  // affordance costs width, never height.
  const finished = allDone && !visitOpen && !wholeCardSuspended;
  const dogs = dogsIn(group.items);
  // Open pets someone said couldn't be done; the rest still to do.
  const explained = groupExceptions(exceptions, date, { ...group, items: pendingItems });
  const unexplained = pendingItems.filter((i) => !explained.some((e) => e.item.key === i.key && e.item.entityId === i.entityId));
  const medicine = group.category === "medication";
  const couldntLine = explained.length > 0 ? staffCouldntLine(explained[0].exception, medicine) : null;
  const allExplained = !finished && explained.length > 0 && unexplained.length === 0;
  // Every open pet (D4): not done, not at the clinic, nobody said it couldn't
  // be done. A walk's later steps are for the pets that started it.
  const walkPets = new Set((walk?.logs ?? []).filter((l) => l.sub_type === "check_in").map((l) => l.entity_id));
  const quickTargets: AgendaItem[] = !isRoutine
    ? []
    : walk && walk.next !== "start"
      ? walk.next
        ? activeItems.filter((i) => walkPets.has(i.entityId))
        : []
      : unexplained;
  // Only for today: a log is stamped now, so it can't settle another day.
  const quick = isRoutine && !wholeCardSuspended && date === todayKey && quickTargets.length > 0;
  // From the sheet, a routine every pet of which someone said couldn't be
  // done can still be finished after all ("Selesaikan seperti biasa"): its
  // action then covers those pets (Codex, PR #85). The card's own button
  // stays for the open ones only.
  const sheetTargets: AgendaItem[] =
    quickTargets.length > 0
      ? quickTargets
      : isRoutine && (tick || walk?.next === "start")
        ? pendingItems
        : [];
  const sheetAction = isRoutine && !wholeCardSuspended && date === todayKey && sheetTargets.length > 0;
  // Ticks from the last 5 minutes (no photo, so no photo strip to undo them
  // from): the sheet's Batalkan centang takes them back (Codex, PR #85).
  const recentTicks = tick
    ? group.items.flatMap((i) => (i.log && !i.log.photo_url && now < deletableUntil(i.log.completed_at) ? [i.log] : []))
    : [];
  function handleSheetFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = "";
    if (file) void quickSave(file, sheetTargets);
  }
  const stepLabel = walk?.next === "start" ? "Mulai" : walk?.next === "arrived" ? "Sudah sampai" : "Sudah pulang";
  // "Sedang jalan · mulai 07.02", "Sudah sampai 07.15", then the walk's span.
  const walkLine = !walk?.start
    ? null
    : walk.end
      ? (() => {
          const { minutes, phoneTime } = walkMinutes(walk.start!, walk.end!);
          return `${formatTime(new Date(stepTime(walk.start!).at))} sampai ${formatTime(new Date(stepTime(walk.end!).at))} · ${minutes} menit${phoneTime ? " (jam HP)" : ""}`;
        })()
      : walk.arrived
        ? `Sudah sampai ${formatTime(new Date(stepTime(walk.arrived).at))}`
        : `Sedang jalan · mulai ${formatTime(new Date(stepTime(walk.start).at))}`;
  const rowHint = wholeCardSuspended ? (
    <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-900">
      <Stethoscope className="size-3" /> Rawat inap · dijeda
    </span>
  ) : visitOpen ? (
    <TapHint label="Ketuk untuk selesaikan kunjungan" icon={Stethoscope} />
  ) : finished ? (
    <span className="flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
      {photoGroups.length > 0 ? "Lihat foto" : "Selesai"}
      <ChevronRight className="size-3.5" />
    </span>
  ) : isVet ? (
    <TapHint label="Ketuk untuk check-in" icon={Stethoscope} />
  ) : quick ? null : (
    <TapHint />
  );

  const row = (
    <button
      type="button"
      onClick={() => setSheetOpen(true)}
      // Nothing to do while every dog is at the clinic.
      disabled={wholeCardSuspended}
      aria-haspopup="dialog"
      aria-label={`${formatTime(group.time)} ${cardTitle}`}
      className={cn(
        "flex w-full flex-col gap-2 rounded-xl border p-3 text-left active:bg-muted/60",
        finished
          ? DONE_TONE.tint
          : allExplained
            ? "border-amber-300 border-l-[3px] border-l-amber-500 bg-amber-50"
            : cn("bg-card", categoryCardTint(group.category)),
        wholeCardSuspended && "opacity-50"
      )}
    >
      <span className="flex items-start gap-2">
        <CategoryIcon
          className={cn(
            "mt-0.5 size-4 shrink-0",
            finished ? DONE_TONE.icon : categoryIconColor(group.category)
          )}
        />
        <span className="shrink-0 text-sm font-medium tabular-nums">{formatTime(group.time)}</span>
        <span
          className={cn(
            // Wrapped, not cut off (audit B1): the title is what to do.
            "min-w-0 flex-1 text-sm font-medium break-words",
            finished && "text-muted-foreground",
            // Room for the card's own button, which sits over this corner.
            quick && (three ? "pr-28" : "pr-10")
          )}
        >
          {consolidated ? `${cardTitle} (${group.titles.length})` : cardTitle}
        </span>
        {finished && <CheckCircle2 className={cn("mt-0.5 size-4 shrink-0", DONE_TONE.check)} />}
      </span>
      {/* What the block actually is, on the card itself (Phase 132): a
          consolidated medicine round lists its medicines, so staff can see
          what to prepare without opening the sheet. The whole list, at 13px
          (audit B1): a medicine left off by a two-line cut is a medicine
          missed. Routines carry no other notes — a schedule has no
          instructions field — so this is the detail there is. */}
      {consolidated && (
        <span
          className={cn(
            "text-[13px] leading-snug",
            finished ? "text-muted-foreground" : "text-red-900/80"
          )}
        >
          {group.titles.join(" · ")}
        </span>
      )}
      {/* The owner's note, as typed (Phase 173), and where a walk stands. */}
      {group.note && (
        <span className={cn("text-[13px] leading-snug", finished ? "text-muted-foreground" : "text-zinc-700")}>
          {group.note}
        </span>
      )}
      {walkLine && (
        <span
          className={cn(
            "flex items-center gap-1 text-[13px] font-medium",
            finished ? "text-emerald-700" : "text-zinc-800"
          )}
          data-testid="walk-line"
        >
          {finished ? <CheckCircle2 className="size-3.5 shrink-0" /> : <Clock className="size-3.5 shrink-0" />}
          {walkLine}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-1.5">
        {dogs.map((dog) => {
          const suspended = isSuspended(dog.items[0]);
          const done = dog.items.every((i) => i.status === "completed");
          return (
            <Badge
              key={dog.entityId}
              variant={!suspended && done ? "default" : "secondary"}
              className={cn(
                "h-5 gap-1 px-1.5 text-[10px]",
                done && !suspended && "bg-emerald-600 text-white",
                suspended && "opacity-60"
              )}
            >
              {done && !suspended && <CheckCircle2 className="size-3" />}
              {dog.entityName}
            </Badge>
          );
        })}
        {group.staffId && (
          <Suspense fallback={null}>
            <StaffNameChip id={group.staffId} />
          </Suspense>
        )}
        <span className="ml-auto">{rowHint}</span>
      </span>
      {couldntLine && !finished && (
        <span className="flex items-center gap-1 text-[13px] font-medium text-amber-800" data-testid="couldnt-line">
          <CircleSlash className="size-3.5 shrink-0" aria-hidden />
          {explained.length < pendingItems.length || dogs.length > 1
            ? `${couldntLine} · ${[...new Set(explained.map((e) => e.item.entityName))].join(", ")}`
            : couldntLine}
        </span>
      )}
    </button>
  );

  // The card's own button (D4): a round camera, a pill naming a walk's next
  // step, or a circle for a Tick routine. A sibling over the row's corner,
  // never inside it: a control inside a button is invalid and swallows taps.
  const quickButton = !quick ? null : tick ? (
    <button
      type="button"
      onClick={() => void quickSave(null)}
      disabled={busy}
      aria-label={`Centang ${cardTitle}`}
      className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full border-2 border-zinc-900 bg-card text-zinc-900 active:scale-95"
    >
      {busy ? <Loader2 className="size-5 animate-spin" /> : <Circle className="size-5" />}
    </button>
  ) : (
    <label
      className={cn(
        "absolute top-2 right-2 flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-zinc-900 text-sm font-medium text-white active:scale-95",
        three && "px-3.5"
      )}
      aria-label={three ? `${stepLabel} · ${cardTitle}` : `Foto ${cardTitle}`}
      data-testid="quick-camera"
    >
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={busy}
        onChange={handleQuickFile}
      />
      {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
      {three && <span>{stepLabel}</span>}
    </label>
  );

  return (
    <>
      {quickButton ? (
        <div className="relative">
          {row}
          {quickButton}
        </div>
      ) : (
        row
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[90dvh] max-w-md gap-0 overflow-y-auto rounded-t-2xl"
        >
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2">
              <CategoryIcon className={cn("size-4 shrink-0", categoryIconColor(group.category))} />
              <span className="tabular-nums">{formatTime(group.time)}</span>
              <span className="min-w-0 truncate font-normal text-muted-foreground">
                · {cardTitle}
              </span>
            </SheetTitle>
            <SheetDescription>
              {finished
                ? "Semua selesai. Foto bisa dihapus dalam 5 menit setelah dicatat."
                : visitOpen
                  ? "Hewan sedang di klinik. Selesaikan kunjungan saat dia pulang atau menginap."
                  : three
                    ? "Tiga foto dari kamera: di gerbang, di tempat tujuan, dan di gerbang saat pulang."
                    : tick
                      ? "Centang hewan yang sudah selesai."
                      : "Ambil foto, lalu centang hewan yang ada di foto."}
            </SheetDescription>
          </SheetHeader>
        <div
          className={cn(
            "flex flex-col gap-3 px-4 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
            categoryCardTint(group.category)
          )}
        >
          {wholeCardSuspended && (
            <p className="flex items-center gap-1.5 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-medium text-indigo-900">
              <Stethoscope className="size-3.5 shrink-0" /> Sedang Rawat Inap — jadwal dijeda
            </p>
          )}
          {consolidated && (
            <ul className="flex flex-col gap-1 text-sm text-rose-950">
              {group.titles.map((title) => (
                <li key={title} className="flex gap-1.5">
                  <span aria-hidden className="text-rose-400">
                    •
                  </span>
                  <span className="min-w-0 flex-1">{title}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-1.5">
            {dogsIn(group.items).map((dog) => {
              const suspended = isSuspended(dog.items[0]);
              const done = dog.items.every((i) => i.status === "completed");
              return (
                <Badge
                  key={dog.entityId}
                  variant={!suspended && done ? "default" : "secondary"}
                  className={cn(
                    "h-7 gap-1 px-2.5 text-sm",
                    done && !suspended && "bg-emerald-600 text-white",
                    suspended && "opacity-50"
                  )}
                >
                  {done && !suspended && <CheckCircle2 className="size-3.5" />}
                  {suspended && <Stethoscope className="size-3.5" />}
                  {dog.entityName}
                </Badge>
              );
            })}
          </div>

          {group.note && (
            <p className="text-sm text-zinc-700">
              <span className="font-medium">Catatan: </span>
              {group.note}
            </p>
          )}
          {walk && (
            <div className="grid grid-cols-3 gap-2" data-testid="walk-steps">
              {(
                [
                  ["Mulai", walk.start],
                  ["Sudah sampai", walk.arrived],
                  ["Sudah pulang", walk.end],
                ] as const
              ).map(([label, log]) => {
                const time = log ? stepTime(log) : null;
                return (
                  <figure key={label} className="flex flex-col gap-1">
                    {log?.photo_url ? (
                      <SyncedImg url={log.photo_url} size={320} alt={label} className="aspect-square w-full rounded-lg object-cover" />
                    ) : (
                      <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                        <Camera className="size-5" />
                      </div>
                    )}
                    <figcaption className="text-[11px] leading-tight">
                      <span className="block font-medium">{label}</span>
                      <span className="block text-muted-foreground tabular-nums">
                        {time ? formatTime(new Date(time.at)) : "belum"}
                        {time?.sentAt ? ` · terkirim ${formatTime(new Date(time.sentAt))}` : ""}
                      </span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}

          {/* Every photo logged against this slot, not just the first — and
              each one carries the dogs it was tagged with, so a card with
              four separate shots reads at a glance. Sits outside the capture
              <label> so scrolling the strip can't trip the file input. */}
          {photoGroups.length > 0 && !walk && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {photoGroups.map((photo, index) => (
                <figure key={photo.url} className="flex w-24 shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    {...tap.touchProps}
                    // The strip scrolls horizontally, so a drag across it ends
                    // in a touchend over whichever tile is under the finger.
                    onClick={(e) => {
                      if (tap.cancelled(e)) return;
                      setLightboxIndex(index);
                    }}
                    aria-label={`Lihat foto ${photo.names.join(", ")}`}
                    className="relative block rounded-lg active:scale-[0.98]"
                  >
                    <StripThumbnail url={photo.url} label={photo.names.join(", ")} />
                    <div className="absolute -bottom-1.5 left-1 flex">
                      {photo.entityIds.map((id, i) => {
                        const pet = petById.get(id);
                        if (!pet) return null;
                        return (
                          <MiniPetAvatar
                            key={id}
                            pet={pet}
                            className={cn("size-7 border-2 border-white", i > 0 && "-ml-2.5")}
                          />
                        );
                      })}
                    </div>
                  </button>
                  <figcaption className="truncate text-[11px] text-muted-foreground">
                    {photo.names.join(", ")}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          {!finished &&
            explained.map(({ item, exception }) => (
              <CouldntDoNote
                key={exception.id}
                exception={exception}
                medicine={medicine}
                petName={dogs.length > 1 ? item.entityName : undefined}
                allowWithdraw
              />
            ))}
          {allExplained && (
            <p className="text-center text-xs text-muted-foreground">Ternyata sudah bisa? Selesaikan seperti biasa.</p>
          )}

          {/* A completed group's footer is a status line — the sheet closes
              by swipe or Back, so it has nothing to collapse (Phase 130). */}
          {/* Nothing to photograph when every dog on this card is at the
              clinic, so the capture control is gone rather than merely
              disabled — a greyed button still invites the tap.

              An open visit outranks "all done": the check-in marks the task
              complete, but the dog is still at the clinic and the only useful
              control is the one that closes the visit. */}
          {wholeCardSuspended ? null : isRoutine && (three || tick) && !allDone ? (
            // A walk's next step, or a Tick routine, for every open pet: the
            // same action as the card's own button.
            sheetAction ? (
              tick ? (
                <div className="flex flex-col gap-2">
                  <Button onClick={() => void quickSave(null, sheetTargets)} disabled={busy} className="min-h-[48px] w-full">
                    {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 className="size-5" />}
                    {sheetTargets.length > 1 ? `Centang ${sheetTargets.length} hewan` : "Centang selesai"}
                  </Button>
                  {/* One pet at a time, when only one was done (D4). */}
                  {sheetTargets.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {sheetTargets.map((item) => (
                        <Button
                          key={item.key}
                          variant="outline"
                          onClick={() => void quickSave(null, [item])}
                          disabled={busy}
                          className="min-h-11 flex-1"
                        >
                          <Circle className="size-4" /> Centang {item.entityName}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-zinc-900 text-sm font-medium text-white active:scale-[0.99]">
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={busy}
                    onChange={handleSheetFile}
                  />
                  {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
                  {stepLabel}
                </label>
              )
            ) : null
          ) : visitOpen ? (
            // Checked in and still there. The only thing left to record is how
            // the visit ended, which is a question before it is a photo.
            <Button
              onClick={() => setFinishOpen(true)}
              disabled={busy}
              className="min-h-[48px] w-full bg-indigo-600 text-sm hover:bg-indigo-700"
            >
              {busy ? <Loader2 className="animate-spin" /> : <Stethoscope className="size-5" />}
              Selesaikan Kunjungan
            </Button>
          ) : allDone ? (
            <p className="flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/5 text-sm font-medium text-emerald-600">
              <CheckCircle2 className="size-5" /> Semua Selesai
            </p>
          ) : (
            <label
              className={cn(
                "flex min-h-[48px] items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-transform active:scale-[0.99]",
                anyOverdue
                  ? "cursor-pointer border-destructive/40 bg-destructive/5"
                  : "cursor-pointer border-border bg-card"
              )}
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={busy}
                onChange={handleFile}
              />
              {busy ? (
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              ) : (
                <span className="flex items-center gap-1.5">
                  <Camera className="size-5" />
                  {isVet
                    ? "Check-In Klinik"
                    : pendingItems.length > 1
                      ? `Ambil Foto untuk ${pendingItems.length} Hewan`
                      : "Ambil Foto untuk Selesai"}
                </span>
              )}
            </label>
          )}
          {recentTicks.length > 0 && (
            <Button
              variant="outline"
              className="min-h-12 w-full font-medium text-gray-700"
              disabled={busy}
              onClick={() => void undoLogs(recentTicks)}
            >
              <X /> Batalkan centang
            </Button>
          )}
          {(walkStarted || walkUndoable) && (
            <Button
              variant="outline"
              className="min-h-12 w-full font-medium text-gray-700"
              disabled={busy}
              onClick={() => setConfirmCancelWalk(true)}
            >
              <X /> Batalkan jalan-jalan
            </Button>
          )}
          {!wholeCardSuspended && !visitOpen && !isVet && !walkStarted && unexplained.length > 0 && canFileFor(date, todayKey) && (
            <Button
              variant="outline"
              className="min-h-12 w-full font-medium text-gray-700"
              disabled={busy}
              onClick={() => setCouldntOpen(true)}
            >
              <CircleSlash /> Tidak bisa dikerjakan
            </Button>
          )}
        </div>
        </SheetContent>
      </Sheet>

      <CouldntDoSheet
        target={{
          kind: "routine",
          date,
          title: cardTitle,
          time: group.time,
          category: group.category,
          items: unexplained,
        }}
        open={couldntOpen}
        onOpenChange={setCouldntOpen}
        onFiled={() => setSheetOpen(false)}
      />

      {/* How the visit ended. Both answers still take a photo — the difference
          is what the photo is filed as, and whether the dog's daily routine is
          suspended afterwards. */}
      <Dialog open={finishOpen} onOpenChange={(open) => !open && setFinishOpen(false)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Selesaikan kunjungan</DialogTitle>
            <DialogDescription>
              Hewannya pulang hari ini, atau menginap di klinik?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button
              className="min-h-[52px] w-full"
              onClick={() => {
                setFinishChoice("check_out");
                setFinishOpen(false);
                fileRef.current?.click();
              }}
            >
              <Home className="size-5" /> Bawa Pulang
            </Button>
            <Button
              variant="outline"
              className="min-h-[52px] w-full border-indigo-300 bg-indigo-50 hover:bg-indigo-100"
              onClick={() => {
                setFinishChoice("admitted");
                setFinishOpen(false);
                fileRef.current?.click();
              }}
            >
              <Stethoscope className="size-5" /> Rawat Inap
            </Button>
            <p className="px-1 text-xs text-muted-foreground">
              Rawat inap menghentikan sementara jadwal makan dan pipisnya sampai dijemput.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Kept mounted for the vet flow: finishing a visit opens the camera from
          the dialog above, which needs this input to exist even though the
          capture label is hidden while the visit is open. */}
      {visitOpen && (
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={busy}
          onChange={handleFile}
        />
      )}

      <Dialog open={!!capture} onOpenChange={(open) => !open && dropCapture()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pilih hewan yang ada di foto</DialogTitle>
            {/* Reworded, not just translated: with nothing pre-ticked the old
                "untick anyone who isn't here" instruction told staff to do
                the opposite of what the dialog now needs. */}
            <DialogDescription>
              Centang hewan yang benar-benar terlihat di foto ini. Yang tidak dicentang tetap
              belum selesai.
            </DialogDescription>
          </DialogHeader>
          {capture && (
            <>
              <SyncedImg url={capture.photoUrl} size={320} className="max-h-56 w-full rounded-lg object-cover" />
              <div className="flex flex-col gap-2">
                {dogsIn(capture.items).map((item) => {
                  const checked = capture.selected.has(item.entityId);
                  const pet = petById.get(item.entityId);
                  return (
                    <label
                      key={item.entityId}
                      className={cn(
                        // Ticking is now a required step rather than a
                        // correction, so a selected row is made obvious
                        // instead of relying on a small checkbox alone.
                        "flex min-h-[48px] items-center gap-3 rounded-lg border px-3",
                        checked ? "border-emerald-500 bg-emerald-500/5" : "border-border"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDog(item.entityId)}
                        className="size-5 accent-emerald-600"
                      />
                      {pet && <MiniPetAvatar pet={pet} className="size-8" />}
                      <span className="font-medium">{item.entityName}</span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <DialogFooter>
            <Button
              onClick={handleConfirm}
              disabled={confirming || !capture || capture.selected.size === 0}
              className="min-h-[48px] w-full"
            >
              {confirming ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
              {/* Nothing is pre-ticked, so the count doubles as feedback that
                  a tap registered before Simpan becomes enabled. */}
              {capture && capture.selected.size > 0
                ? `Simpan (${capture.selected.size})`
                : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox. Every photo on this card is one gallery, so staff can swipe
          between the day's shots for this slot instead of closing and reopening.
          `lightbox` is derived from photoGroups, so deleting a photo flows
          through here on its own. */}
      <PhotoLightbox
        open={photoGroups.length > 0 && lightboxIndex !== null}
        onClose={() => {
          setLightboxIndex(null);
          setConfirmDelete(false);
        }}
        initialIndex={lightboxIndex ?? 0}
        onIndexChange={setLightboxIndex}
        items={photoGroups.map((photo) => ({
          src: photo.url,
          alt: photo.names.join(", "),
          // A medicine block's photo names every medicine it covers;
          // group.title alone is just the first of them.
          title: consolidated ? photo.titles.join(" · ") : group.title,
          description: formatTime(new Date(photo.at)),
          footer: (
            <>
              <div className="flex flex-wrap gap-1.5">
                {photo.entityIds.map((id, i) => {
                  const pet = petById.get(id);
                  return (
                    <Badge
                      key={id}
                      className="h-8 gap-1.5 bg-emerald-600 py-0 pr-3 pl-1 text-sm text-white"
                    >
                      {pet ? (
                        <MiniPetAvatar pet={pet} className="size-6 border-0" />
                      ) : (
                        <CheckCircle2 className="size-4" />
                      )}
                      {photo.names[i]}
                    </Badge>
                  );
                })}
              </div>

              {/* Read from this frame's own timestamp, not the tile that was
                  tapped: swiping to an older photo has to drop the button.
                  NaN-safe too — an unparseable timestamp fails this comparison
                  rather than throwing the window wide open. */}
              {now < deletableUntil(photo.at) ? (
                <Button
                  variant="destructive"
                  onClick={() => setConfirmDelete(true)}
                  className="mt-3 min-h-[48px] w-full"
                >
                  <Trash2 /> Hapus Foto (
                  {Math.max(0, Math.ceil((deletableUntil(photo.at) - now) / 60_000))} menit lagi)
                </Button>
              ) : (
                <p className="mt-3 text-center text-xs text-muted-foreground">
                  Foto hanya bisa dihapus dalam 5 menit setelah dicatat. Hubungi admin untuk
                  menghapus foto lama.
                </p>
              )}
            </>
          ),
        }))}
      />

      <Dialog open={confirmCancelWalk} onOpenChange={(open) => !open && setConfirmCancelWalk(false)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Batalkan jalan-jalan?</DialogTitle>
            <DialogDescription>Foto jalan-jalan ini dihapus, dan kartunya kembali ke Mulai.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="min-h-[48px] flex-1" onClick={() => setConfirmCancelWalk(false)} disabled={busy}>
              Kembali
            </Button>
            <Button variant="destructive" className="min-h-[48px] flex-1" onClick={() => void cancelWalk()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <X />}
              Batalkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(false)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Hapus foto ini?</DialogTitle>
            <DialogDescription>
              Tindakan ini tidak dapat dibatalkan.
              {lightbox && lightbox.logs.length > 1
                ? ` ${lightbox.names.join(", ")} akan kembali menjadi belum selesai.`
                : " Tugas ini akan kembali menjadi belum selesai."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="min-h-[48px] flex-1"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              className="min-h-[48px] flex-1"
              onClick={handleDeletePhoto}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


/**
 * One tile in a group's photo strip.
 *
 * Its own component so each tile gets its own IntersectionObserver — the
 * prefetch hook returns a ref, and a strip of them cannot share one (Phase 94).
 */
function StripThumbnail({ url, label }: { url: string; label: string }) {
  const prefetchRef = usePrefetchHighRes(url);
  return (
    <SyncedImg
      ref={prefetchRef}
      url={url}
      size={320}
      loading="lazy"
      decoding="async"
      alt={label}
      title={label}
      className="size-24 rounded-lg object-cover ring-1 ring-emerald-500/40"
    />
  );
}

/**
 * The person a routine is for (Phase 173, D10), as chores show it. Nobody's
 * view is filtered by it. Its own component, under Suspense: the roster is a
 * Suspense resource, and a card must never wait for a name.
 */
function StaffNameChip({ id }: { id: string }) {
  const { allProfiles } = useStaffProfiles();
  const name = useStaffNameLookup(allProfiles, "")(id);
  if (!name) return null;
  return (
    <span className="flex items-center gap-0.5 text-[11px] font-medium text-zinc-600">
      <UserRound className="size-3" aria-hidden />
      {name}
    </span>
  );
}
