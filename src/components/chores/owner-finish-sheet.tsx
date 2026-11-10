"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CloudUpload, Loader2, Pencil, RotateCcw, UserRound } from "lucide-react";
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
import { useFormatTime } from "@/components/ui/ui-labels";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useQueuedPhoto } from "@/hooks/use-queued-photo";
import { useFinishMyChore } from "@/hooks/use-finish-my-chore";
import { useLocationName } from "@/hooks/use-household-locations";
import { choreDraftKey, clearChoreDraft, readChoreDraft, writeChoreDraft } from "@/lib/chore-draft";
import {
  RECURRENCE_LABELS_EN,
  RECURRENCE_LABELS_ID,
  recurrenceOf,
  type ChoreOccurrence,
} from "@/lib/chore-recurrence";
import { photoTakenAt } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * An admin's own chore, opened from "My tasks" on Today (Phase 163): mark it
 * done, optionally with the before and after photos staff take, mark it not
 * done again, or edit it.
 *
 * Owner-facing, in the owner's language. The staff view keeps its own
 * sheet (FinishChoreSheet), unchanged: photos stay required there, and it
 * remains how an owner sees what a staff phone sees.
 *
 * Photos are both or none (migrations/136): with one in, Mark done waits for
 * the other.
 */
export function OwnerFinishSheet({
  occurrence,
  mode,
  open,
  onOpenChange,
  onEdit,
}: {
  occurrence: ChoreOccurrence | null;
  mode: "today" | "future" | "past";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (occurrence: ChoreOccurrence) => void;
}) {
  useBackToClose(open, () => onOpenChange(false));
  if (!occurrence) return null;
  // Keyed, so a second chore never inherits the first one's photos.
  return (
    <OwnerFinishBody
      key={occurrence.key}
      occurrence={occurrence}
      mode={mode}
      open={open}
      onOpenChange={onOpenChange}
      onEdit={onEdit}
    />
  );
}

