"use client";

import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { REMIND_CHOICES, remindLabel } from "@/lib/chore-reminders";
import { cn } from "@/lib/utils";

/**
 * The choice chips on Kakak's card (04, PR 5): lifted paper when chosen and
 * the warm track when not, as FilterPill does since PR 2. Black stays for
 * the one action, Looks right.
 */
export const KAKAK_CHIP = "min-h-9 rounded-full px-3.5 text-sm font-medium disabled:opacity-50";
export const KAKAK_CHIP_ON =
  "bg-card font-semibold text-foreground shadow-[0_1px_2px_rgb(60_40_20/0.1),0_3px_8px_-3px_rgb(60_40_20/0.14)]";
export const KAKAK_CHIP_OFF = "bg-muted text-muted-foreground active:bg-muted/70";

/**
 * "Remind me" on Kakak's chore card (migrations/137): Off, On the day, or 1,
 * 3 or 7 days before — the chore form's choices and words. A tap changes
 * the card on the phone, with no call to the AI; the 07:05 push does the
 * rest once it's saved.
 */
export function KakakRemindChips({
  value,
  disabled,
  onChange,
}: {
  value: number | null;
  disabled: boolean;
  onChange: (days: number | null) => void;
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const label = t("Remind me", "Ingatkan saya");
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t pt-3" role="group" aria-label={label}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {REMIND_CHOICES.map((days) => {
          const on = value === days;
          return (
            <button
              key={days ?? "off"}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onChange(days)}
              className={cn(
                KAKAK_CHIP,
                on ? KAKAK_CHIP_ON : KAKAK_CHIP_OFF
              )}
            >
              {remindLabel(days, locale)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
