"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff, ChevronRight, Loader2, Moon, Send, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useStaffPush, type StaffPush } from "@/hooks/use-staff-push";
import { staffPushStatusLabel } from "@/lib/staff-push";
import { cn } from "@/lib/utils";

/**
 * "Notifikasi di HP ini", the last row of the Lapor sheet (D7). Not for an
 * admin in staff view, and not on a database without migrations/141.
 */
export function StaffPushRow({ onPress }: { onPress: () => void }) {
  const { isHouseholdMember } = useHousehold();
  const staffPush = useStaffPush();
  if (isHouseholdMember || !staffPush.available) return null;
  const label = staffPushStatusLabel(staffPush.status, staffPush.onForMe);
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1 text-left text-sm active:bg-muted"
    >
      <Bell className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 font-medium">Notifikasi di HP ini</span>
      {label && (
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            label === "Aktif"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : label === "Diblokir"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : "border-zinc-200 bg-zinc-50 text-zinc-600"
          )}
        >
          {label}
        </span>
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

const WHAT_IS_SENT = [
  "Tugas baru untuk Anda hari ini",
  "Tugas yang dipindah ke Anda",
  "Jawaban cuti dan usulan jadwal",
  "Laporan kerusakan yang sudah dicek",
];

/** The sheet itself (Bahasa Indonesia only): one switch per person, no per-event options. */
export function StaffPushSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const staffPush = useStaffPush();
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-md gap-0 rounded-t-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>Notifikasi di HP ini</SheetTitle>
          <SheetDescription>Kabar tentang tugas Anda, langsung di HP ini.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-6">
          <StaffPushSettings staffPush={staffPush} onClose={onClose} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StaffPushSettings({ staffPush, onClose }: { staffPush: StaffPush; onClose: () => void }) {
  const [busy, setBusy] = useState<"switch" | "test" | "all" | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const { status, onForMe, others, staffName, people } = staffPush;
  const canSwitch = status === "on" || status === "off";

  async function toggleMine() {
    if (busy) return;
    setBusy("switch");
    try {
      if (onForMe) {
        await staffPush.turnOffForMe();
        toast.success("Notifikasi mati untuk Anda di HP ini.");
      } else {
        const result = await staffPush.turnOnForMe(onClose);
        if (result === "on") toast.success("Notifikasi aktif di HP ini.");
        else if (result === "failed") toast.error("Notifikasi gagal diaktifkan. Coba lagi.");
      }
    } catch (err) {
      console.error(err);
      toast.error(onForMe ? "Notifikasi gagal dimatikan. Coba lagi." : "Notifikasi gagal diaktifkan. Coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (busy) return;
    setBusy("test");
    try {
      const sent = await staffPush.sendTest();
      if (sent === 0) {
        staffPush.markOff();
        toast.error("HP ini sudah tidak terdaftar. Aktifkan lagi notifikasinya.");
      } else {
        toast.success("Tes terkirim");
      }
    } catch (err) {
      console.error(err);
      toast.error("Tes gagal dikirim. Coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function offForEveryone() {
    if (busy) return;
    setBusy("all");
    try {
      await staffPush.turnOffForEveryone();
      setConfirmingAll(false);
      toast.success("Notifikasi mati di HP ini.");
    } catch (err) {
      console.error(err);
      toast.error("Notifikasi gagal dimatikan. Coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col">
      {people && !people.household_on && (
        <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Admin sedang mematikan notifikasi ke HP staf.
        </p>
      )}

      {status === "denied" && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
          <BellOff className="mt-px size-3.5 shrink-0" aria-hidden />
          Notifikasi diblokir. Izinkan notifikasi untuk Miamus di pengaturan HP atau browser.
        </p>
      )}
      {status === "ios-install-first" && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <Share className="mt-px size-3.5 shrink-0" aria-hidden />
          Ketuk Bagikan, lalu Tambahkan ke Layar Utama. Buka Miamus dari Layar Utama, lalu aktifkan notifikasi di
          sana.
        </p>
      )}
      {(status === "unsupported" || status === "unconfigured") && (
        <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Notifikasi tidak bisa diaktifkan di browser ini. Buka Miamus di Chrome.
        </p>
      )}

      {canSwitch && staffName && (
        <div className="flex items-center gap-3 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-sm font-medium">Untuk saya ({staffName})</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={onForMe}
            aria-label={`Untuk saya (${staffName})`}
            disabled={busy !== null || (status === "off" && !staffPush.canEnable)}
            onClick={toggleMine}
            className={cn(
              "relative flex h-7 w-12 shrink-0 items-center rounded-full disabled:opacity-50",
              onForMe ? "bg-primary" : "bg-muted"
            )}
          >
            {busy === "switch" ? (
              <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" />
            ) : (
              <span
                className={cn(
                  "size-6 rounded-full bg-white shadow-sm transition-transform",
                  onForMe ? "translate-x-[22px]" : "translate-x-0.5"
                )}
              />
            )}
          </button>
        </div>
      )}

      {status === "on" && others.length > 0 && (
        <p className="pb-3 text-xs text-muted-foreground">
          HP ini juga memberi kabar untuk: {others.map((p) => p.name).join(", ")}
        </p>
      )}

      <div className="border-t py-3">
        <p className="pb-1.5 text-sm font-medium">Yang dikabarkan</p>
        <ul className="flex list-disc flex-col gap-0.5 pl-5 text-[13px] text-gray-700">
          {WHAT_IS_SENT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      <div className="flex items-start gap-2 border-t py-3">
        <Moon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex flex-col">
          <p className="text-sm font-medium">Jam tenang</p>
          <p className="text-xs text-muted-foreground">Tidak ada notifikasi pukul 21.00–06.00.</p>
        </div>
      </div>

      {status === "on" && (
        <div className="flex flex-col gap-2 border-t pt-3">
          <Button variant="outline" className="min-h-[44px] rounded-lg" onClick={test} disabled={busy !== null}>
            {busy === "test" ? <Loader2 className="animate-spin" /> : <Send />}
            Kirim tes
          </Button>
          {confirmingAll ? (
            <div className="flex flex-col gap-2 rounded-lg border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Semua orang di HP ini tidak akan dapat notifikasi lagi.</p>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="min-h-[40px] flex-1 rounded-lg"
                  onClick={offForEveryone}
                  disabled={busy !== null}
                >
                  {busy === "all" && <Loader2 className="animate-spin" />}
                  Matikan
                </Button>
                <Button
                  variant="outline"
                  className="min-h-[40px] flex-1 rounded-lg"
                  onClick={() => setConfirmingAll(false)}
                  disabled={busy !== null}
                >
                  Batal
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="min-h-[40px] rounded-lg text-muted-foreground"
              onClick={() => setConfirmingAll(true)}
              disabled={busy !== null}
            >
              Matikan di HP ini (untuk semua)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
