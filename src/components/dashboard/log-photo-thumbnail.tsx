"use client";

import {
  useRef,
  useState,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useHousehold } from "@/context/household-context";
import { PhotoLightbox, type LightboxItem } from "@/components/dashboard/photo-lightbox";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useTapGuard } from "@/hooks/use-tap-guard";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { categoryIcon, describeLog } from "@/lib/schedule-categories";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { MasterSchedule, TaskLog } from "@/types/database";

/**
 * One photo's lightbox frame: the pet leads, then the task with its category
 * icon and the time it was taken, with any note underneath.
 *
 * Exported because a gallery's frames are built by whoever owns the array —
 * the photo grid, a timeline row — and every frame has to read identically to
 * the one a single tap produces.
 */
export function logLightboxItem({
  log,
  title,
  entityName,
  schedules,
}: {
  log: TaskLog;
  title?: string;
  entityName?: string;
  schedules: MasterSchedule[];
}): LightboxItem {
  const described = describeLog(log, schedules);
  const eventTitle = title ?? described.title;
  const EventIcon = categoryIcon(described.category);
  const takenAt = formatTime12h(new Date(log.completed_at));
  return {
    src: log.photo_url ?? undefined,
    alt: entityName ? `${entityName} · ${eventTitle}` : eventTitle,
    title: entityName ?? eventTitle,
    description: (
      <>
        <EventIcon className="size-4 shrink-0" />
        {entityName ? (
          <span>
            {eventTitle} · {takenAt}
          </span>
        ) : (
          <span>{takenAt}</span>
        )}
      </>
    ),
    footer: log.notes ? <p className="text-sm text-muted-foreground">{log.notes}</p> : null,
  };
}

const LONG_PRESS_MS = 500;

interface LogPhotoThumbnailProps {
  log: TaskLog;
  // Optional: callers rendering an agenda row already hold the display title
  // and pass it. Anything else (the owner photo grid) leaves it out and gets
  // the real task name resolved from the log's schedule instead — that slot
  // used to be filled with the literal string "Photo".
  title?: string;
  entityName?: string;
  className: string;
  badge?: ReactNode;
  // Opens as a gallery rather than a lone photo: the caller passes every frame
  // it holds (a day's filtered grid, one timeline row's dogs) plus this
  // thumbnail's place in it, and the lightbox opens there with the rest
  // swipeable. Left out, the thumbnail opens just its own photo.
  gallery?: { items: LightboxItem[]; index: number };
}

// Tap opens a full-res lightbox; long-press asks to delete (which also
// undoes the task completion). Mirrors the pet-avatar gesture pattern —
// same timer approach, same touch-callout/select-none guards.
export function LogPhotoThumbnail({
  log,
  title,
  entityName,
  className,
  badge,
  gallery,
}: LogPhotoThumbnailProps) {
  const { userRole, deleteLogWithPhoto, schedules } = useHousehold();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const tap = useTapGuard();

  // The lightbox registers its own history entry inside PhotoLightbox; only
  // the delete confirmation needs one here.
  useBackToClose(confirmOpen, () => setConfirmOpen(false));

  const today = formatDateLocal(new Date());
  const canDelete = userRole === "owner" || formatDateLocal(new Date(log.completed_at)) === today;

  // Only the aria-label needs these now; the lightbox's own copy comes from
  // logLightboxItem so a gallery frame and a single tap read the same.
  const eventTitle = title ?? describeLog(log, schedules).title;

  function startPress() {
    longPressed.current = false;
    if (!canDelete) return;
    timerRef.current = setTimeout(() => {
      longPressed.current = true;
      setConfirmOpen(true);
    }, LONG_PRESS_MS);
  }

  function cancelPress() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function endPress() {
    cancelPress();
    // The finger travelled — this was a scroll that happened to start on a
    // photo, not a tap on it.
    if (tap.moved.current) return;
    if (!longPressed.current) setLightboxOpen(true);
  }

  function handleTouchStart(e: ReactTouchEvent<HTMLButtonElement>) {
    tap.touchProps.onTouchStart(e);
    startPress();
  }

  function handleTouchMove(e: ReactTouchEvent<HTMLButtonElement>) {
    tap.touchProps.onTouchMove(e);
    // Scrolling past a photo must never raise the delete confirmation either,
    // so the pending long-press dies the moment this becomes a scroll.
    if (tap.moved.current) cancelPress();
  }

  function handleTouchCancel() {
    tap.touchProps.onTouchCancel();
    cancelPress();
  }

  function handleMouseDown() {
    tap.reset();
    startPress();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteLogWithPhoto(log);
      toast.success("Task undone");
      setConfirmOpen(false);
      setLightboxOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete photo");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={endPress}
        onTouchCancel={handleTouchCancel}
        onMouseDown={handleMouseDown}
        onMouseUp={endPress}
        onMouseLeave={cancelPress}
        // Belt and braces: the lightbox opens from touchend, which runs before
        // click, but this also stops a suppressed tap bubbling to the carousel.
        onClick={(e) => tap.cancelled(e)}
        aria-label={
          entityName ? `View photo for ${entityName} · ${eventTitle}` : `View photo for ${eventTitle}`
        }
        className={cn(
          // touch-pan-y, not touch-none. touch-none told the browser to hand
          // this element every gesture, so a drag starting on a thumbnail
          // scrolled nothing at all — and since the grid is almost entirely
          // thumbnails, most of the page simply refused to scroll, then opened
          // a lightbox on release. Vertical panning now belongs to the page;
          // horizontal still reaches the carousel, and the long-press gesture
          // is unaffected because it needs a stationary finger anyway.
          "relative touch-pan-y select-none overflow-hidden [-webkit-touch-callout:none]",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={log.photo_url ?? undefined} alt="" className="h-full w-full object-cover" />
        {badge}
      </button>

      <PhotoLightbox
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        items={gallery ? gallery.items : [logLightboxItem({ log, title, entityName, schedules })]}
        initialIndex={gallery ? gallery.index : 0}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete this photo?</DialogTitle>
            <DialogDescription>
              This removes the photo and marks the task pending again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="min-h-[48px] flex-1"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="min-h-[48px] flex-1"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
