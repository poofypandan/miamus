"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent as ReactTouchEvent,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { cn } from "@/lib/utils";
import { photoSrc } from "@/lib/photos";

// How far a finger must travel horizontally before the gesture counts as a
// swipe rather than a tap or a scroll that began on the photo.
const SWIPE_PX = 50;

/** One frame of the gallery, with the metadata shown alongside it. */
export interface LightboxItem {
  src: string | undefined;
  alt: string;
  title: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
}

/**
 * Full-size photo viewer, shared by the task-photo thumbnails and the pet
 * profile avatar so both behave identically.
 *
 * Takes an array and an opening index rather than one image: the owner's grid
 * is a gallery, and stepping through the day's photos should not mean closing
 * one and hunting for the next tile. A single image is simply a one-item
 * array, which is how the avatar callers use it — the counter and the
 * navigation controls hide themselves at that length.
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
  items,
  initialIndex = 0,
  onIndexChange,
}: {
  open: boolean;
  onClose: () => void;
  items: LightboxItem[];
  initialIndex?: number;
  // Told which frame is showing, for a caller whose own UI follows the photo —
  // the staff card's delete window belongs to the picture on screen, not the
  // one that was tapped.
  onIndexChange?: (index: number) => void;
}) {
  const [index, setIndex] = useState(initialIndex);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  useBackToClose(open, onClose);

  // Radix already pins <body> while a dialog is open, but this page scrolls on
  // <html> — so a drag starting on the backdrop still ran the feed underneath
  // (measured: 849px to 709px with the photo open). Locking the element that
  // actually scrolls is what stops that, and the previous inline value is put
  // back rather than blanked, so a caller that had its own lock keeps it.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, [open]);

  // Adjust-during-render rather than an effect, the same pattern as the reset
  // in low-stock-flag: opening on a different tile has to show that tile on the
  // very first paint, and an effect would paint the previous one first.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(initialIndex);
  }

  // Clamped on read: deleting the photo being viewed shortens the array under
  // us, and a stale index would otherwise read past the end.
  const current = items[Math.min(index, items.length - 1)];

  const step = useCallback(
    (delta: number) => setIndex((i) => Math.min(items.length - 1, Math.max(0, i + delta))),
    [items.length]
  );
  const handlePrev = useCallback(() => step(-1), [step]);
  const handleNext = useCallback(() => step(1), [step]);

  // Reported from an effect, never from inside the setIndex updater: an
  // updater must be free of side effects — React may run it more than once —
  // and calling a parent's setState from one drops updates. Measured: the
  // first swipe after opening did nothing at all.
  const notify = useRef(onIndexChange);
  notify.current = onIndexChange;
  useEffect(() => {
    if (!open) return;
    notify.current?.(Math.min(index, items.length - 1));
  }, [index, items.length, open]);

  // The dialog renders through a portal, so none of this is a DOM descendant
  // of the swipeable carousel — but React propagates events along the
  // component tree, not the DOM, and this lightbox is rendered from a
  // thumbnail inside that carousel. Without stopping them here, swiping to the
  // next photo also swiped the tab underneath from Daily Feed to Schedule
  // (measured before this guard). The carousel tracks pointer events, so those
  // are the ones that matter; touch is stopped alongside them for anything
  // else listening further up.
  function stopBubbling(event: ReactPointerEvent<HTMLElement> | ReactTouchEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    event.stopPropagation();
    const touch = event.changedTouches[0];
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function handleTouchEnd(event: ReactTouchEvent<HTMLDivElement>) {
    event.stopPropagation();
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = null;
    if (!start || !touch || items.length < 2) return;
    const dx = touch.clientX - start.x;
    // Compared against the vertical travel as well as the threshold: a tall
    // photo can be scrolled past, and a mostly-vertical drag must stay a
    // scroll rather than flicking to the next picture.
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(touch.clientY - start.y)) return;
    if (dx < 0) handleNext();
    else handlePrev();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (items.length < 2) return;
    if (event.key === "ArrowLeft") handlePrev();
    if (event.key === "ArrowRight") handleNext();
  }

  if (!current) return null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={handleKeyDown}
        // Bubble phase, not capture: anything inside the dialog still gets its
        // own handlers first, and only the trip onward is cut.
        onPointerDown={stopBubbling}
        onPointerMove={stopBubbling}
        onPointerUp={stopBubbling}
      >
        <DialogHeader className="gap-1 text-left">
          <DialogTitle className="text-base">{current.title}</DialogTitle>
          {current.description ? (
            <DialogDescription className="flex items-center gap-1.5">
              {current.description}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{current.alt}</DialogDescription>
          )}
        </DialogHeader>
        {/* touch-none: the swipe is handled here, so the browser's own gestures
            over the photo (back/forward navigation, pull-to-refresh) are turned
            off rather than competing with it. Safe because the page behind is
            locked while this is open — there is nothing to pan to. */}
        <div
          className="relative touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={stopBubbling}
          onTouchEnd={handleTouchEnd}
        >
          {/* Capped and contained rather than free-height: a tall portrait
              otherwise ran past the top and bottom of a centred dialog with no
              way to scroll to the rest of it. */}
          <LightboxImage src={current.src} alt={current.alt} />
          {items.length > 1 && (
            <>
              {/* Tap targets over the edges of the photo, for anyone who taps
                  rather than swipes and for desktop, where there is no swipe at
                  all. Transparent, so the picture is never covered by chrome;
                  the chevrons surface on hover, which touch never fires. */}
              {index > 0 && <NavZone side="left" label="Previous photo" onClick={handlePrev} />}
              {index < items.length - 1 && (
                <NavZone side="right" label="Next photo" onClick={handleNext} />
              )}
            </>
          )}
          {items.length > 1 && (
            <span className="absolute top-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium text-white tabular-nums backdrop-blur-[2px]">
              {Math.min(index, items.length - 1) + 1} / {items.length}
            </span>
          )}
        </div>
        {current.footer}
      </DialogContent>
    </Dialog>
  );
}

