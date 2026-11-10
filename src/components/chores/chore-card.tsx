"use client";

import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  CloudUpload,
  Eye,
  NotebookPen,
  Pencil,
  Repeat,
  UserRound,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChoreProofPhotos, hasChoreProof } from "@/components/chores/chore-proof-photos";
import { LocationTag } from "@/components/chores/location-tag";
import { AGENDA_TONES, DONE_TONE } from "@/lib/agenda-tones";
import {
  categoryClass,
  categoryIcon,
  categoryLabel,
} from "@/lib/household-tasks";
import {
  recurrenceOf,
  taskRepeatLabel,
  type ChoreOccurrence,
} from "@/lib/chore-recurrence";
import { dayKeyLabel } from "@/lib/date-label";
import { useFormatTime } from "@/components/ui/ui-labels";
import { cn } from "@/lib/utils";

// Both views render the same card, so the two dictionaries live together and
// cannot drift — the Phase 46 language boundary is a difference in wording,
// not a reason for two components that then diverge in behaviour.
const COPY = {
  en: {
    anytime: "Anytime today",
    unassigned: "Anyone",
    forYou: "For you",
    note: "Note",
    supervision: "Wait for an owner",
    done: "Done",
    waiting: "Waiting to send",
    overdue: (label: string) => `Carried over from ${label}`,
  },
  id: {
    anytime: "Kapan saja hari ini",
    unassigned: "Siapa saja",
    forYou: "Untuk Anda",
    note: "Catatan",
    supervision: "Tunggu pemilik rumah",
    done: "Selesai",
    waiting: "Menunggu dikirim",
    overdue: (label: string) => `Belum selesai dari ${label}`,
  },
} as const;

/**
 * One chore on one day, as both the owner's dashboard and a staff phone draw
 * it (Phase 100).
 *
 * Presentational only: every action belongs to whoever rendered it and arrives
 * through `footer`. That is what lets the staff view hand it a "Selesaikan"
 * button and the owner's hand it nothing at all, without this component
 * knowing which of them it is inside — the owner/staff capability split is a
 * property of the caller, not something re-decided here.
 */
