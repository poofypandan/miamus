"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CircleAlert, Loader2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { hasUnsavedWork, signOutThisDevice } from "@/lib/sign-out";
import { LEGAL } from "@/config/legal";

/**
 * "Sign out of Miamus?" — the one confirmation before signing out (owner
 * request, 2026-11-08). Says what happens: the household stays, this phone
 * forgets it, and how to come back. Warns first if something logged on this
 * phone hasn't been saved yet.
 *
 * Owners only (owner, 2026-11-08): a staff phone is the household's tool,
 * and an accidental sign-out would lock staff out. Staff leave through the
 * owner instead — archiving a person, or removing a linked phone, signs that
 * phone out.
 */
export function SignOutSheet({
  open,
  onClose,
  lang,
  account,
}: {
  open: boolean;
  onClose: () => void;
  lang: "en" | "id";
  /** Shown under the title: the owner's email. */
  account?: string | null;
}) {
  const [unsaved, setUnsaved] = useState(false);
  const [busy, setBusy] = useState(false);
  // A second tap on the row that opened this sheet must not land on "Sign
  // out" (found in the browser check): the button wakes up a moment after the
  // sheet opens, and Cancel — not Sign out — sits where that tap falls.
  const [armed, setArmed] = useState(false);
  useBackToClose(open, onClose);

  useEffect(() => {
    if (!open) {
      setArmed(false);
      return;
    }
    let cancelled = false;
    void hasUnsavedWork().then((value) => {
      if (!cancelled) setUnsaved(value);
    });
    const timer = window.setTimeout(() => setArmed(true), 700);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open]);

  const id = lang === "id";
  const comeBack = id
    ? "Rumah tangga dan semua datanya tetap aman. Masuk lagi kapan saja dengan Google. Notifikasi di HP ini berhenti sampai Anda masuk lagi."
    : "Your home and everything in it stay safe. Sign in again any time with Google. Notifications on this phone stop until you do.";

  async function confirm() {
    setBusy(true);
    try {
      await signOutThisDevice();
    } catch (err) {
      console.error(err);
      setBusy(false);
      toast.error(
        id
          ? "Belum bisa keluar. Periksa internet, lalu coba lagi."
          : "Couldn't sign out. Check your connection and try again."
      );
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{id ? "Keluar dari Miamus di HP ini?" : "Sign out of Miamus on this phone?"}</SheetTitle>
          {account && <SheetDescription>{account}</SheetDescription>}
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <p className="text-sm text-gray-700">{comeBack}</p>
          {unsaved && (
            <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {id
                ? "Ada catatan atau foto yang belum terkirim. Tunggu sampai internet tersambung, atau catatan itu akan hilang."
                : "Some logs or photos haven't been sent yet. Wait until you're back online, or they'll be lost."}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {id
              ? `Ingin mengunduh atau menghapus data rumah tangga? Buka Pengaturan → Data Anda. Pertanyaan lain: ${LEGAL.contactEmail}.`
              : `Want to download or delete your household's data? Open Settings → Your data. Anything else: ${LEGAL.contactEmail}.`}
          </p>
          <Button
            variant="destructive"
            className="mt-2 min-h-12 rounded-xl text-base"
            disabled={busy || !armed}
            onClick={() => void confirm()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
            {id ? "Keluar" : "Sign out"}
          </Button>
          <Button variant="outline" className="min-h-12 rounded-xl text-base" disabled={busy} onClick={onClose}>
            {id ? "Batal" : "Cancel"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
