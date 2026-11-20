"use client";

import { Bell, ChevronRight, CircleCheckBig } from "lucide-react";
import { ProgressRing } from "@/components/agenda/progress-ring";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { statusDetail, statusLateLine, statusTitle, type DayTotals } from "@/lib/today-status";
import { cn } from "@/lib/utils";

/**
 * Today's first line (Phase 175, S3; Today v3, 21 Nov): the day's count in a
 * ring, "All on track" in calm green while nothing waits for the owner, "3
 * waiting for you" in amber otherwise, and under it only what the ring can't
 * say (late or not). The rules are in lib/today-status.
 *
 * A tap opens Latest: what has been finished today, with its photos
 * (06, section 5: "33 of 41" invites "which ones?"). Without that, a plain
 * line.
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
  /** Opens Latest. */
  onPress?: () => void;
}) {
  const locale = useOwnerLocale();
  const t = useT();
  const ok = waiting === 0;
  const title = statusTitle(waiting, locale);
  const detail = statusLateLine(totals, locale);
  const Icon = ok ? CircleCheckBig : Bell;
  const counted = statusDetail(totals, locale);

  const body = (
    <>
      {totals.total > 0 ? (
        <ProgressRing
          done={totals.done}
          total={totals.total}
          size={64}
          stroke={5}
          trackClass={ok ? "stroke-done/20" : "stroke-attention/20"}
          arcClass={ok ? "stroke-done" : "stroke-attention"}
        >
          <span className={cn("flex flex-col items-center leading-none tabular-nums", ok ? "text-done-foreground" : "text-attention")}>
            <span className="text-base font-semibold">{totals.done}</span>
            <span className="mt-0.5 text-xs">{t(`of ${totals.total}`, `dari ${totals.total}`)}</span>
          </span>
        </ProgressRing>
      ) : (
        <Icon className={cn("size-7 shrink-0", ok ? "text-done" : "text-attention")} aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* The screen's one large line (21 Nov, PR 4): 30 px, readable at arm's length. */}
        {/* Outside cn(): its class merger takes text-title for a colour and drops it. */}
        <span className={`text-title ${ok ? "text-done-foreground" : "text-attention"}`}>
          {title}
        </span>
        {detail && <span className="text-sm text-gray-600">{detail}</span>}
      </span>
      {onPress && <ChevronRight className="size-5 shrink-0 opacity-50" aria-hidden />}
    </>
  );
  const className = cn(
    // The done and attention tokens, no outline (21 Nov, PR 3). Waiting is
    // never said by the tint alone: its icon and dark text carry it.
    "flex w-full items-center gap-4 rounded-3xl px-5 py-4 text-left animate-view-fade motion-reduce:animate-none",
    ok ? "bg-done-tint text-done-foreground" : "bg-attention-tint/70 text-attention"
  );
  const label = [title, counted].filter(Boolean).join(". ");

  return onPress ? (
    <button
      type="button"
      onClick={onPress}
      data-testid="today-status"
      data-state={ok ? "ok" : "waiting"}
      aria-label={`${label}. ${t("Open what's been done", "Buka yang sudah selesai")}`}
      className={cn(className, "active:opacity-80")}
    >
      {body}
    </button>
  ) : (
    <div data-testid="today-status" data-state={ok ? "ok" : "waiting"} aria-label={label} className={className}>
      {body}
    </div>
  );
}
