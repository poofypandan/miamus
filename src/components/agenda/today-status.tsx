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
      <Icon className={cn("mt-0.5 size-6 shrink-0", ok ? "text-emerald-700" : "text-amber-700")} aria-hidden />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-lg leading-tight font-semibold", ok ? "text-emerald-800" : "text-amber-900")}>
          {title}
        </span>
        {detail && <span className="text-[13px] text-gray-600">{detail}</span>}
      </span>
    </>
  );
  const className = cn(
    "flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left animate-view-fade motion-reduce:animate-none",
    ok ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50"
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