function NavZone({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "absolute inset-y-0 z-10 flex w-[30%] items-center",
        side === "left" ? "left-0 justify-start pl-2" : "right-0 justify-end pr-2"
      )}
    >
      <span className="sr-only">{label}</span>
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-full bg-black/45 text-white opacity-0 backdrop-blur-[2px] transition-opacity hover:opacity-100"
      >
        {side === "left" ? <ChevronLeft className="size-4" /> : <ChevronRight className="size-4" />}
      </span>
    </button>
  );
}


/**
 * The photo itself, opened without a loading gap (Phase 94).
 *
 * Starts on the same 320px thumbnail the feed just rendered — which is
 * already in the browser's cache, so it paints on the first frame — and swaps
 * to the 1280px copy the moment that has decoded. Usually there is nothing to
 * wait for: the prefetch warmed it while the thumbnail was on screen.
 *
 * The swap is a cross-fade of two stacked images rather than a src change on
 * one, so the picture never blanks between the two. Only opacity animates,
 * which the compositor can do without touching layout.
 */
function LightboxImage({ src, alt }: { src: string | undefined; alt: string }) {
  const thumb = photoSrc(src, 320);
  const full = photoSrc(src, 1280);
  const [fullLoaded, setFullLoaded] = useState(false);

  // Reset whenever the photo changes — stepping through a gallery must not
  // show the previous frame's high-res state.
  useEffect(() => {
    setFullLoaded(false);
  }, [src]);

  return (
    <div className="relative max-h-[70vh] w-full">
      {/* The placeholder is hidden from assistive tech: it and the real image
          are the same picture, and announcing it twice is noise. */}
      {!fullLoaded && thumb && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumb}
          alt=""
          aria-hidden
          className="max-h-[70vh] w-full rounded-lg bg-black/5 object-contain"
        />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={full}
        alt={alt}
        decoding="async"
        onLoad={() => setFullLoaded(true)}
        className={cn(
          "max-h-[70vh] w-full rounded-lg bg-black/5 object-contain transition-opacity duration-150",
          // Stacked exactly over the placeholder until it is ready, so the
          // swap costs no layout shift.
          fullLoaded ? "opacity-100" : "absolute inset-0 opacity-0"
        )}
      />
    </div>
  );
}
