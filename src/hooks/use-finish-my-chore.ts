"use client";

import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { dataProvider } from "@/lib/data";
import { classifySubmitError, reloadForUpdate } from "@/lib/submit-errors";
import { coverTakeover, type ChoreOccurrence } from "@/lib/chore-recurrence";

/** Both photos, or none (migrations/136). */
export interface MyChorePhotos {
  before: string;
  after: string;
}

/**
 * Finishing and un-finishing an admin's own chore from "My tasks" on Today
 * (Phase 163). Owner-facing, in the owner's language.
 *
 * Finishing goes through the same save queue as a staff phone's
 * (finishChore, Phase 161), so a weak signal keeps it on the phone rather
 * than losing it. With no photos it relies on migrations/136, which lets an
 * admin complete their own or an unassigned chore photo-free; staff still
 * need both.
 *
 * Sent at once, the toast offers Undo for five seconds; afterwards the sheet
 * has "Mark not done". A save still waiting on the phone can't be undone
 * until it has gone: undoing the server's copy first would be redone by the
 * queue's retry.
 */
export function useFinishMyChore() {
  const { finishChore, updateHouseholdTask, updateHouseholdTaskStatus, pendingIds, memberProfile } = useHousehold();
  const t = useT();
  // Read at the moment of a tap, not from the render that made the toast.
  const pendingRef = useRef(pendingIds);
  useEffect(() => {
    pendingRef.current = pendingIds;
  }, [pendingIds]);

  /** Says what went wrong; true when a reload is under way. */
  const explain = useCallback(
    (err: unknown): boolean => {
      console.error(err);
      const failure = classifySubmitError(err);
      if (failure === "update" && reloadForUpdate()) {
        toast.info(t("Miamus was updated. Reloading…", "Miamus diperbarui. Memuat ulang…"));
        return true;
      }
      toast.error(
        failure === "other"
          ? t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi.")
          : t("No connection. Try again in a moment.", "Koneksi terputus. Coba lagi sebentar lagi.")
      );
      return false;
    },
    [t]
  );

  const reopen = useCallback(
    async (rowId: string, photos?: { before: string | null; after: string | null }): Promise<boolean> => {
      if (pendingRef.current.has(rowId)) {
        toast.info(t("Still sending. Try again in a moment.", "Masih dikirim. Coba lagi sebentar lagi."));
        return false;
      }
      try {
        await updateHouseholdTaskStatus(rowId, "pending");
      } catch (err) {
        explain(err);
        return false;
      }
      // Photos the admin added are no use to a chore that is open again;
      // best effort, as with a deleted log's photo.
      for (const url of [photos?.before, photos?.after]) {
        if (url) void dataProvider.deletePhoto(url).catch((err) => console.error("Could not delete a chore photo", err));
      }
      return true;
    },
    [updateHouseholdTaskStatus, explain, t]
  );

  const finish = useCallback(
    async (occurrence: ChoreOccurrence, photos?: MyChorePhotos): Promise<"sent" | "queued" | null> => {
      const title = occurrence.task.title;
      try {
        // A chore covered for someone on leave is mine on screen but still
        // theirs in the database: take that day over first, as its own edit,
        // or the photo-free completion is refused (migrations/136). A repeat
        // whose first day lives on the template is finished with photos
        // instead; the sheet says so and the circle opens it.
        const cover = photos ? { kind: "none" as const } : coverTakeover(occurrence, memberProfile?.id);
        if (cover.kind === "needsPhotos") {
          toast.error(t("This one needs both photos.", "Tugas ini perlu dua foto."));
          return null;
        }
        if (cover.kind === "takeover" && memberProfile) {
          await updateHouseholdTask(cover.rowId, { assigned_to: memberProfile.id });
        }
        const { queued, task } = await finishChore({
          templateId: occurrence.template.id,
          date: occurrence.date,
          rowId: occurrence.row?.id ?? null,
          assignedTo: occurrence.task.assigned_to,
          before: photos?.before ?? null,
          after: photos?.after ?? null,
          title,
        });
        if (queued || !task) {
          toast.info(
            t(
              "Done, saved on this phone. It will be sent when the signal is back.",
              "Selesai, tersimpan di HP. Akan dikirim otomatis saat sinyal bagus."
            )
          );
          return "queued";
        }
        toast.success(t(`Done: ${title}`, `Selesai: ${title}`), {
          duration: 5000,
          action: {
            label: t("Undo", "Batalkan"),
            onClick: () => {
              void reopen(task.id, { before: task.before_photo_url ?? null, after: task.after_photo_url ?? null });
            },
          },
        });
        return "sent";
      } catch (err) {
        explain(err);
        return null;
      }
    },
    [finishChore, updateHouseholdTask, memberProfile, reopen, explain, t]
  );

  return { finish, reopen };
}
