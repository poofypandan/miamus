"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheck,
  CloudUpload,
  Loader2,
  MapPin,
  ReceiptText,
  Repeat,
} from "lucide-react";
import { useT } from "@/context/owner-locale-context";
import { useFormatTime } from "@/components/ui/ui-labels";
import { AGENDA_TONES, DONE_TONE } from "@/lib/agenda-tones";
import { recurrenceOf, type ChoreOccurrence } from "@/lib/chore-recurrence";
import { cn } from "@/lib/utils";

/**
 * "My tasks" on Today (Phase 163): the chores given to the admin looking at
 * the screen, above the household's list, so they can tick their own off
 * without switching to the staff view.
 *
 * Renders nothing when there are none: most owners, most days, see Today
 * exactly as before. When every one is done it folds to one green line.
 *
 * Today: a circle per open row finishes it (D3 A: no photos needed for an
 * admin's own chore); the row itself opens the sheet. A future day is
 * read-only, with no circles (D4 A). A past day has no circles either, but its
 * sheet can still mark a done chore not done.
 *
 * Owner-facing, in the owner's language.
 */
export function MyTasksCard({
  occurrences,
  mode,
  dayLabel,
  roomName,
  pendingIds,
  onFinish,
  onOpen,
  billLine,
}: {
  /** Already the admin's own, in order (myOccurrences). */
  occurrences: ChoreOccurrence[];
  mode: "today" | "future" | "past";
  /** "Tomorrow", "12 Nov": the future heading. */
  dayLabel: string;
  roomName: (locationId: string | null | undefined, spot?: string | null) => string | null;
  pendingIds: ReadonlySet<string>;
  /** Resolves true when saved (or kept on the phone to send). */
  onFinish: (occurrence: ChoreOccurrence) => Promise<boolean>;
  onOpen: (occurrence: ChoreOccurrence) => void;
  /** A bill's line (Phase 164 PR B): "Paid · Rp418.500", "Last time Rp412.000". */
  billLine?: (occurrence: ChoreOccurrence, done: boolean) => string | null;
}) {
  const t = useT();
  // Rows being saved right now show as done at once, and go back if the
  // save is refused.
  const [finishing, setFinishing] = useState<ReadonlySet<string>>(new Set());
  const [showDone, setShowDone] = useState(false);

  if (occurrences.length === 0) return null;

  const isDone = (o: ChoreOccurrence) => o.status === "completed" || finishing.has(o.key);
  const total = occurrences.length;
  const doneCount = occurrences.filter(isDone).length;
  const allDone = mode !== "future" && doneCount === total;

  async function finish(o: ChoreOccurrence) {
    if (finishing.has(o.key)) return;
    setFinishing((prev) => new Set(prev).add(o.key));
    await onFinish(o);
    // Saved: the row comes back completed from the household's state.
    // Refused: it is open again. Either way the overlay goes.
    setFinishing((prev) => {
      const next = new Set(prev);
      next.delete(o.key);
      return next;
    });
  }

  if (allDone && !showDone) {
    return (
      <button
        type="button"
        onClick={() => setShowDone(true)}
        aria-expanded={false}
        className={cn(
          "flex min-h-12 w-full items-center gap-2 rounded-xl border px-3 text-left text-sm font-medium text-emerald-800 active:bg-emerald-500/10",
          DONE_TONE.tint
        )}
      >
        <CheckCheck className={cn("size-4 shrink-0", DONE_TONE.icon)} aria-hidden />
        <span className="flex-1">
          {total === 1
            ? t("Your task is done", "Tugas Anda sudah selesai")
            : t(`Your ${total} tasks are done`, `${total} tugas Anda sudah selesai`)}
        </span>
        <ChevronDown className={cn("size-4 shrink-0", DONE_TONE.icon)} aria-hidden />
      </button>
    );
  }

  return (
    <section
      aria-label={t("My tasks", "Tugas saya")}
      className="flex flex-col gap-0.5 rounded-xl border bg-card p-1.5"
    >
      <header className="flex items-baseline justify-between gap-2 px-1.5 py-1">
        <h3 className="text-sm font-semibold text-gray-900">
          {mode === "future"
            ? total === 1
              ? t(`${dayLabel}, 1 task`, `${dayLabel}, 1 tugas`)
              : t(`${dayLabel}, ${total} tasks`, `${dayLabel}, ${total} tugas`)
            : t("My tasks", "Tugas saya")}
        </h3>
        {mode === "future" ? (
          <span className="text-xs text-muted-foreground">{t("My tasks", "Tugas saya")}</span>
        ) : allDone ? (
          <button
            type="button"
            onClick={() => setShowDone(false)}
            aria-expanded
            className="-my-1 -mr-1 flex min-h-8 items-center gap-0.5 rounded-lg px-1.5 text-xs font-medium text-muted-foreground active:bg-muted"
          >
            {t("Hide", "Sembunyikan")} <ChevronUp className="size-3.5" aria-hidden />
          </button>
        ) : (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t(`${doneCount} of ${total} done`, `${doneCount} dari ${total} selesai`)}
          </span>
        )}
      </header>
      {occurrences.map((o) => (
        <MyTaskRow
          key={o.key}
          occurrence={o}
          done={isDone(o)}
          saving={finishing.has(o.key)}
          waiting={!!o.row && pendingIds.has(o.row.id)}
          canFinish={mode === "today"}
          locationName={roomName(o.task.location_id, o.task.spot)}
          billLine={billLine?.(o, isDone(o)) ?? null}
          onFinish={() => void finish(o)}
          onOpen={() => onOpen(o)}
        />
      ))}
    </section>
  );
}

