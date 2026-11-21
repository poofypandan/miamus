"use client";

import { ChevronRight } from "lucide-react";
import { useT } from "@/context/owner-locale-context";
import { useFormatTime } from "@/components/ui/ui-labels";
import type { UnifiedAgendaEntry } from "@/lib/unified-agenda";

/**
 * "Next" on Today v3 (21 Nov; docs/private/landing/06, section 5): what
 * happens from here, three rows at most, on one surface. The heading's door
 * opens the whole day under it; a row opens its chore, or the whole day for
 * a routine.
 */
export function NextList({
  entries,
  heading,
  staffName,
  expanded,
  onToggleDay,
  onOpen,
}: {
  /** Open entries, in the day's order; the first three are shown. */
  entries: UnifiedAgendaEntry[];
  heading: string;
  staffName: (id: string) => string;
  /** The whole day is showing below. */
  expanded: boolean;
  onToggleDay: () => void;
  onOpen: (entry: UnifiedAgendaEntry) => void;
}) {
  const t = useT();
  const formatTime = useFormatTime();
  const shown = entries.slice(0, 3);
  return (
    <section aria-label={heading} data-testid="next-list" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">{heading}</h2>
        <button
          type="button"
          onClick={onToggleDay}
          aria-expanded={expanded}
          data-testid="whole-day"
          className="-mr-2 flex min-h-9 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-muted-foreground active:bg-muted"
        >
          {expanded ? t("Show less", "Tampilkan lebih sedikit") : t("See all", "Lihat semua")}
          <ChevronRight className={expanded ? "size-4 -rotate-90" : "size-4 rotate-90"} aria-hidden />
        </button>
      </div>
      {/* Open, the whole day below takes over: its rows aren't said twice. */}
      {expanded ? null : shown.length > 0 ? (
        <ul className="inset-rows flex flex-col overflow-hidden rounded-2xl bg-card shadow-card [--row-inset:5rem]">
          {shown.map((entry) => {
            // A dog's noon medicines are one routine: every one still to give.
            const title =
              entry.kind === "chore"
                ? entry.occurrence.task.title
                : entry.group.titles.length > 1
                  ? entry.group.titles.join(" · ")
                  : entry.group.title;
            const who =
              entry.kind === "chore"
                ? entry.occurrence.task.assigned_to
                  ? staffName(entry.occurrence.task.assigned_to)
                  : t("Anyone", "Siapa saja")
                : [...new Set(entry.group.items.map((item) => item.entityName))].join(", ");
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => onOpen(entry)}
                  className="flex min-h-[3.75rem] w-full items-center gap-3 px-4 py-2 text-left active:bg-muted/60"
                >
                  <span className="w-12 shrink-0 text-sm font-medium text-muted-foreground tabular-nums">
                    {entry.time ? formatTime(entry.time) : t("Any time", "Kapan saja")}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base font-semibold text-gray-900">{title}</span>
                    {who && <span className="truncate text-sm text-muted-foreground">{who}</span>}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-subtle-foreground" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-1 text-sm text-muted-foreground">{t("Nothing more today.", "Tidak ada lagi hari ini.")}</p>
      )}
    </section>
  );
}
