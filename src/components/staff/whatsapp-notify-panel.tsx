"use client";

import { CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateWhatsAppLink } from "@/lib/utils";

/**
 * The success state staff land on after sending something the owner has to act
 * on. The app has no push channel to the owner, so a report that only sits in
 * the database can go unseen for hours — this puts the nudge one tap away,
 * while the staff member still has the phone in hand.
 *
 * Staff-facing, so entirely Bahasa Indonesia per the Phase 46 language boundary.
 */
export function WhatsAppNotifyPanel({
  title,
  message,
  onDone,
  secondaryLabel,
  onSecondary,
}: {
  title: string;
  /** Message body; the dashboard link is appended by generateWhatsAppLink. */
  message: string;
  onDone: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
        <CheckCircle2 className="size-7" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-muted-foreground">
          Pemilik belum tentu langsung melihatnya. Kirim pesan supaya cepat ditanggapi.
        </p>
      </div>

      <div className="flex w-full flex-col gap-2">
        {/* A real link rather than a click handler calling window.open: popup
            blockers leave user-initiated anchors alone, and on a phone wa.me
            hands straight off to the WhatsApp app. Allowed to wrap: the
            staff proposal sheet is only ~290px wide on a phone, and the base
            Button's nowrap clipped the label and its icon there. */}
        <Button
          asChild
          className="h-auto min-h-[52px] w-full bg-emerald-700 py-3 text-base leading-snug whitespace-normal text-white hover:bg-emerald-800"
        >
          <a href={generateWhatsAppLink(message)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-5" /> Beri tahu Pemilik via WhatsApp
          </a>
        </Button>
        {secondaryLabel && onSecondary && (
          <Button variant="outline" className="min-h-[48px] w-full" onClick={onSecondary}>
            {secondaryLabel}
          </Button>
        )}
        <Button variant="ghost" className="min-h-[48px] w-full" onClick={onDone}>
          Selesai
        </Button>
      </div>
    </div>
  );
}
