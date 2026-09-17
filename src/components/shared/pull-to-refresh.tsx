"use client";

import { useRef, useState, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

// How far the finger must travel (after damping) before a release syncs.
const THRESHOLD_PX = 60;
// Past this the content stops following the finger — the pull has already
// armed, and unlimited travel just looks broken.
const MAX_PULL_PX = 96;
// Where the spinner parks while the sync runs.
const RESTING_PX = 56;
// A gesture is only a pull if it is clearly downward; anything flatter belongs
// to the dashboard's horizontal tab swipe or the date ribbon's sideways scroll.
const DIRECTION_SLOP_PX = 8;

/**
 * The phone gesture everyone already knows, wired to a soft resync.
 *
 * Native pull-to-refresh is switched off app-wide (globals.css) because it
 * reloads the whole PWA, which on a staff phone can mean losing queued offline
 * logs. This puts the gesture back, but it refetches the household's data in
 * place instead — nothing reloads, nothing is lost.
 *
 * Only pulls that start at the very top of the page and travel clearly
 * downward are taken; everything else is left alone, so the swipeable tabs and
 * the scrolling date ribbon underneath keep working untouched.
 */
export function PullToRefresh({
  onRefresh,
  children,
  className,
}: {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  className?: string;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Null whenever no candidate gesture is in flight. `armed` flips once the
  // gesture has proven itself vertical, so the first few pixels can still be
  // claimed by a horizontal swipe.
  const gesture = useRef<{ startX: number; startY: number; armed: boolean } | null>(null);

  function handleTouchStart(event: ReactTouchEvent<HTMLDivElement>) {
    // Mid-sync, or already scrolled down: not a pull.
    if (refreshing || window.scrollY > 0) {
      gesture.current = null;
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    gesture.current = { startX: touch.clientX, startY: touch.clientY, armed: false };
  }

  function handleTouchMove(event: ReactTouchEvent<HTMLDivElement>) {
    const start = gesture.current;
    const touch = event.touches[0];
    if (!start || !touch) return;

    const dy = touch.clientY - start.startY;
    const dx = touch.clientX - start.startX;

    if (!start.armed) {
      // Upward, or sideways: hand the gesture back for good.
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
        gesture.current = null;
        return;
      }
      if (dy < DIRECTION_SLOP_PX) return;
      start.armed = true;
    }

    // The page can scroll away under a slow pull (a finger that drifts up
    // first); once it does this is a scroll, not a pull.
    if (window.scrollY > 0) {
      gesture.current = null;
      setPull(0);
      return;
    }

    // Halved, so the content feels weighted rather than glued to the finger.
    setPull(Math.min(MAX_PULL_PX, dy / 2));
  }

  async function handleTouchEnd() {
    const start = gesture.current;
    gesture.current = null;
    if (!start?.armed) return;

    if (pull < THRESHOLD_PX) {
      setPull(0);
      return;
    }

    // Held at the resting offset for the duration, so the spinner has somewhere
    // to sit and the release doesn't read as "nothing happened".
    setRefreshing(true);
    setPull(RESTING_PX);
    try {
      await onRefresh();
    } catch (err) {
      // Whatever was on screen stays on screen; the caller owns any message.
      console.error("Pull-to-refresh failed", err);
    } finally {
      setRefreshing(false);
      setPull(0);
    }
  }

  const active = pull > 0 || refreshing;
  // Full turn by the time the threshold is reached, so the icon itself shows
  // how much further there is to pull.
  const rotation = refreshing ? 0 : (pull / THRESHOLD_PX) * 360;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={cn("relative", className)}
    >
      <div
        aria-hidden={!refreshing}
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
        style={{
          transform: `translateY(${Math.max(0, pull - 36)}px)`,
          opacity: Math.min(1, pull / THRESHOLD_PX),
          transition: gesture.current ? "none" : "transform 300ms ease, opacity 200ms ease",
        }}
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-white text-gray-600 shadow-md ring-1 ring-black/5">
          <RefreshCw
            className={cn("size-4", refreshing && "animate-spin")}
            style={refreshing ? undefined : { transform: `rotate(${rotation}deg)` }}
          />
        </span>
      </div>

      <div
        style={{
          transform: `translateY(${pull}px)`,
          // No transition while the finger is down — the content should track
          // it exactly; the spring is only for the release.
          transition: gesture.current ? "none" : "transform 300ms ease",
        }}
        className={cn(active && "select-none")}
      >
        {children}
      </div>
    </div>
  );
}
