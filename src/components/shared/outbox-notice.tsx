"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { CloudUpload, Unlink } from "lucide-react";
import { useHousehold } from "@/context/household-context";
import { outboxUnlinked, subscribeOutbox } from "@/lib/offline-queue";

const COPY = {
  id: {
    title: (n: number) => (n === 1 ? "1 catatan menunggu dikirim" : `${n} catatan menunggu dikirim`),
    body: "Sudah tersimpan di HP ini. Terkirim otomatis saat sinyal bagus — tidak perlu dicatat ulang.",
    unlinkedTitle: "HP ini tidak terhubung lagi ke rumah",
    unlinkedBody: (n: number) =>
      `${n} catatan tetap tersimpan di HP ini, tidak hilang. Masuk lagi, lalu catatan terkirim sendiri.`,
    staffAction: "Masuk dengan kode rumah",
  },
  en: {
    title: (n: number) => (n === 1 ? "1 save waiting to send" : `${n} saves waiting to send`),
    body: "Kept on this phone. It sends by itself when the signal is back — no need to enter it again.",
    unlinkedTitle: "This phone is no longer linked to the household",
    unlinkedBody: (n: number) =>
      `${n === 1 ? "1 save is" : `${n} saves are`} kept on this phone, not lost. Sign in again and they send by themselves.`,
    staffAction: "Sign in with the house code",
  },
} as const;

/**
 * Saves kept on this phone that have not reached the server yet (Phase 161,
 * lib/offline-queue.ts). Says they are safe and will go by themselves, so
 * nobody logs the same thing twice or waits by the router.
 *
 * Amber, like everything that means "waiting" (Phase 153). Staff copy in
 * Bahasa Indonesia; owners get their own language through `locale`.
 */
export function OutboxNotice({ locale, staff = false }: { locale: "id" | "en"; staff?: boolean }) {
  const { outboxCount } = useHousehold();
  // The server refused this phone's sign-in: it was unlinked (audit L4).
  const unlinked = useSyncExternalStore(subscribeOutbox, outboxUnlinked, () => false);
  if (outboxCount === 0) return null;
  const copy = COPY[locale];
  if (unlinked) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
        <Unlink className="mt-0.5 size-4 shrink-0 text-red-700" />
        <div className="min-w-0 flex-1 text-xs text-red-900">
          <p>
            <span className="font-medium">{copy.unlinkedTitle}.</span> {copy.unlinkedBody(outboxCount)}
          </p>
          {staff && (
            <Link href="/join/code" className="mt-1 inline-block font-medium underline underline-offset-2">
              {copy.staffAction}
            </Link>
          )}
        </div>
      </div>
    );
  }
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
    >
      <CloudUpload className="mt-0.5 size-4 shrink-0 text-amber-700" />
      <p className="min-w-0 flex-1 text-xs text-amber-900">
        <span className="font-medium">{copy.title(outboxCount)}.</span> {copy.body}
      </p>
    </div>
  );
}