export function ChoreCard({
  occurrence,
  locale,
  assigneeName,
  locationName,
  onPress,
  footer,
  action,
  compact = false,
  editable = false,
  today,
  waitingToSend = false,
}: {
  occurrence: ChoreOccurrence;
  locale: "en" | "id";
  /** Resolved by the caller, which owns the staff roster. */
  assigneeName?: string | null;
  /** The chore's room (Phase 135), resolved by the caller likewise. */
  locationName?: string | null;
  /** Makes the whole card tappable — the owner's way into the editor. */
  onPress?: () => void;
  footer?: ReactNode;
  /**
   * What tapping does, said on the card (Phase 130) — the staff list's
   * "Ketuk untuk foto". Sits at the end of the badge row, so it costs no
   * height; shown only while the chore is still open.
   */
  action?: ReactNode;
  /**
   * A finished chore as small as it gets (Phase 131), for the staff list's
   * Selesai section: no notes, no inline before/after pair — a "Lihat foto"
   * cue instead, and the photos one tap away in the sheet.
   */
  compact?: boolean;
  /**
   * Says on the card that tapping it edits the chore (Phase 136) — the
   * owner's Chores list, where the whole card opens the editor and nothing
   * said so.
   */
  editable?: boolean;
  /** For the "carried over from …" label; defaults to the real today. */
  today?: Date;
  /**
   * Finished on this phone and not sent yet (Phase 161): the save waits on
   * the phone and goes by itself.
   */
  waitingToSend?: boolean;
}) {
  const formatTime = useFormatTime();
  const t = COPY[locale];
  const { task, status, overdue } = occurrence;
  const CategoryIcon = categoryIcon(task.category);
  const recurrence = recurrenceOf(occurrence.template);
  const supervised = !!task.requires_supervision;
  const done = status === "completed";

  const body = (
    <>
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-sm font-medium break-words",
              // No strikethrough (Phase 131): it made a finished title hard to
              // read, and the green face and the tick already say "done".
              done && "text-muted-foreground"
            )}
          >
            {task.title}
          </span>
          {/* Where, straight under what (Phase 135) — kept on a finished
              compact card too: it is how one chore is told from another. */}
          {/* Readable on purpose (audit B1, item 5): the room at 13px and
              wrapped, never cut off; the note at 14px in normal ink under a
              small label. The note was the smallest, lightest text on the
              card, and it is the instruction. */}
          {locationName && <LocationTag name={locationName} muted={done} wrap className="mt-0.5 text-[13px]" />}
          {task.notes && !(compact && done) && (
            <span className="mt-1.5 flex flex-col gap-0.5 rounded-lg bg-muted/60 px-2.5 py-1.5">
              <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <NotebookPen className="size-3 shrink-0" aria-hidden />
                {t.note}
              </span>
              <span
                className={cn(
                  "text-sm leading-snug break-words whitespace-pre-line",
                  done ? "text-muted-foreground" : "text-gray-900"
                )}
              >
                {task.notes}
              </span>
            </span>
          )}
        </span>
        {done && <CheckCircle2 className={cn("mt-0.5 size-4 shrink-0", DONE_TONE.check)} />}
        {/* A span, not a button: the card is already the button. */}
        {editable && !done && (
          <span className="-mt-0.5 -mr-0.5 flex h-7 shrink-0 items-center gap-1 rounded-full bg-background/80 px-2.5 text-xs font-medium text-gray-700 ring-1 ring-border">
            <Pencil className="size-3" />
            {locale === "en" ? "Edit" : "Ubah"}
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className={cn("h-5 gap-1 px-1.5 text-[10px]", categoryClass())}>
          <CategoryIcon className="size-3" />
          {categoryLabel(task.category, locale)}
        </Badge>

        <Badge variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
          <Clock className="size-3" />
          {task.due_time ? formatTime(task.due_time) : t.anytime}
        </Badge>

        <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-normal">
          {task.assigned_to ? (
            <>
              <UserRound className="size-3" /> {assigneeName ?? t.forYou}
            </>
          ) : (
            <>
              <Users className="size-3" /> {t.unassigned}
            </>
          )}
        </Badge>

        {recurrence !== "none" && (
          <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px] font-normal">
            <Repeat className="size-3" />
            {taskRepeatLabel(occurrence.template, locale)}
          </Badge>
        )}

        {/* The one amber thing on a chore (Phase 153 colour rule: amber means
            waiting): it changes what a staff member should do — wait, rather
            than start. */}
        {supervised && (
          <Badge className="h-5 gap-1 bg-amber-700 px-1.5 text-[10px] text-white">
            <Eye className="size-3" />
            {t.supervision}
          </Badge>
        )}

        {action && !done && <span className="ml-auto">{action}</span>}
        {/* Amber means waiting (Phase 153 colour rule). */}
        {done && waitingToSend && (
          <Badge className="h-5 gap-1 bg-amber-100 px-1.5 text-[10px] text-amber-900">
            <CloudUpload className="size-3" />
            {t.waiting}
          </Badge>
        )}

        {compact && done && occurrence.row && hasChoreProof(occurrence.row) && (
          <span className="ml-auto flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
            Lihat foto <ChevronRight className="size-3.5" />
          </span>
        )}
      </div>

      {/* Only ever shown on today's list, where it is the explanation for a
          chore whose own date has passed (see expandChores). */}
      {overdue && !done && (
        <p className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
          <AlertTriangle className="size-3.5 shrink-0" />
          {t.overdue(dayKeyLabel(occurrence.date, today, locale))}
        </p>
      )}

      {/* The proof, on the card itself: one side-by-side picture rather
          than thumbnails tucked into a footer (Phase 113). */}
      {done && !compact && occurrence.row && (
        <ChoreProofPhotos row={occurrence.row} locale={locale} interactive={!onPress} />
      )}

      {footer}
    </>
  );

  const className = cn(
    "flex w-full flex-col gap-2 rounded-xl border p-3 text-left",
    // A plain card for an open chore (Phase 153; amber since Phase 112), white
    // even inside the red "Belum selesai" frame. Done turns green, like a
    // finished routine (Phase 114).
    done ? DONE_TONE.tint : cn("bg-card", AGENDA_TONES.chore.tint)
  );

  if (!onPress) return <div className={className}>{body}</div>;

  return (
    <button type="button" onClick={onPress} className={cn(className, "active:bg-muted/60")}>
      {body}
    </button>
  );
}