function MyTaskRow({
  occurrence,
  done,
  saving,
  waiting,
  canFinish,
  locationName,
  billLine,
  onFinish,
  onOpen,
}: {
  occurrence: ChoreOccurrence;
  done: boolean;
  saving: boolean;
  waiting: boolean;
  canFinish: boolean;
  locationName: string | null;
  billLine: string | null;
  onFinish: () => void;
  onOpen: () => void;
}) {
  const t = useT();
  const formatTime = useFormatTime();
  const { task } = occurrence;
  const repeats = recurrenceOf(occurrence.template) !== "none";
  const carried = occurrence.overdue && !done;

  return (
    <div
      className={cn(
        "flex min-h-12 items-center gap-1 rounded-lg border border-transparent pr-1",
        // The Today rows' done look: green, with the chore tone's thin edge.
        done && cn(DONE_TONE.tint, AGENDA_TONES.chore.doneEdge)
      )}
    >
      {canFinish && !done ? (
        <button
          type="button"
          onClick={onFinish}
          aria-label={
            task.category === "bill"
              ? t(`Mark paid: ${task.title}`, `Tandai sudah dibayar: ${task.title}`)
              : t(`Mark done: ${task.title}`, `Tandai selesai: ${task.title}`)
          }
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-zinc-400 active:bg-muted"
        >
          <Circle className="size-[22px]" strokeWidth={1.75} />
        </button>
      ) : (
        <span
          className={cn("flex size-11 shrink-0 items-center justify-center", done ? DONE_TONE.icon : "text-zinc-300")}
          aria-hidden
        >
          {saving ? (
            <Loader2 className="size-5 animate-spin" />
          ) : done ? (
            <CircleCheck className="size-[22px]" strokeWidth={1.75} />
          ) : (
            <Circle className="size-[22px]" strokeWidth={1.75} />
          )}
        </span>
      )}

      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 text-left text-sm active:bg-muted/60"
      >
        <span className="w-14 shrink-0 text-xs tabular-nums text-zinc-600">
          {task.due_time ? formatTime(task.due_time) : t("Anytime", "Kapan saja")}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate font-medium", done && "text-muted-foreground")}>{task.title}</span>
          {(locationName || repeats || waiting) && (
            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
              {locationName && (
                <>
                  <MapPin className="size-3 shrink-0" />
                  <span className={cn("truncate font-medium", !done && "text-gray-700")}>{locationName}</span>
                </>
              )}
              {repeats && <Repeat className="size-3 shrink-0" aria-label={t("Repeats", "Berulang")} />}
              {waiting && (
                <span className="flex items-center gap-1 text-amber-800">
                  <CloudUpload className="size-3 shrink-0" />
                  {t("Waiting to send", "Menunggu dikirim")}
                </span>
              )}
            </span>
          )}
          {billLine && (
            <span className={cn("flex items-center gap-1 truncate text-xs", done ? "text-emerald-700" : "text-muted-foreground")}>
              <ReceiptText className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{billLine}</span>
            </span>
          )}
          {carried && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <AlertTriangle className="size-3 shrink-0 text-red-600" />
              {t("carried over", "terbawa dari kemarin")}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
