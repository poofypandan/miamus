"use client";

import { useId, useState, type ReactNode } from "react";
import { CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const COPY = {
  en: { title: "Completed", show: "Show", hide: "Hide" },
  id: { title: "Selesai", show: "Lihat", hide: "Tutup" },
} as const;

/**
 * The bottom of the staff list (Phase 131): everything finished today,
 * folded away.
 *
 * Phase 114 sank finished work below what was still open; it still made the
 * list longer with every task done, until by evening the day was a scroll of
 * green past the two things that were left. Here it is one line — "Selesai ·
 * 8" — closed by default, so the list is only ever as long as what remains.
 * Opening it is for checking, not working: the rows inside are the compact
 * ones, and a tap opens the same sheet as always.
 *
 * Collapsed by default every time the view mounts. Deliberately not
 * remembered: a staff member opens it to check something and is done with it;
 * coming back to a list already full of finished work would undo the point.
 * Closed, its rows are not rendered at all.
 *
 * The mirror image of OverdueSection: same frame, green instead of red, and
 * at the other end of the day.
 */
export function CompletedSection({
  count,
  locale,
  children,
}: {
  count: number;
  locale: "en" | "id";
  children: ReactNode;
}) {
  const t = COPY[locale];
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  return (
    <section
      aria-label={`${t.title} (${count})`}
      className="flex flex-col gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex min-h-[40px] items-center gap-1.5 rounded-lg px-1 text-left active:bg-emerald-500/10"
      >
        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
        <h3 className="text-sm font-semibold text-emerald-800">
          {t.title} · {count}
        </h3>
        <span className="ml-auto text-[11px] font-medium text-emerald-700">
          {open ? t.hide : t.show}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-emerald-700 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div id={bodyId} className="flex flex-col gap-1.5">
          {children}
        </div>
      )}
    </section>
  );
}
