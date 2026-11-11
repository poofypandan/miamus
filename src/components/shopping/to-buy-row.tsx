"use client";

import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

/** One thing to buy: a round tick on the left, like a checklist. */
export function ToBuyRow({
  title,
  detail,
  out = false,
  tickLabel,
  onTick,
}: {
  title: string;
  detail: string;
  out?: boolean;
  tickLabel: string;
  onTick: () => void;
}) {
  return (
    <div className="flex min-h-[56px] items-center gap-3 pr-3">
      <button
        type="button"
        onClick={onTick}
        aria-label={tickLabel}
        className="flex size-12 shrink-0 items-center justify-center text-muted-foreground active:text-gray-900"
      >
        <Circle className="size-5" />
      </button>
      <span className="flex min-w-0 flex-1 flex-col py-2">
        <span className="truncate text-sm font-medium">{title}</span>
        {detail && (
          <span className={cn("truncate text-xs", out ? "text-red-700" : "text-muted-foreground")}>
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}