function OwnerFinishBody({
  occurrence,
  mode,
  open,
  onOpenChange,
  onEdit,
}: {
  occurrence: ChoreOccurrence;
  mode: "today" | "future" | "past";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (occurrence: ChoreOccurrence) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const formatTime = useFormatTime();
  const roomName = useLocationName();
  const { activeHouseholdId, memberProfile, pendingIds } = useHousehold();
  const { finish, reopen } = useFinishMyChore();
  const { task } = occurrence;
  const done = occurrence.status === "completed";
  const waiting = !!occurrence.row && pendingIds.has(occurrence.row.id);

  // Photos survive the tab being killed between the two, as on staff phones
  // (Phase 133): the same draft, keyed by the chore and the day.
  const draftKey = choreDraftKey(activeHouseholdId, occurrence.template.id, occurrence.date);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(() => readChoreDraft(draftKey)?.before ?? null);
  const [afterUrl, setAfterUrl] = useState<string | null>(() => readChoreDraft(draftKey)?.after ?? null);
  const [uploadingBefore, setUploadingBefore] = useState(false);
  const [uploadingAfter, setUploadingAfter] = useState(false);
  const [busy, setBusy] = useState(false);
  const uploading = uploadingBefore || uploadingAfter;
  const beforeState = useQueuedPhoto(beforeUrl).state;
  const afterState = useQueuedPhoto(afterUrl).state;
  const photoFailed = beforeState === "failed" || afterState === "failed";
  const onePhoto = !!beforeUrl !== !!afterUrl;

  useEffect(() => {
    if (done) return;
    writeChoreDraft(draftKey, { before: beforeUrl, after: afterUrl });
  }, [draftKey, beforeUrl, afterUrl, done]);

  async function markDone() {
    if (onePhoto || uploading || photoFailed) return;
    setBusy(true);
    const outcome = await finish(occurrence, beforeUrl && afterUrl ? { before: beforeUrl, after: afterUrl } : undefined);
    setBusy(false);
    if (!outcome) return;
    // Sent: nothing is owed any more. Kept on the phone: the queue clears
    // the draft once it has gone (useOfflineSync).
    if (outcome === "sent") clearChoreDraft(draftKey);
    onOpenChange(false);
  }

  async function markNotDone() {
    if (!occurrence.row) return;
    setBusy(true);
    const ok = await reopen(occurrence.row.id, {
      before: occurrence.row.before_photo_url ?? null,
      after: occurrence.row.after_photo_url ?? null,
    });
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  const recurrence = recurrenceOf(occurrence.template);
  const repeatLabel =
    recurrence === "none" ? null : (locale === "id" ? RECURRENCE_LABELS_ID : RECURRENCE_LABELS_EN)[recurrence];
  const where = roomName(task.location_id, task.spot);
  const details = [task.due_time ? formatTime(task.due_time) : t("Anytime", "Kapan saja"), where, repeatLabel]
    .filter(Boolean)
    .join(" · ");
  const forMe = !!memberProfile && task.assigned_to === memberProfile.id;
  const pathPrefix = `household/${occurrence.template.id}`;
  const canFinish = mode === "today" && !done;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{task.title}</SheetTitle>
          <SheetDescription>{details}</SheetDescription>
          {forMe && (
            <span className="mt-1 flex w-fit items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-gray-700">
              <UserRound className="size-3" aria-hidden /> {t("For you", "Untuk Anda")}
            </span>
          )}
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {task.notes && (
            <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">{task.notes}</p>
          )}

          {done ? (
            <>
              {waiting ? (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <CloudUpload className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {t(
                      "Done, saved on this phone. It will be sent when the signal is back.",
                      "Selesai, tersimpan di HP. Akan dikirim otomatis saat sinyal bagus."
                    )}
                  </span>
                </p>
              ) : (
                <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <CheckCircle2 className="size-4 shrink-0" /> {t("This chore is done.", "Tugas ini sudah selesai.")}
                </p>
              )}
              {occurrence.row && <ChoreProofPhotos row={occurrence.row} locale={locale} interactive />}
            </>
          ) : canFinish ? (
            <>
              <section className="flex flex-col gap-2">
                <h4 className="text-sm font-semibold text-gray-800">
                  {t("Add photos (optional)", "Tambah foto (opsional)")}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  <PhotoStep step={1} title={t("Before photo", "Foto sebelum")} url={beforeUrl}>
                    <PhotoPicker
                      offline
                      disabled={busy}
                      pathPrefix={pathPrefix}
                      value={beforeUrl}
                      onChange={setBeforeUrl}
                      onBusyChange={setUploadingBefore}
                      label={t("Take photo", "Ambil foto")}
                      locale={locale}
                      busyLabel={t("Saving…", "Menyimpan…")}
                      errorMessage={t("Couldn't upload the photo", "Gagal mengunggah foto")}
                      className="min-h-11 w-full"
                    />
                  </PhotoStep>
                  <PhotoStep step={2} title={t("After photo", "Foto sesudah")} url={afterUrl}>
                    <PhotoPicker
                      offline
                      disabled={busy}
                      pathPrefix={pathPrefix}
                      value={afterUrl}
                      onChange={setAfterUrl}
                      onBusyChange={setUploadingAfter}
                      label={t("Take photo", "Ambil foto")}
                      locale={locale}
                      busyLabel={t("Saving…", "Menyimpan…")}
                      errorMessage={t("Couldn't upload the photo", "Gagal mengunggah foto")}
                      className="min-h-11 w-full"
                    />
                  </PhotoStep>
                </div>
                <p className={cn("text-center text-xs", onePhoto ? "font-medium text-amber-800" : "text-muted-foreground")}>
                  {onePhoto
                    ? beforeUrl
                      ? t("Add the after photo too, or remove this one.", "Tambahkan foto sesudah, atau hapus foto ini.")
                      : t("Add the before photo too, or remove this one.", "Tambahkan foto sebelum, atau hapus foto ini.")
                    : t("Both photos, or none.", "Dua foto, atau tidak sama sekali.")}
                </p>
              </section>
            </>
          ) : mode === "future" ? (
            <p className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
              {t("You can mark it done on the day.", "Bisa ditandai selesai pada harinya.")}
            </p>
          ) : null}
        </div>

        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {canFinish && (
            <Button
              onClick={markDone}
              disabled={busy || uploading || onePhoto || photoFailed}
              className="min-h-12 rounded-xl"
            >
              {busy || uploading ? <Loader2 className="animate-spin" /> : photoFailed ? <AlertTriangle /> : <Check />}
              {uploading
                ? t("Saving photo…", "Menyimpan foto…")
                : photoFailed
                  ? t("Retake the broken photo", "Ambil ulang foto yang rusak")
                  : t("Mark done", "Tandai selesai")}
            </Button>
          )}
          {/* Past days too (Codex, PR #58): a carried-over chore finished
              today leaves today's list, and its own day is where it can be
              opened again once the Undo toast has gone. */}
          {done && occurrence.row && (
            <Button variant="outline" onClick={markNotDone} disabled={busy} className="min-h-12 rounded-xl">
              {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />} {t("Mark not done", "Tandai belum selesai")}
            </Button>
          )}
          {!done && (
            <Button
              variant="outline"
              onClick={() => {
                onOpenChange(false);
                onEdit(occurrence);
              }}
              className="min-h-12 rounded-xl"
            >
              <Pencil /> {t("Edit chore", "Ubah tugas")}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** One optional photo, numbered; green with the time once it is in. */
function PhotoStep({
  step,
  title,
  url,
  children,
}: {
  step: 1 | 2;
  title: string;
  url: string | null;
  children: React.ReactNode;
}) {
  const t = useT();
  const formatTime = useFormatTime();
  const takenAt = photoTakenAt(url);
  const failed = useQueuedPhoto(url).state === "failed";
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-xl border p-2.5",
        failed ? "border-red-200 bg-red-50/60" : url ? "border-emerald-200 bg-emerald-50/60" : "bg-card"
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            failed ? "bg-red-600 text-white" : url ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
          )}
        >
          {failed ? <AlertTriangle className="size-3.5" /> : url ? <Check className="size-3.5" /> : step}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{title}</span>
          {url && takenAt && (
            <span className="text-[11px] text-muted-foreground">
              {t(`Taken ${formatTime(takenAt)}`, `Diambil ${formatTime(takenAt)}`)}
            </span>
          )}
        </span>
      </div>
      {children}
    </div>
  );
}
