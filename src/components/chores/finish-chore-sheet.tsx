"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, Check, CheckCircle2, CircleSlash, CloudOff, CloudUpload, Eye, Hand, Loader2, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { PhotoPicker } from "@/components/photo-picker";
import { ChoreProofPhotos } from "@/components/chores/chore-proof-photos";
import { useStaffIdentity } from "@/components/auth/staff-login-gate";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { categoryLabel } from "@/lib/household-tasks";
import { useFormatTime } from "@/components/ui/ui-labels";
import { photoSrc, photoTakenAt } from "@/lib/photos";
import { useRepairs } from "@/hooks/use-repairs";
import { RepairNotes } from "@/components/repairs/repair-notes";
import { cn } from "@/lib/utils";
import { choreDraftKey, clearChoreDraft, readChoreDraft, writeChoreDraft } from "@/lib/chore-draft";
import { classifySubmitError, reloadForUpdate } from "@/lib/submit-errors";
import { choreChangedMessage, choreSettledMessageId, isChoreAlreadySettled, isChoreChanged } from "@/lib/chore-settled";
import { discardPhoto } from "@/lib/photo-queue";
import { recordChoreRefusal, refusalOf } from "@/lib/chore-refusals";
import { useQueuedPhoto } from "@/hooks/use-queued-photo";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import { CouldntDoSheet } from "@/components/staff/couldnt-do-sheet";
import { CouldntDoNote } from "@/components/staff/couldnt-do-note";
import { useTaskExceptions } from "@/hooks/use-task-exceptions";
import { choreException, canFileFor } from "@/lib/couldnt-do";
import { useToday } from "@/hooks/use-today";
import { formatDateLocal } from "@/lib/scheduleEngine";

/**
 * A staff member's whole relationship with a chore: read it, take it, prove
 * it, close it (Phase 100).
 *
 * Staff-facing, so entirely Bahasa Indonesia per the Phase 46 language
 * boundary. There is deliberately no way to edit or delete anything here —
 * the only writes it can make are claiming the chore and completing it.
 *
 * MATERIALISING. A repeat has no row for most of the days it lands on (see
 * migrations/097), so the first write against one has to create it. That
 * happens here, at the moment someone actually acts, rather than anywhere
 * earlier: a chore nobody touches never costs a row.
 */
