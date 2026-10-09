"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, Check, CheckCircle2, CloudOff, Eye, Hand, Loader2 } from "lucide-react";
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
import { formatTime12h } from "@/lib/time";
import { photoTakenAt } from "@/lib/photos";
import { cn } from "@/lib/utils";
import { choreDraftKey, clearChoreDraft, readChoreDraft, writeChoreDraft } from "@/lib/chore-draft";
import { classifySubmitError, reloadForUpdate } from "@/lib/submit-errors";
import { discardPhoto, ensureUploaded, PhotoNotUploadedError } from "@/lib/photo-queue";
import { useQueuedPhoto } from "@/hooks/use-queued-photo";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";

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
  const {
    activeHouseholdId,
    updateHouseholdTaskStatus,
    materialiseChoreOccurrence,
    claimHouseholdTask,
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

  const { task } = occurrence;
  const supervised = !!task.requires_supervision;
  const unassigned = !task.assigned_to;
  const done = occurrence.status === "completed";

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
    if (!done) return;
    clearChoreDraft(draftKey);
    if (beforeUrl) void discardPhoto(beforeUrl);
    if (afterUrl) void discardPhoto(afterUrl);
  }, [draftKey, done, beforeUrl, afterUrl]);

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
   * The row this day's work belongs to, creating it if the occurrence is
   * still virtual. Everything that writes goes through here.
   */
  async function rowId(): Promise<string> {
    if (occurrence.row) return occurrence.row.id;
    // The template's id: this writes the row that a day of the repeat is
    // missing, and parent_task_id has to point at the repeat itself.
    const created = await materialiseChoreOccurrence(occurrence.template.id, occurrence.date);
    return created.id;
  }

  async function handleClaim() {
    setBusy(true);
    let reloading = false;
    try {
      await claimHouseholdTask(await rowId());
      toast.success(`"${task.title}" jadi tugas kamu`);
    } catch (err) {
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
      // Taken offline, the photos may still be on this phone (Phase 138).
      // The row must not point at them until they are in storage.
      try {
        await ensureUploaded([beforeUrl, afterUrl]);
      } catch (err) {
        if (!(err instanceof PhotoNotUploadedError)) throw err;
        if (err.reason === "failed") toast.error("Ada foto yang rusak. Hapus lalu ambil ulang.");
        else toast.info("Foto tersimpan di HP. Selesaikan lagi setelah ada sinyal.");
        return;
      }
      const id = await rowId();
      await updateHouseholdTaskStatus(id, "completed", {
        before_photo_url: beforeUrl,
        after_photo_url: afterUrl,
        // Kept in step with after_photo_url so anything still reading the
        // original single-photo column — an older phone that has not reloaded
        // the bundle — still finds the proof where it expects it.
        photo_url: afterUrl,
      });
      clearChoreDraft(draftKey);
      toast.success(`"${task.title}" selesai ✅`);
      onOpenChange(false);
    } catch (err) {
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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{task.title}</SheetTitle>
          <SheetDescription>
            {categoryLabel(task.category, "id")} ·{" "}
            {task.due_time ? formatTime12h(task.due_time) : "Kapan saja hari ini"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {task.notes && (
            <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
              {task.notes}
            </p>
          )}

          {supervised && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <Eye className="mt-0.5 size-4 shrink-0" />
              <span>
                Tugas ini harus dikerjakan bersama Pemilik. Tunggu Pemilik datang dulu,
                jangan dikerjakan sendiri.
              </span>
            </p>
          )}

          {done ? (
            <>
              <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <CheckCircle2 className="size-4 shrink-0" /> Tugas ini sudah selesai.
              </p>
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
                title="Foto Sebelum"
                hint="Saat mulai bekerja, sebelum apa pun dibersihkan."
                url={beforeUrl}
              >
                <PhotoPicker
                  offline
                  pathPrefix={pathPrefix}
                  value={beforeUrl}
                  onChange={setBeforeUrl}
                  onBusyChange={setUploadingBefore}
                  label="Ambil Foto Sebelum"
                  busyLabel="Menyimpan foto..."
                  errorMessage="Gagal mengunggah foto"
                  className="min-h-[52px] w-full"
                />
              </ProofStep>

              <ProofStep
                step={2}
                title="Foto Sesudah"
                hint="Saat selesai, dari sudut yang sama dengan foto sebelum."
                url={afterUrl}
              >
                <PhotoPicker
                  offline
                  pathPrefix={pathPrefix}
                  value={afterUrl}
                  onChange={setAfterUrl}
                  onBusyChange={setUploadingAfter}
                  label="Ambil Foto Sesudah"
                  busyLabel="Menyimpan foto..."
                  errorMessage="Gagal mengunggah foto"
                  className="min-h-[52px] w-full"
                />
              </ProofStep>

              {!mine && (
                <p className="text-[11px] text-muted-foreground">
                  Tugas ini untuk petugas lain, tapi kamu tetap bisa menyelesaikannya kalau
                  sudah dikerjakan.
                </p>
              )}
            </>
          )}
        </div>

        {!done && !unassigned && (
          <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
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
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
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
          <p className="text-xs text-muted-foreground">
            {url && takenAt ? `Diambil ${formatTime12h(takenAt)}` : hint}
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
