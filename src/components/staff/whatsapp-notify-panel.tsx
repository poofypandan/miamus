"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BellRing, CheckCircle2, MessageCircle } from "lucide-react";
import { dataProvider } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { cn, generateWhatsAppLink } from "@/lib/utils";

const DEFAULT_DESCRIPTION =
  "Admin belum tentu langsung melihatnya. Kirim pesan supaya cepat ditanggapi.";
const DEFAULT_CTA = "Beri tahu Admin via WhatsApp";

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
 * on. A report that only sits in the database can go unseen for hours, so this
 * puts a WhatsApp nudge one tap away, while the staff member still has the
 * phone in hand.
 *
 * Leave and schedule suggestions push the admins since Phase 165
 * (migrations/139): with `checkAdminPush`, the panel asks whether an admin
 * will get that push and, if so, says "Admin sudah diberi tahu" and keeps
 * WhatsApp as a smaller second option.
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
  linkPath,
  checkAdminPush = false,
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
  /** Where the link in the message leads; the dashboard when omitted. */
  linkPath?: string;
  /** Leave and suggestions: ask whether an admin gets a push (Phase 165). */
  checkAdminPush?: boolean;
}) {
  const { icon: ToneIcon, className: toneClass } = TONES[tone];
  const [pushed, setPushed] = useState(false);
  useEffect(() => {
    if (!checkAdminPush) return;
    let live = true;
    dataProvider
      .requestsPushOn()
      .then((on) => live && setPushed(on))
      // Unknown: keep the WhatsApp wording, which is never wrong.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [checkAdminPush]);

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
        {pushed && (
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-emerald-800">
            <BellRing className="size-4 shrink-0" aria-hidden />
            Admin sudah diberi tahu lewat notifikasi.
          </p>
        )}
      </div>

      <div className="flex w-full flex-col gap-2">
        {/* A real link rather than a click handler calling window.open: popup
            blockers leave user-initiated anchors alone, and on a phone wa.me
            hands straight off to the WhatsApp app. Allowed to wrap: the
            staff proposal sheet is only ~290px wide on a phone, and the base
            Button's nowrap clipped the label and its icon there. */}
        {pushed ? (
          <Button asChild variant="outline" className="min-h-[48px] w-full">
            <a href={generateWhatsAppLink(message, linkPath)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-4" /> Kirim WA juga
            </a>
          </Button>
        ) : (
          <Button
            asChild
            className="h-auto min-h-[52px] w-full bg-emerald-700 py-3 text-base leading-snug whitespace-normal text-white hover:bg-emerald-800"
          >
            <a href={generateWhatsAppLink(message, linkPath)} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="size-5" /> {ctaLabel}
            </a>
          </Button>
        )}
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
