"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BellOff, BellRing, Loader2, Share, Sparkles, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { useStaffIdentity } from "@/components/auth/staff-login-gate";
import { useStaffProfiles } from "@/hooks/use-staff-profiles";
import type { StaffPush } from "@/hooks/use-staff-push";
import {
  readStaffPushSnooze,
  snoozeAfter,
  staffPushCardKind,
  writeStaffPushSnooze,
  type StaffPushCardKind,
  type StaffPushSnooze,
} from "@/lib/staff-push";

/**
 * Whether staff Today shows the notifications card, and which (D9). It takes
 * the one tip slot (#62): while it shows, StaffTipCard does not, so the
 * screen never gets busier. `ready` is false until both this phone's list and
 * its snooze are read, so neither card flashes in and out.
 */
export function useStaffPushCard(staffPush: StaffPush) {
  const { isHouseholdMember } = useHousehold();
  const { staffId } = staffPush;
  const [snooze, setSnooze] = useState<StaffPushSnooze | null>(null);

  useEffect(() => {
    setSnooze(staffId ? readStaffPushSnooze(staffId) : null);
  }, [staffId]);

  // Not available here (no session, offline, an older database): the tip
  // card goes ahead without waiting for the push status.
  const ready =
    isHouseholdMember ||
    (staffPush.loaded && (staffPush.people === null || (staffPush.status !== "loading" && snooze !== null)));
  const kind: StaffPushCardKind | null =
    ready && snooze
      ? staffPushCardKind({
          status: staffPush.status,
          isAdmin: isHouseholdMember,
          people: staffPush.people ?? null,
          staffId,
          snooze,
          now: Date.now(),
        })
      : null;

  function rest() {
    if (!staffId || !snooze) return;
    const next = snoozeAfter(staffPush.status, snooze, Date.now());
    writeStaffPushSnooze(staffId, next);
    setSnooze(next);
  }

  return { ready, kind, rest };
}

/**
 * The card on staff Today (Phase 166, staff-only, Bahasa Indonesia). It is
 * also the tutorial (D10): one card, with a "Yang baru" line, then gone.
 */
