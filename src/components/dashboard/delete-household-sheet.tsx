"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { supabase } from "@/lib/supabase/client";

/**
 * The one confirmation before a household is scheduled for deletion (R7).
 * Says what goes and what stays, offers the download first, and asks for
 * the household's name typed out — the database checks it again.
 */
export function DeleteHouseholdSheet({
  open,
  onClose,
  householdName,
  onScheduled,
  onDownload,
}: {
  open: boolean;
  onClose: () => void;
  householdName: string;
  onScheduled: () => Promise<void>;
  onDownload: () => void;
}) {
  const t = useT();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useBackToClose(open, onClose);

  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const matches = typed.trim().toLowerCase() === householdName.trim().toLowerCase() && typed.trim() !== "";

  async function confirm() {
    if (!supabase || !matches) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("schedule_household_deletion", { p_confirm_name: typed });
      if (error) throw error;
      toast.success(t("Deletion scheduled for 7 days from now", "Penghapusan dijadwalkan 7 hari lagi"));
      await onScheduled();
    } catch (err) {
      console.error(err);
      const message = (err as { message?: string })?.message;
      toast.error(
        message === "name_mismatch"
          ? t("That name doesn't match.", "Nama itu tidak cocok.")
          : message === "founder_only"
            ? t("Only the person who created this household can delete it.", "Hanya orang yang membuat rumah tangga ini yang bisa menghapusnya.")
            : t("Couldn't schedule the deletion. Check your connection and try again.", "Penghapusan gagal dijadwalkan. Periksa internet, lalu coba lagi.")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{t(`Delete “${householdName}”?`, `Hapus “${householdName}”?`)}</SheetTitle>
          <SheetDescription>
            {t(
              "Everything goes, for everyone: pets, routines, chores, kitchen, staff, logs and photos. Staff phones are signed out.",
              "Semuanya terhapus, untuk semua orang: hewan, rutinitas, tugas, dapur, staf, catatan, dan foto. HP staf akan keluar."
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <p className="text-sm text-gray-700">
            {t(
              "It happens 7 days from now. Until then the other admins are told and anyone can cancel. Your Google sign-in stays, so you can start a new household later.",
              "Penghapusan terjadi 7 hari lagi. Sampai saat itu admin lain diberi tahu dan siapa pun bisa membatalkan. Akun Google Anda tetap ada, jadi Anda bisa membuat rumah tangga baru nanti."
            )}
          </p>
          <button
            type="button"
            onClick={onDownload}
            className="self-start text-sm font-medium text-gray-900 underline underline-offset-4"
          >
            {t("Download a copy first", "Unduh salinan dulu")}
          </button>
          <div className="flex flex-col gap-1.5 pt-1">
            <Label htmlFor="confirm-household-name" className="text-sm">
              {t(`Type “${householdName}” to confirm`, `Ketik “${householdName}” untuk konfirmasi`)}
            </Label>
            <Input
              id="confirm-household-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="min-h-11"
            />
          </div>
          <Button
            variant="destructive"
            className="mt-2 min-h-12 rounded-xl text-base"
            disabled={busy || !matches}
            onClick={() => void confirm()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {t("Delete in 7 days", "Hapus dalam 7 hari")}
          </Button>
          <Button variant="outline" className="min-h-12 rounded-xl text-base" disabled={busy} onClick={onClose}>
            {t("Cancel", "Batal")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
