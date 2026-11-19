"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useHousehold } from "@/context/household-context";
import { setChoreProof } from "@/hooks/use-chore-proof";
import { choreChangedMessage, choreSettledMessageId, isChoreAlreadySettled, isChoreChanged } from "@/lib/chore-settled";
import { recordChoreRefusal, refusalOf } from "@/lib/chore-refusals";
import { classifySubmitError, reloadForUpdate } from "@/lib/submit-errors";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";

/**
 * Finishing a chore with its two photos, from the staff card or the chore's
 * sheet (19 Nov, product change #2; moved here from finish-chore-sheet.tsx
 * unchanged). Staff-facing, so Bahasa Indonesia.
 *
 * `onClose`: the sheet closes after a finish or a refusal; the card has
 * nothing to close.
 */
export function useFinishChore(occurrence: ChoreOccurrence, draftKey: string, onClose?: () => void) {
  const { finishChore, refresh } = useHousehold();
  const [busy, setBusy] = useState(false);
  const { task } = occurrence;

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
  function refusedAsChanged(kind: "finish" | "claim", err: unknown, hadPhotos: boolean) {
    recordChoreRefusal(
      refusalOf(kind, { templateId: occurrence.template.id, rowId: occurrence.row?.id ?? null, date: occurrence.date }, err)
    );
    toast.info(choreChangedMessage("id", task.title, hadPhotos), { duration: 10_000 });
    onClose?.();
    void refresh({ silent: true });
  }

  /** Both photos, always (Phase 127): the database refuses a completion without them (migrations/104). */
  async function finish(before: string | null, after: string | null): Promise<void> {
    if (!before || !after) {
      toast.error(!before ? "Ambil foto sebelum dulu, sebelum mulai bekerja" : "Ambil foto sesudah dulu sebagai bukti");
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
        before,
        after,
        title: task.title,
      });
      if (queued) {
        toast.info("Tugas selesai, disimpan di HP. Akan dikirim otomatis saat sinyal bagus.");
      } else {
        setChoreProof(draftKey, { before: null, after: null });
        toast.success(`"${task.title}" selesai`);
      }
      onClose?.();
    } catch (err) {
      // Finished by someone else, or cancelled, before this reached the
      // server (audit M4): theirs stands, these photos are not used.
      if (isChoreAlreadySettled(err)) {
        setChoreProof(draftKey, { before: null, after: null });
        toast.info(choreSettledMessageId(err.state, task.title), { duration: 8000 });
        onClose?.();
        void refresh({ silent: true });
        return;
      }
      if (isChoreChanged(err)) {
        refusedAsChanged("finish", err, true);
        return;
      }
      const handled = explainFailure(err);
      reloading = handled === "reloading";
      if (!handled) toast.error("Gagal menyimpan. Foto tetap tersimpan, coba lagi.");
    } finally {
      if (!reloading) setBusy(false);
    }
  }

  return { busy, setBusy, finish, explainFailure, refusedAsChanged };
}
