"use client";

import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { REMIND_CHOICES, remindLabel } from "@/lib/chore-reminders";
import { cn } from "@/lib/utils";

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
      <p className="text-xs text-muted-foreground">{label}</p>
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
                "min-h-9 rounded-full border px-3 text-sm disabled:opacity-50",
                on ? "border-primary bg-primary text-primary-foreground" : "text-gray-700 active:bg-muted"
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
