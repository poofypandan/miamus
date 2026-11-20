"use client";

import { Bell, CircleCheckBig } from "lucide-react";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { statusDetail, statusTitle, type DayTotals } from "@/lib/today-status";
import { cn } from "@/lib/utils";

/**
 * Today's first line (Phase 175, S3): "All on track" in calm green while
 * nothing waits for the owner, "3 waiting for you" in amber otherwise, and
 * the day's count under it. The rules are in lib/today-status.
 *
 * In a home with staff a tap opens Who did what; without staff there is
 * nothing behind it, so it is a plain line.
 *
 * Owner-facing, in the language the owner chose.
 */
export function TodayStatus({
  waiting,
  totals,
  onPress,
}: {
  /** Rows under "Waiting for you". */
  waiting: number;
  totals: DayTotals;
  /** Opens Who did what; absent in a home without staff. */
  onPress?: () => void;
}) {
  const locale = useOwnerLocale();
  const t = useT();
  const ok = waiting === 0;
  const title = statusTitle(waiting, locale);
  const detail = statusDetail(totals, locale);
  const Icon = ok ? CircleCheckBig : Bell;

  const body = (
    <>
      <Icon className={cn("mt-[3px] size-7 shrink-0", ok ? "text-done" : "text-attention")} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* The screen's one large line (21 Nov, PR 4): 30 px, readable at arm's length. */}
        {/* Outside cn(): its class merger takes text-title for a colour and drops it. */}
        <span className={`text-title ${ok ? "text-done-foreground" : "text-attention"}`}>
          {title}
        </span>
        {detail && <span className="text-sm text-gray-600">{detail}</span>}
      </span>
    </>
  );
  const className = cn(
    // The done and attention tokens, no outline (21 Nov, PR 3). Waiting is
    // never said by the tint alone: its icon and dark text carry it.
    "flex w-full items-start gap-3 rounded-2xl px-4 py-3.5 text-left animate-view-fade motion-reduce:animate-none",
    ok ? "bg-done-tint" : "bg-attention-tint/70"
  );

  return onPress ? (
    <button
      type="button"
      onClick={onPress}
      data-testid="today-status"
      data-state={ok ? "ok" : "waiting"}
      aria-label={[title, detail, t("Open who did what", "Buka siapa mengerjakan apa")].filter(Boolean).join(". ")}
      className={cn(className, "active:opacity-80")}
    >
      {body}
    </button>
  ) : (
    <div data-testid="today-status" data-state={ok ? "ok" : "waiting"} className={className}>
      {body}
    </div>
  );
}
