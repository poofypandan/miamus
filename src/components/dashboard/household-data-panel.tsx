"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteHouseholdSheet } from "@/components/dashboard/delete-household-sheet";
import { LEGAL } from "@/config/legal";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import type { HouseholdDeletionStatus } from "@/hooks/use-household-deletion";
import { downloadHouseholdExport } from "@/lib/household-export";
import { DATE_LOCALE } from "@/lib/owner-locale";
import { supabase } from "@/lib/supabase/client";

/**
 * Household → Your data (R7, migration 127): download a copy of everything
 * the household has recorded, and delete the household. Deletion is
 * scheduled 7 days out by the founder; any admin can cancel until then.
 *
 * Owner-facing, in the owner's language (Phase 149).
 */
export function HouseholdDataPanel({
  status,
  reload,
}: {
  status: HouseholdDeletionStatus | null;
  reload: () => Promise<void>;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const [exporting, setExporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const deleteDate = status?.deleteAfter
    ? new Date(status.deleteAfter).toLocaleDateString(DATE_LOCALE[locale], {
        weekday: "long",
        day: "numeric",
        month: "long",
      })
    : null;

  async function download() {
    setExporting(true);
    try {
      const outcome = await downloadHouseholdExport();
      if (outcome === "downloaded") toast.success(t("Your copy is downloading", "Salinan Anda sedang diunduh"));
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't make the copy. Check your connection and try again.", "Salinan gagal dibuat. Periksa internet, lalu coba lagi."));
    } finally {
      setExporting(false);
    }
  }

  async function cancelDeletion() {
    if (!supabase) return;
    setCancelling(true);
    try {
      const { error } = await supabase.rpc("cancel_household_deletion");
      if (error) throw error;
      toast.success(t("Deletion cancelled. Your household stays.", "Penghapusan dibatalkan. Rumah tangga Anda tetap ada."));
      await reload();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't cancel. Check your connection and try again.", "Gagal membatalkan. Periksa internet, lalu coba lagi."));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <h2 className="text-sm font-semibold text-gray-900">{t("Your data", "Data Anda")}</h2>

      {status?.scheduled && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            {t(`This household will be deleted on ${deleteDate}.`, `Rumah tangga ini akan dihapus pada ${deleteDate}.`)}
          </p>
          <p className="text-sm text-amber-900">
            {t(
              "Until then everything works as usual, and you can still download a copy. Any admin can cancel.",
              "Sampai saat itu semuanya berjalan seperti biasa, dan Anda masih bisa mengunduh salinan. Admin mana pun bisa membatalkan."
            )}
          </p>
          <Button
            variant="outline"
            className="min-h-11 rounded-xl bg-white"
            disabled={cancelling}
            onClick={() => void cancelDeletion()}
          >
            {cancelling && <Loader2 className="animate-spin" />}
            {t("Cancel deletion", "Batalkan penghapusan")}
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-gray-900">{t("Download a copy", "Unduh salinan")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Everything your household has recorded — pets, routines, chores, kitchen, staff and logs — in one file you can keep.",
              "Semua yang dicatat rumah tangga Anda — hewan, rutinitas, tugas, dapur, staf, dan catatan — dalam satu file yang bisa Anda simpan."
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              `Photos aren't in the file; each one is listed by name. For a copy of the photos, email ${LEGAL.contactEmail}.`,
              `Foto tidak ada di dalam file; setiap foto dicantumkan namanya. Untuk salinan foto, kirim email ke ${LEGAL.contactEmail}.`
            )}
          </p>
        </div>
        <Button className="min-h-11 rounded-xl" disabled={exporting || !supabase} onClick={() => void download()}>
          {exporting ? <Loader2 className="animate-spin" /> : <Download />}
          {t("Download", "Unduh")}
        </Button>
      </div>

      {status && !status.scheduled && (
        <div className="flex flex-col gap-2 pt-2">
          {status.canSchedule ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex min-h-[52px] items-center gap-3 rounded-xl border bg-card px-4 text-left text-sm active:bg-muted"
            >
              <Trash2 className="size-4 shrink-0 text-red-600" />
              <span className="font-medium text-red-600">{t("Delete this household", "Hapus rumah tangga ini")}</span>
            </button>
          ) : null}
          <p className="px-1 text-xs text-muted-foreground">
            {status.canSchedule
              ? t(
                  "Deletes the household and everything in it for everyone, 7 days after you confirm.",
                  "Menghapus rumah tangga dan semua isinya untuk semua orang, 7 hari setelah Anda konfirmasi."
                )
              : t(
                  "Only the person who created this household can delete it.",
                  "Hanya orang yang membuat rumah tangga ini yang bisa menghapusnya."
                )}
          </p>
        </div>
      )}

      {status && (
        <DeleteHouseholdSheet
          open={confirming}
          onClose={() => setConfirming(false)}
          householdName={status.householdName}
          onScheduled={async () => {
            setConfirming(false);
            await reload();
          }}
          onDownload={() => {
            setConfirming(false);
            void download();
          }}
        />
      )}
    </>
  );
}
