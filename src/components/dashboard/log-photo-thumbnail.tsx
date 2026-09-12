"use client";

import { useRef, useState, type ReactNode } from "react";
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
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { TaskLog } from "@/types/database";

const LONG_PRESS_MS = 500;

interface LogPhotoThumbnailProps {
  log: TaskLog;
  title: string;
  entityName?: string;
  className: string;
  badge?: ReactNode;
}

// Tap opens a full-res lightbox; long-press asks to delete (which also
// undoes the task completion). Mirrors the pet-avatar gesture pattern —
// same timer approach, same touch-callout/select-none guards.
export function LogPhotoThumbnail({ log, title, entityName, className, badge }: LogPhotoThumbnailProps) {
  const { userRole, deleteLogWithPhoto } = useHousehold();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const today = formatDateLocal(new Date());
  const canDelete = userRole === "owner" || formatDateLocal(new Date(log.completed_at)) === today;

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
    if (!longPressed.current) setLightboxOpen(true);
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
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={cancelPress}
        aria-label={`View photo for ${title}`}
        className={cn(
          "relative touch-none select-none overflow-hidden [-webkit-touch-callout:none]",
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={log.photo_url ?? undefined} alt="" className="h-full w-full object-cover" />
        {badge}
      </button>

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>
            {entityName ? `${entityName} · ` : ""}
            {title} · {formatTime12h(new Date(log.completed_at))}
          </DialogTitle>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={log.photo_url ?? undefined} alt="" className="w-full rounded-lg" />
          {log.notes && <p className="text-sm text-muted-foreground">{log.notes}</p>}
        </DialogContent>
      </Dialog>

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
