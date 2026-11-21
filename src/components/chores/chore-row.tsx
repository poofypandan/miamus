"use client";

import { useState } from "react";
import { Camera, Check, ChevronRight, TriangleAlert } from "lucide-react";
import { ChoreProofPhotos, hasChoreProof } from "@/components/chores/chore-proof-photos";
import { useFormatTime } from "@/components/ui/ui-labels";
import { recurrenceOf, taskRepeatLabel, type ChoreOccurrence } from "@/lib/chore-recurrence";
import { dayKeyLabel } from "@/lib/date-label";
import { cn } from "@/lib/utils";

/**
 * One chore on Home → Chores as a plain row (21 Nov; Fable's 07, section 2,
 * decision 3): the name and one quiet line, "09:00 · Sari · Teras · Every
 * day". A chore from an earlier day says "since 7 Nov" in that line; one that
 * waits for an owner ends with "Needs you at home" in amber with its mark,
 * the one thing here that is the owner's to do. A tap edits it.
 *
 * Done ones go quiet with a tick and stay where they are in the day. Their
 * photos, and a bill's payment, are a tap away beside the row, never a
 * button inside it.
 *
 * Owner-only: a staff phone keeps its task card (ChoreCard).
 */
export function ChoreRow({
  occurrence,
  locale,
  today,
  assigneeName,
  locationName,
  onEdit,
  onPayment,
  doneByName,
}: {
  occurrence: ChoreOccurrence;
  locale: "en" | "id";
  /** Today's date key, for "since 7 Nov". */
  today: Date;
  assigneeName: string | null;
  locationName: string | null;
  onEdit: () => void;
  /** A finished bill: its amount and receipt, owners only (Phase 164 PR B). */
  onPayment?: () => void;
  doneByName?: string | null;
}) {
  const id = locale === "id";
  const formatTime = useFormatTime();
  const [photosOpen, setPhotosOpen] = useState(false);
  const { task, status, overdue } = occurrence;
  const done = status === "completed";
  const row = occurrence.row;
  const repeats = recurrenceOf(occurrence.template) !== "none";

  const caption = done
    ? [
        doneByName ? (id ? `Selesai · ${doneByName}` : `Done · ${doneByName}`) : id ? "Selesai" : "Done",
        row?.completed_at ? formatTime(new Date(row.completed_at)) : null,
      ]
    : [
        task.due_time ? formatTime(task.due_time) : null,
        assigneeName ?? (id ? "Siapa saja" : "Anyone"),
        locationName,
        repeats ? taskRepeatLabel(occurrence.template, locale) : null,
        overdue ? `${id ? "sejak" : "since"} ${sinceLabel(dayKeyLabel(occurrence.date, today, locale), locale)}` : null,
      ];
  const line = caption.filter(Boolean).join(" · ");
  const proof = done && hasChoreProof(row);

  return (
    <div className="flex flex-col">
      <div className="flex items-center">
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left active:bg-muted"
        >
          {done && (
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-done-tint text-done" aria-hidden>
              <Check className="size-3.5" strokeWidth={2.5} />
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            <span className={cn("truncate text-[15px] leading-5 font-semibold", done ? "text-muted-foreground" : "text-gray-900")}>
              {done && <span className="sr-only">{id ? "Selesai: " : "Done: "}</span>}
              {task.title}
            </span>
            {line && <span className="truncate text-[13px] leading-5 text-muted-foreground">{line}</span>}
            {!done && task.requires_supervision && (
              <span className="flex items-center gap-1 text-[13px] leading-5 font-medium text-attention">
                <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
                {id ? "Perlu Anda di rumah" : "Needs you at home"}
              </span>
            )}
          </span>
          {!done && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
        </button>
        {(proof || onPayment) && (
          <div className="flex shrink-0 items-center gap-1 pr-2">
            {onPayment && (
              <button
                type="button"
                onClick={onPayment}
                className="min-h-11 rounded-lg px-2 text-[13px] font-medium text-gray-700 active:bg-muted"
              >
                {id ? "Pembayaran" : "Payment"}
              </button>
            )}
            {proof && (
              <button
                type="button"
                onClick={() => setPhotosOpen((v) => !v)}
                aria-expanded={photosOpen}
                aria-label={id ? `Foto: ${task.title}` : `Photos: ${task.title}`}
                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
              >
                <Camera className="size-4" />
              </button>
            )}
          </div>
        )}
      </div>
      {photosOpen && row && (
        <div className="px-3 pb-3">
          <ChoreProofPhotos row={row} locale={locale} interactive />
        </div>
      )}
    </div>
  );
}

/** "Yesterday" mid-line reads "since yesterday"; a date ("19 Nov") stays as it is. */
function sinceLabel(label: string, locale: "en" | "id"): string {
  const relative = locale === "id" ? ["Kemarin", "Hari ini", "Besok"] : ["Yesterday", "Today", "Tomorrow"];
  return relative.includes(label) ? label.toLowerCase() : label;
}