export function StaffPushCard({
  staffPush,
  kind,
  onRest,
}: {
  staffPush: StaffPush;
  kind: StaffPushCardKind;
  onRest: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function turnOn() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await staffPush.turnOnForMe();
      if (result === "on") toast.success("Notifikasi aktif di HP ini.");
      else if (result === "failed") toast.error("Notifikasi gagal diaktifkan. Coba lagi.");
      // denied: the card turns into "Notifikasi diblokir"; cancelled: nothing changed.
    } catch (err) {
      console.error(err);
      toast.error("Notifikasi gagal diaktifkan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = kind === "blocked" || kind === "unsupported" ? BellOff : kind === "ios" ? Share : BellRing;
  const title =
    kind === "blocked"
      ? "Notifikasi diblokir"
      : kind === "ios"
        ? "Notifikasi di iPhone"
        : kind === "unsupported"
          ? "Notifikasi"
          : "Aktifkan notifikasi";

  return (
    <section
      aria-label={title}
      className={`relative flex flex-col gap-2 rounded-xl border px-4 py-3 animate-view-fade motion-reduce:animate-none ${
        kind === "blocked" ? "border-amber-200 bg-amber-50/60" : "border-zinc-200 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={onRest}
        aria-label={kind === "turn-on" ? "Nanti saja" : "Tutup"}
        className="absolute top-1.5 right-1.5 flex size-9 items-center justify-center rounded-full text-muted-foreground active:bg-zinc-200"
      >
        <X className="size-4" />
      </button>
      <div className="flex gap-3 pr-8">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {kind === "turn-on" && (
            <>
              <p className="text-[13px] leading-snug text-gray-700">
                Dapat kabar di HP ini kalau ada tugas baru untuk Anda, atau admin menjawab permintaan Anda. Tidak
                ada notifikasi pukul 21.00–06.00.
              </p>
              {staffPush.people?.shared && (
                <p className="text-[13px] leading-snug text-gray-700">
                  HP ini dipakai bersama. Notifikasi hanya menyebut nama Anda.
                </p>
              )}
            </>
          )}
          {kind === "blocked" && (
            <p className="text-[13px] leading-snug text-gray-700">
              Izinkan notifikasi untuk Miamus di pengaturan HP atau browser.
            </p>
          )}
          {kind === "ios" && (
            <>
              <p className="text-[13px] leading-snug text-gray-700">
                Ketuk <Share className="inline size-3.5 -translate-y-px" aria-label="Bagikan" />{" "}
                <span className="font-medium">Bagikan</span>, lalu{" "}
                <SquarePlus className="inline size-3.5 -translate-y-px" aria-label="Tambahkan ke Layar Utama" />{" "}
                <span className="font-medium">Tambahkan ke Layar Utama</span>. Buka Miamus dari Layar Utama, lalu
                aktifkan notifikasi di sana.
              </p>
              <p className="text-xs text-muted-foreground">Di Layar Utama, masuk lagi dengan kode rumah dan PIN.</p>
            </>
          )}
          {kind === "unsupported" && (
            <p className="text-[13px] leading-snug text-gray-700">
              Notifikasi tidak bisa diaktifkan di browser ini. Buka Miamus di Chrome.
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        {kind === "turn-on" ? (
          <>
            <Button
              className="min-h-[44px] flex-1 rounded-lg"
              onClick={turnOn}
              disabled={busy || (staffPush.status === "off" && !staffPush.canEnable)}
            >
              {busy ? <Loader2 className="animate-spin" /> : <BellRing />}
              Aktifkan
            </Button>
            <Button variant="outline" className="min-h-[44px] flex-1 rounded-lg" onClick={onRest} disabled={busy}>
              Nanti saja
            </Button>
          </>
        ) : (
          <Button variant="outline" className="min-h-[44px] flex-1 rounded-lg" onClick={onRest}>
            Mengerti
          </Button>
        )}
      </div>
      <p className="flex items-center gap-1.5 border-t pt-2 text-xs text-muted-foreground">
        <Sparkles className="size-3.5 shrink-0" aria-hidden />
        Yang baru: Sekarang Miamus bisa memberi kabar lewat notifikasi.
      </p>
    </section>
  );
}

/**
 * After tapping a notification meant for someone else on this phone
 * (/staff?untuk=…): "Notifikasi ini untuk Sari." with the way to switch.
 * Nothing is shown in Sari's name until her PIN is entered (D5).
 */
export function StaffPushForSomeoneElse() {
  const router = useRouter();
  const untuk = useSearchParams().get("untuk");
  const { isHouseholdMember } = useHousehold();
  const { staffId, confirmPerson } = useStaffIdentity();
  const { profiles } = useStaffProfiles();
  const person = untuk ? (profiles ?? []).find((p) => p.id === untuk && !p.user_id) : undefined;

  if (isHouseholdMember || !untuk || !person || untuk === staffId) return null;

  function close() {
    router.replace("/staff");
  }

  return (
    <section
      aria-label={`Notifikasi ini untuk ${person.name}`}
      className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-2.5"
    >
      <BellRing className="size-4 shrink-0 text-sky-700" aria-hidden />
      <p className="min-w-0 flex-1 text-sm text-sky-900">Notifikasi ini untuk {person.name}.</p>
      <Button
        size="sm"
        variant="outline"
        className="min-h-[40px] shrink-0 rounded-lg bg-white"
        onClick={async () => {
          if (await confirmPerson({ id: person.id, name: person.name })) close();
        }}
      >
        Ganti ke {person.name}
      </Button>
      <button
        type="button"
        onClick={close}
        aria-label="Tutup"
        className="-mr-2 flex size-9 shrink-0 items-center justify-center rounded-full text-sky-700 active:bg-sky-100"
      >
        <X className="size-4" />
      </button>
    </section>
  );
}
