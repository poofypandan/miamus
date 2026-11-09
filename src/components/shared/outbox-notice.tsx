"use client";

import { CloudUpload } from "lucide-react";
import { useHousehold } from "@/context/household-context";

const COPY = {
  id: {
    title: (n: number) => (n === 1 ? "1 catatan menunggu dikirim" : `${n} catatan menunggu dikirim`),
    body: "Sudah tersimpan di HP ini. Terkirim otomatis saat sinyal bagus — tidak perlu dicatat ulang.",
  },
  en: {
    title: (n: number) => (n === 1 ? "1 save waiting to send" : `${n} saves waiting to send`),
    body: "Kept on this phone. It sends by itself when the signal is back — no need to enter it again.",
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
export function OutboxNotice({ locale }: { locale: "id" | "en" }) {
  const { outboxCount } = useHousehold();
  if (outboxCount === 0) return null;
  const copy = COPY[locale];
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
