"use client";

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBackToClose } from "@/hooks/use-back-to-close";

/**
 * Full-size photo viewer, shared by the task-photo thumbnails and the pet
 * profile avatar so both behave identically.
 *
 * The image is deliberately width-constrained only — no object-cover, no fixed
 * aspect box — so it renders at its true proportions. A pet portrait is
 * usually the wrong shape for the square thumbnail it's cropped into, and
 * seeing the whole frame is the point of opening it.
 *
 * Owns its own history entry, so Back closes the photo and leaves whatever it
 * opened over (a sheet, a grid) exactly where it was.
 */
export function PhotoLightbox({
  open,
  onClose,
  src,
  alt,
  title,
  description,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  src: string | undefined;
  alt: string;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
}) {
  useBackToClose(open, onClose);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="text-base">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="flex items-center gap-1.5">{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{alt}</DialogDescription>
          )}
        </DialogHeader>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} className="w-full rounded-lg" />
        {footer}
      </DialogContent>
    </Dialog>
  );
}
