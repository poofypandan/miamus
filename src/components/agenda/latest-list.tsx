"use client";

import { ImageOff } from "lucide-react";
import { SyncedImg } from "@/components/shared/synced-img";
import { useFormatTime } from "@/components/ui/ui-labels";
import { useT } from "@/context/owner-locale-context";
import type { UnifiedAgendaEntry } from "@/lib/unified-agenda";

/** One finished thing: its photo, its name, who, and when. */
export interface LatestRow {
  key: string;
  title: string;
  photo: string | null;
  who: string | null;
  at: string | null;
  entry: UnifiedAgendaEntry;
}

/** What Latest lists, from the day's finished entries, the latest first. */
export function latestRows(entries: UnifiedAgendaEntry[], staffName: (id: string) => string): LatestRow[] {
  const rows = entries.map((entry): LatestRow => {
    if (entry.kind === "chore") {
      const task = entry.occurrence.task;
      return {
        key: entry.key,
        title: task.title,
        photo: task.after_photo_url ?? task.photo_url ?? null,
        who: task.completed_by ? staffName(task.completed_by) : null,
        at: task.completed_at ?? null,
        entry,
      };
    }
    const logs = entry.group.items.map((item) => item.log).filter((log) => log !== null);
    const last = logs.sort((a, b) => b.completed_at.localeCompare(a.completed_at))[0] ?? null;
    const pets = entry.group.items.map((item) => item.entityName).join(", ");
    return {
      key: entry.key,
      title: pets ? `${entry.group.title} · ${pets}` : entry.group.title,
      photo: logs.find((log) => log.photo_url)?.photo_url ?? null,
      who: last?.staff_id ? staffName(last.staff_id) : null,
      at: last?.completed_at ?? null,
      entry,
    };
  });
  return rows.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/**
 * Latest, behind Today's status card (Today v3, Fable's look): the calmest
 * list in the app, since it is where the owner sees the photos. One surface,
 * inset hairlines; the photo at the left, the task, who, and the time. No
 * tint, no coloured edge, no category icon: everything here is done.
 */
export function LatestList({ rows, onOpen }: { rows: LatestRow[]; onOpen: (row: LatestRow) => void }) {
  const t = useT();
  const formatTime = useFormatTime();
  return (
    <ul data-testid="latest-list" className="inset-rows flex flex-col overflow-hidden rounded-2xl bg-card shadow-card [--row-inset:4.5rem]">
      {rows.map((row) => (
        <li key={row.key}>
          <button
            type="button"
            onClick={() => onOpen(row)}
            className="flex min-h-[4.25rem] w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-muted/60"
          >
            {row.photo ? (
              <SyncedImg url={row.photo} size={160} alt="" className="size-11 shrink-0 rounded-xl bg-muted object-cover" />
            ) : (
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-subtle-foreground" aria-hidden>
                <ImageOff className="size-5" />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base font-semibold text-gray-900">{row.title}</span>
              <span className="truncate text-sm text-muted-foreground">{row.who ?? t("Done", "Selesai")}</span>
            </span>
            {row.at && (
              <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{formatTime(new Date(row.at))}</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
