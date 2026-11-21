"use client";

import { useState } from "react";
import { ImageOff } from "lucide-react";
import { toast } from "sonner";
import { ChoreReviewLightbox, hasChoreProof } from "@/components/chores/chore-proof-photos";
import { logLightboxItem } from "@/components/dashboard/log-photo-thumbnail";
import { PhotoLightbox, type LightboxItem } from "@/components/dashboard/photo-lightbox";
import { useHousehold } from "@/context/household-context";
import { distinct, groupByPhoto } from "@/lib/photos";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { threePhotoState } from "@/lib/staff-agenda";
import type { TaskLog } from "@/types/database";
import { SyncedImg } from "@/components/shared/synced-img";
import { useFormatTime } from "@/components/ui/ui-labels";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
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
    const pets = [...new Set(entry.group.items.map((item) => item.entityName))].join(", ");
    // Every finished title (a dog's noon medicines), never just the group's.
    const what = entry.group.titles.length > 0 ? entry.group.titles.join(" · ") : entry.group.title;
    return {
      key: entry.key,
      title: pets ? `${what} · ${pets}` : what,
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
            className="flex min-h-[4.25rem] w-full items-center gap-3 px-3.5 py-2.5 text-left press-row"
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

/**
 * Latest's sheet, behind Today's status card: what has been finished today,
 * with its photos, the latest first. Back closes it, as it does every sheet
 * (Codex, PR #181). A finished chore opens its proof, the before and after
 * full screen with their times, as it does in the day's list: never the
 * editor (Phase 129; Codex, PR #181). A finished routine opens its photos
 * the same way its row in the day does, one frame per photo, named for what
 * it covers. One saved with no photos says so.
 */
export function LatestSheet({
  open,
  onClose,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  rows: LatestRow[];
}) {
  const t = useT();
  const locale = useOwnerLocale();
  const { schedules, logs, selectedDate } = useHousehold();
  const [reviewing, setReviewing] = useState<ChoreOccurrence | null>(null);
  const [gallery, setGallery] = useState<LightboxItem[] | null>(null);
  useBackToClose(open, onClose);

  function openRow(row: LatestRow) {
    if (row.entry.kind === "routine") {
      const group = row.entry.group;
      // A three-photo routine (a walk) keeps only its end photo on the item;
      // the start and arrival come from the day's logs, as on its row.
      const photoLogs =
        group.proof === "three"
          ? threePhotoState(group.items, logs, formatDateLocal(selectedDate)).logs
          : group.items.flatMap((item) => (item.log ? [item.log] : []));
      const itemOf = (log: TaskLog) =>
        group.items.find((item) => item.scheduleId === log.schedule_id && item.entityId === log.entity_id);
      const frames = groupByPhoto(photoLogs, (log) => log.photo_url).map(({ rows }) =>
        logLightboxItem({
          log: rows[0],
          title: distinct(rows.map((log) => itemOf(log)?.title ?? group.title)).join(" · "),
          entityName:
            distinct(rows.map((log) => itemOf(log)?.entityName).filter((name): name is string => !!name)).join(", ") ||
            undefined,
          schedules,
          lang: locale,
        })
      );
      if (frames.length > 0) setGallery(frames);
      else
        toast(
          row.who
            ? t(`Done by ${row.who}, no photo`, `Diselesaikan ${row.who}, tanpa foto`)
            : t("No photo was saved for this", "Tidak ada foto tersimpan untuk ini")
        );
      return;
    }
    const occurrence = row.entry.occurrence;
    if (hasChoreProof(occurrence.row)) {
      setReviewing(occurrence);
      return;
    }
    toast(
      row.who
        ? t(`Done by ${row.who}, no photos`, `Diselesaikan ${row.who}, tanpa foto`)
        : t("No photos were saved for this chore", "Tidak ada foto tersimpan untuk tugas ini")
    );
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{t("Latest", "Terbaru")}</SheetTitle>
          <SheetDescription>{t("Finished today, the latest first.", "Selesai hari ini, yang terbaru di atas.")}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <LatestList rows={rows} onOpen={openRow} />
        </div>
        <ChoreReviewLightbox
          row={reviewing?.row ?? null}
          open={reviewing !== null}
          onClose={() => setReviewing(null)}
          locale={locale}
        />
        {gallery && <PhotoLightbox open onClose={() => setGallery(null)} initialIndex={0} items={gallery} />}
      </SheetContent>
    </Sheet>
  );
}