export function FinishChoreSheet({
  occurrence,
  open,
  onOpenChange,
}: {
  occurrence: ChoreOccurrence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  useBackToClose(open, () => onOpenChange(false));
  if (!occurrence) return null;
  // Keyed on the occurrence, so opening a second chore remounts the body with
  // empty photo state rather than inheriting the first one's proof — which
  // would attach the wrong evidence to the wrong job.
  return (
    <FinishChoreBody
      key={occurrence.key}
      occurrence={occurrence}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

function FinishChoreBody({
  occurrence,
  open,
  onOpenChange,
}: {
  occurrence: ChoreOccurrence;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const formatTime = useFormatTime();
  const { repairs } = useRepairs();
  const {
    activeHouseholdId,
    materialiseChoreOccurrence,
    claimHouseholdTask,
    finishChore,
    pendingIds,
    refresh,
  } = useHousehold();
  const { staffId } = useStaffIdentity();
  // Photos already uploaded for this day's chore, restored from the device
  // (Phase 133): the tab may have been killed between the before shot and
  // the after shot. Read synchronously, so the steps open already filled.
  const draftKey = choreDraftKey(activeHouseholdId, occurrence.template.id, occurrence.date);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(
    () => readChoreDraft(draftKey)?.before ?? null
  );
  const [afterUrl, setAfterUrl] = useState<string | null>(
    () => readChoreDraft(draftKey)?.after ?? null
  );
  // An upload in flight has no URL yet; finishing then would race it.
  const [uploadingBefore, setUploadingBefore] = useState(false);
  const [uploadingAfter, setUploadingAfter] = useState(false);
  const uploading = uploadingBefore || uploadingAfter;
  const [busy, setBusy] = useState(false);
  // "Tidak bisa dikerjakan" (Phase 165): the reason sheet, and the record
  // already filed for this day, if any.
  const [couldntOpen, setCouldntOpen] = useState(false);
  const { exceptions } = useTaskExceptions();
  const exception = choreException(exceptions, occurrence);
  const todayKey = formatDateLocal(useToday());

  const { task } = occurrence;
  const supervised = !!task.requires_supervision;
  const unassigned = !task.assigned_to;
  const done = occurrence.status === "completed";
  // Finished on this phone, not sent yet (Phase 161): shown as done, but the
  // draft and the photos on the phone are still what the save will send.
  const waitingToSend = !!occurrence.row && pendingIds.has(occurrence.row.id);

  // Every change to the photos is saved as it happens — an upload landing, or
  // a photo removed to retake it. Removing both drops the draft.
  useEffect(() => {
    if (done) return;
    writeChoreDraft(draftKey, { before: beforeUrl, after: afterUrl });
  }, [draftKey, beforeUrl, afterUrl, done]);

  // Finished, here or on another phone: nothing is owed any more — including
  // any proof still waiting on this phone to upload (Phase 138). Finished
  // here, both are already in storage and discarding is a no-op.
  useEffect(() => {
    if (!done || waitingToSend) return;
    clearChoreDraft(draftKey);
    if (beforeUrl) void discardPhoto(beforeUrl);
    if (afterUrl) void discardPhoto(afterUrl);
  }, [draftKey, done, waitingToSend, beforeUrl, afterUrl]);

  // Proof the storage server refused outright (Phase 138): it has to be
  // retaken, and finishing is held until it is.
  const beforeState = useQueuedPhoto(beforeUrl).state;
  const afterState = useQueuedPhoto(afterUrl).state;
  const photoFailed = beforeState === "failed" || afterState === "failed";

  /**
   * Explains a failed save (Phase 133). Nothing here touches the photos: they
   * stay on screen and in the draft whatever went wrong, so trying again — or
   * reopening after a reload — needs no retake.
   *
   * "reloading": the app is about to reload onto a new version; stay busy so
   * the button cannot be tapped into the same stale code again. "explained":
   * a message is up. null: the server refused, and the caller says how.
   */
  function explainFailure(err: unknown): "reloading" | "explained" | null {
    console.error(err);
    const failure = classifySubmitError(err);
    if (failure === "update" && reloadForUpdate()) {
      // The draft is already written, so the reloaded app reopens this chore
      // with both photos in place.
      toast.info("Aplikasi telah diperbarui. Memuat ulang...");
      return "reloading";
    }
    // An update that a reload already failed to fix is, as far as anyone
    // holding the phone can tell, a connection that is not working.
    if (failure !== "other") {
      toast.error("Koneksi terputus. Data aman, silakan coba lagi.");
      return "explained";
    }
    return null;
  }

  /**
   * The server will never take this save: the chore changed since the phone
   * loaded it (its days, turned off, done), or the day was never one of its
   * days (isChoreChanged). Trying again only bounced the photos back with
   * "Gagal", so: say what happened, close, and reload the list as it is now.
   * The draft and its photos stay on the phone — if the chore is still on the
   * list, reopening it finds them in place; if not, nothing was thrown away
   * without saying so, and the draft expires on its own (lib/chore-draft).
   */
  function refusedAsChanged(kind: "finish" | "claim", err: unknown) {
    recordChoreRefusal(
      refusalOf(kind, { templateId: occurrence.template.id, rowId: occurrence.row?.id ?? null, date: occurrence.date }, err)
    );
    toast.info(choreChangedMessage("id", task.title, !!(beforeUrl || afterUrl)), { duration: 10_000 });
    onOpenChange(false);
    void refresh({ silent: true });
  }

  /**
   * The row this day's work belongs to, creating it if the occurrence is
   * still virtual. Everything that writes goes through here.
   */
  async function rowId(): Promise<string> {
    if (occurrence.row) return occurrence.row.id;
    // The template's id: this writes the row that a day of the repeat is
    // missing, and parent_task_id has to point at the repeat itself.
    // Under the assignee on screen, not the template's: a chore covered for
    // someone on leave is filed under whoever covers it (Phase 140).
    const created = await materialiseChoreOccurrence(
      occurrence.template.id,
      occurrence.date,
      occurrence.task.assigned_to
    );
    return created.id;
  }

  async function handleClaim() {
    setBusy(true);
    let reloading = false;
    try {
      await claimHouseholdTask(await rowId());
      toast.success(`"${task.title}" jadi tugas Anda`);
    } catch (err) {
      if (isChoreChanged(err)) {
        refusedAsChanged("claim", err);
        return;
      }
      // A dropped connection is not a lost race; say which it was.
      const handled = explainFailure(err);
      reloading = handled === "reloading";
      if (handled) return;
      // The provider's `is("assigned_to", null)` guard is what makes the
      // losing half of a double-claim land here rather than silently taking a
      // chore someone else already has.
      toast.error("Tugas ini sudah diambil orang lain");
    } finally {
      if (!reloading) setBusy(false);
    }
  }

  // Both photos, always (Phase 127). The before shot was optional, and a
  // chore finished with only an after photo — or, from a phone still running
  // an older version of the app, with neither — showed the owner no
  // comparison and no start time. The button stays disabled until both are
  // uploaded; this check is for the keyboard path, and the database refuses
  // a completion without both in any case (migrations/104).
  const bothPhotos = !!beforeUrl && !!afterUrl;

  async function handleFinish() {
    if (!beforeUrl || !afterUrl) {
      toast.error(
        !beforeUrl
          ? "Ambil foto sebelum dulu, sebelum mulai bekerja"
          : "Ambil foto sesudah dulu sebagai bukti"
      );
      return;
    }
    setBusy(true);
    let reloading = false;
    try {
      // Kept on the phone and sent from there (Phase 161): photos first, then
      // the completion. No answer — no signal, or a weak one that times out —
      // and it waits on the phone and goes by itself; the chore shows as
      // done meanwhile, marked as waiting. The draft stays until it is sent.
      const { queued } = await finishChore({
        templateId: occurrence.template.id,
        date: occurrence.date,
        rowId: occurrence.row?.id ?? null,
        // Under the assignee on screen, not the template's: a chore covered
        // for someone on leave is filed under whoever covers it (Phase 140).
        assignedTo: occurrence.task.assigned_to,
        before: beforeUrl,
        after: afterUrl,
        title: task.title,
      });
      if (queued) {
        toast.info("Tugas selesai, disimpan di HP. Akan dikirim otomatis saat sinyal bagus.");
      } else {
        clearChoreDraft(draftKey);
        toast.success(`"${task.title}" selesai`);
      }
      onOpenChange(false);
    } catch (err) {
      // Finished by someone else, or cancelled, before this reached the
      // server (audit M4): theirs stands, these photos are not used.
      if (isChoreAlreadySettled(err)) {
        clearChoreDraft(draftKey);
        toast.info(choreSettledMessageId(err.state, task.title), { duration: 8000 });
        onOpenChange(false);
        void refresh({ silent: true });
        return;
      }
      if (isChoreChanged(err)) {
        refusedAsChanged("finish", err);
        return;
      }
      const handled = explainFailure(err);
      reloading = handled === "reloading";
      if (!handled) toast.error("Gagal menyimpan. Foto tetap tersimpan, coba lagi.");
    } finally {
      if (!reloading) setBusy(false);
    }
  }

  // Photos are filed under the template's id, not the occurrence's: a repeat's
  // proof then collects in one folder per chore rather than scattering across
  // a folder per day. The storage path stays household-prefixed either way
  // (Phase 90), so tenancy is unaffected.
  const pathPrefix = `household/${occurrence.template.id}`;
  const mine = !!staffId && task.assigned_to === staffId;
  // A repair visit (Phase 159): the problem on top, and photo steps worded
  // for the repair person's work.
  const repair = task.repair_id ? (repairs.find((r) => r.id === task.repair_id) ?? null) : null;
  const isVisit = !!task.repair_id;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{task.title}</SheetTitle>
          <SheetDescription>
            {categoryLabel(task.category, "id")} ·{" "}
            {task.due_time ? formatTime(task.due_time) : "Kapan saja hari ini"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {repair && (
            <div className="flex flex-col gap-2 rounded-xl border p-3">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Yang rusak</p>
              {repair.photo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoSrc(repair.photo_url, 640)} alt="" className="max-h-48 w-full rounded-lg bg-muted object-cover" />
              )}
              <p className="text-sm font-medium">{repair.title}</p>
              {repair.details && <p className="text-sm text-muted-foreground">{repair.details}</p>}
              {/* The repair's thread (PR B): staff can say what the repair person said. */}
              <RepairNotes repairId={repair.id} locale="id" asStaff />
            </div>
          )}
          {/* The instruction, readable (audit B1): normal ink under a small
              label, line breaks kept as the owner typed them. */}
          {task.notes && (
            <div className="flex flex-col gap-0.5 rounded-xl border bg-muted/40 p-3">
              <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <NotebookPen className="size-3 shrink-0" aria-hidden />
                Catatan
              </p>
              <p className="text-sm leading-snug break-words whitespace-pre-line text-gray-900">{task.notes}</p>
            </div>
          )}

          {supervised && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Eye className="mt-0.5 size-4 shrink-0" />
              <span>
                Tugas ini dikerjakan bersama pemilik rumah. Tunggu pemilik rumah
                datang dulu, jangan dikerjakan sendiri.
              </span>
            </p>
          )}

          {!done && exception && <CouldntDoNote exception={exception} allowWithdraw />}

          {done ? (
            <>
              {waitingToSend ? (
                // Amber means waiting (Phase 153 colour rule).
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <CloudUpload className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Sudah selesai, tersimpan di HP. Menunggu dikirim — terkirim
                    otomatis saat sinyal bagus. Tidak perlu diulang.
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <CheckCircle2 className="size-4 shrink-0" /> Tugas ini sudah selesai.
                </p>
              )}
              {/* Where "Lihat foto" on a finished card leads (Phase 131): the
                  before/after pair with their times, each opening full screen. */}
              {occurrence.row && (
                <ChoreProofPhotos row={occurrence.row} locale="id" interactive />
              )}
            </>
          ) : unassigned ? (
            <Button className="min-h-[52px] w-full" disabled={busy} onClick={handleClaim}>
              {busy ? <Loader2 className="animate-spin" /> : <Hand />} Ambil Tugas
            </Button>
          ) : (
            <>
              {/* Two separate, numbered places for two separate photos
                  (Phase 128). One generic upload area is how a chore ended up
                  with a single photo: nothing on screen said a second one was
                  owed. Each card now names its moment, and turns green with
                  the time once its photo is in. */}
              <ProofStep
                step={1}
                title={isVisit ? "Foto sebelum diperbaiki" : "Foto Sebelum"}
                hint={
                  isVisit
                    ? "Saat tukang mulai bekerja, sebelum apa pun diperbaiki."
                    : "Saat mulai bekerja, sebelum apa pun dibersihkan."
                }
                url={beforeUrl}
              >
                <PhotoPicker
                  offline
                  // Held by the save while Selesaikan is being sent.
                  disabled={busy}
                  pathPrefix={pathPrefix}
                  value={beforeUrl}
                  onChange={setBeforeUrl}
                  onBusyChange={setUploadingBefore}
                  label="Ambil Foto Sebelum"
                  locale="id"
                  busyLabel="Menyimpan foto..."
                  errorMessage="Gagal mengunggah foto"
                  className="min-h-[52px] w-full"
                />
              </ProofStep>

              <ProofStep
                step={2}
                title={isVisit ? "Foto sesudah diperbaiki" : "Foto Sesudah"}
                hint={
                  isVisit
                    ? "Saat tukang selesai, dari sudut yang sama dengan foto sebelum."
                    : "Saat selesai, dari sudut yang sama dengan foto sebelum."
                }
                url={afterUrl}
              >
                <PhotoPicker
                  offline
                  // Held by the save while Selesaikan is being sent.
                  disabled={busy}
                  pathPrefix={pathPrefix}
                  value={afterUrl}
                  onChange={setAfterUrl}
                  onBusyChange={setUploadingAfter}
                  label="Ambil Foto Sesudah"
                  locale="id"
                  busyLabel="Menyimpan foto..."
                  errorMessage="Gagal mengunggah foto"
                  className="min-h-[52px] w-full"
                />
              </ProofStep>

              {!mine && (
                <p className="text-[11px] text-muted-foreground">
                  Tugas ini untuk orang lain, tapi tetap bisa diselesaikan kalau
                  sudah dikerjakan.
                </p>
              )}
            </>
          )}
        </div>

        {!done && !unassigned && (
          <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {exception && (
              <p className="text-center text-xs text-muted-foreground">
                Ternyata sudah bisa? Selesaikan seperti biasa.
              </p>
            )}
            {/* Says what is still missing rather than just greying out:
                a disabled button with no reason reads as broken. */}
            <Button
              onClick={handleFinish}
              disabled={busy || uploading || !bothPhotos || photoFailed}
              className="min-h-[52px]"
            >
              {busy || uploading ? (
                <Loader2 className="animate-spin" />
              ) : photoFailed ? (
                <AlertTriangle />
              ) : bothPhotos ? (
                <CheckCircle2 />
              ) : (
                <Camera />
              )}
              {uploading
                ? "Menyimpan foto…"
                : photoFailed
                  ? "Ambil ulang foto yang rusak"
                  : !beforeUrl && !afterUrl
                  ? "Ambil 2 foto dulu"
                  : !beforeUrl
                    ? "Ambil foto sebelum dulu"
                    : !afterUrl
                      ? "Ambil foto sesudah dulu"
                      : "Selesaikan"}
            </Button>
            {!exception && canFileFor(occurrence.date, todayKey) && (
              <CouldntDoButton onClick={() => setCouldntOpen(true)} disabled={busy} />
            )}
          </SheetFooter>
        )}
        {/* Not taken yet: it can still be explained ("Sudah dikerjakan orang lain"). */}
        {!done && unassigned && !exception && canFileFor(occurrence.date, todayKey) && (
          <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <CouldntDoButton onClick={() => setCouldntOpen(true)} disabled={busy} />
          </div>
        )}
        <CouldntDoSheet
          target={{ kind: "chore", occurrence }}
          open={couldntOpen}
          onOpenChange={setCouldntOpen}
          onFiled={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/** The quiet second button (Phase 165): outline, under the main action. */
function CouldntDoButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button variant="outline" className="min-h-12 w-full font-medium text-gray-700" disabled={disabled} onClick={onClick}>
      <CircleSlash /> Tidak bisa dikerjakan
    </Button>
  );
}

/**
 * One of the two proof photos, as its own numbered card (Phase 128).
 * Neutral until its photo is in, then green with the time it was taken.
 */
function ProofStep({
  step,
  title,
  hint,
  url,
  children,
}: {
  step: 1 | 2;
  title: string;
  hint: string;
  url: string | null;
  children: React.ReactNode;
}) {
  const formatTime = useFormatTime();
  const takenAt = photoTakenAt(url);
  // Where the photo is on its way to storage (Phase 138). Taken is taken —
  // the card turns green either way — and the line underneath says the rest.
  const { state } = useQueuedPhoto(url);
  const failed = state === "failed";
  const status =
    state === "pending"
      ? "Tersimpan di HP · terkirim otomatis saat ada sinyal"
      : state === "uploading"
        ? "Mengirim foto…"
        : failed
          ? "Foto rusak. Hapus lalu ambil ulang."
          : null;
  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border p-3",
        failed ? "border-red-200 bg-red-50/60" : url ? "border-emerald-200 bg-emerald-50/60" : "bg-card"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            failed
              ? "bg-red-600 text-white"
              : url
                ? "bg-emerald-600 text-white"
                : "bg-muted text-muted-foreground"
          )}
        >
          {failed ? <AlertTriangle className="size-4" /> : url ? <Check className="size-4" /> : step}
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="text-sm font-semibold">
            {title} <span className="font-normal text-red-600">· wajib</span>
          </p>
          <p className="text-[13px] text-muted-foreground">
            {url && takenAt ? `Diambil ${formatTime(takenAt)}` : hint}
          </p>
          {status && (
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1 text-xs",
                failed ? "text-red-700" : "text-muted-foreground"
              )}
            >
              {state === "pending" && <CloudOff className="size-3 shrink-0" />}
              {state === "uploading" && <Loader2 className="size-3 shrink-0 animate-spin" />}
              {status}
            </p>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
