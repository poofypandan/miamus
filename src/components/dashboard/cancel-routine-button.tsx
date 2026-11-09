"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { categorizeSchedule, displayTitle } from "@/lib/schedule-categories";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { MasterSchedule, TaskEntity } from "@/types/database";

/**
 * Every row belonging to one routine, from today onward.
 *
 * A generated routine is flat rows — ten grooming visits are ten schedules
 * sharing a title — so deleting the one the owner tapped would leave the other
 * nine firing. Matching on pet + category + display title gathers the whole
 * group, and the date filter spares anything already in the past so history
 * stays intact.
 */
export function futureRowsForRoutine(
  schedules: MasterSchedule[],
  entity: TaskEntity,
  title: string,
  category: string
): MasterSchedule[] {
  const today = formatDateLocal(new Date());
  return schedules.filter(
    (s) =>
      s.entity_id === entity.id &&
      displayTitle(s) === title &&
      categorizeSchedule(s) === category &&
      // expires_at null means open-ended, so it certainly has future days.
      (!s.expires_at || s.expires_at >= today)
  );
}

// Owner-facing, in the language the owner chose (Phase 149).
export function CancelRoutineButton({
  entity,
  title,
  category,
}: {
  entity: TaskEntity;
  title: string;
  category: string;
}) {
  const { schedules, deleteSchedule, logTask } = useHousehold();
  const t = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useBackToClose(confirmOpen, () => setConfirmOpen(false));

  const doomed = futureRowsForRoutine(schedules, entity, title, category);
  if (doomed.length === 0) return null;

  async function cancel() {
    setBusy(true);
    try {
      for (const schedule of doomed) {
        await deleteSchedule(schedule.id);
      }

      // Staff have no push channel, so the cancellation is announced as an
      // ad-hoc entry on today's feed — the one surface they already watch.
      // Deliberately after the deletes and in its own try: a failed notice
      // must not make a completed cancellation look like it failed.
      try {
        await logTask({
          entity_id: entity.id,
          module: "pet",
          notes: `Jadwal Dibatalkan: ${title}`,
        });
      } catch (err) {
        console.error("Cancellation logged locally but the staff notice failed", err);
      }

      toast.success(
        t(
          `Cancelled ${title} — ${doomed.length} upcoming ${doomed.length === 1 ? "entry" : "entries"} removed`,
          `${title} dibatalkan — ${doomed.length} jadwal berikutnya dihapus`
        )
      );
      setConfirmOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(t("Failed to cancel routine", "Rutinitas gagal dibatalkan"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        aria-label={t(`Cancel ${title}`, `Batalkan ${title}`)}
        className="flex min-h-[32px] shrink-0 items-center rounded-lg px-1.5 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </button>

      <Dialog open={confirmOpen} onOpenChange={(open) => !open && setConfirmOpen(false)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>{t("Cancel this routine?", "Batalkan rutinitas ini?")}</DialogTitle>
            <DialogDescription>
              {t(
                `Removes ${doomed.length} upcoming ${doomed.length === 1 ? "occurrence" : "occurrences"} of ${title} for ${entity.name}. Past records are kept, and everyone sees a cancellation notice on today's feed.`,
                `Menghapus ${doomed.length} jadwal ${title} berikutnya untuk ${entity.name}. Catatan lama tetap disimpan, dan semua orang melihat pemberitahuan pembatalan di daftar hari ini.`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="min-h-[48px] flex-1"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              {t("Keep", "Biarkan")}
            </Button>
            <Button
              variant="destructive"
              className="min-h-[48px] flex-1"
              onClick={cancel}
              disabled={busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {t("Cancel", "Batalkan")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
