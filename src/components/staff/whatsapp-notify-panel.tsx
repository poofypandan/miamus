"use client";

import { AlertTriangle, CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, generateWhatsAppLink } from "@/lib/utils";

const DEFAULT_DESCRIPTION =
  "Pemilik belum tentu langsung melihatnya. Kirim pesan supaya cepat ditanggapi.";
const DEFAULT_CTA = "Beri tahu Pemilik via WhatsApp";

/**
 * How the panel's badge reads at a glance.
 *
 * "success" is the routine confirmation: a proposal or a restock request was
 * filed and nothing is wrong. "urgent" is a sick dog — the report saved fine,
 * but a green tick is the wrong first thing to see, because it says "done"
 * about a situation whose whole point is that it isn't.
 *
 * Amber rather than red, matching the warning tint the rest of the app already
 * uses (the lapsed-approval notice, the low-stock badges); red is reserved for
 * destructive actions like deleting a photo.
 */
const TONES = {
  success: { icon: CheckCircle2, className: "bg-emerald-100 text-emerald-700" },
  urgent: { icon: AlertTriangle, className: "bg-amber-100 text-amber-700" },
} as const;

export type NotifyTone = keyof typeof TONES;

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
  description = DEFAULT_DESCRIPTION,
  ctaLabel = DEFAULT_CTA,
  tone = "success",
}: {
  title: string;
  /** Message body; the dashboard link is appended by generateWhatsAppLink. */
  message: string;
  onDone: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /**
   * Why it is worth sending. Defaults to the routine wording; a sick-dog
   * report overrides it, because "the owner might not see it right away"
   * badly undersells a health emergency (Phase 99).
   */
  description?: string;
  /** Defaults to the routine wording; overridden for an urgent report. */
  ctaLabel?: string;
  /** Defaults to the routine green tick; "urgent" swaps it for an amber warning. */
  tone?: NotifyTone;
}) {
  const { icon: ToneIcon, className: toneClass } = TONES[tone];

  return (
    <div className="flex flex-col items-center gap-4 py-6 text-center">
      <span
        className={cn(
          "flex size-14 items-center justify-center rounded-full",
          toneClass
        )}
      >
        <ToneIcon className="size-7" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
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
            <MessageCircle className="size-5" /> {ctaLabel}
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
