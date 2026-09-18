"use client";

import {
  Children,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { animate, motion, useMotionValue } from "framer-motion";

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };
// How far the pointer must move before a press is treated as a drag rather
// than a tap — below this, buttons nested in the carousel (pet rows, etc.)
// get a normal click instead of having it hijacked by pointer capture.
const DRAG_ENGAGE_PX = 10;
// How far a released drag must have travelled to change panel.
const SWIPE_PX = 50;

/**
 * A horizontally swipeable row of full-width panels — the Pets module's Daily
 * Feed / Schedule canvas, shared so Household's Chores / Inventory swipes the
 * same way.
 *
 * `index` is the source of truth and belongs to the caller (the URL, in both
 * uses), so the sub-nav pills and the panel on screen can never disagree. The
 * carousel keeps a local copy only so a swipe animates the instant a finger
 * lifts, rather than after the router round-trip.
 *
 * Children are the panels, in order.
 */
export function SwipeCarousel({
  index,
  onIndexChange,
  children,
}: {
  index: number;
  onIndexChange: (index: number) => void;
  children: ReactNode;
}) {
  const panels = Children.toArray(children);
  const count = panels.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  // Updated synchronously on gesture end, so the spring-snap starts before
  // Next.js's router has finished processing the matching URL change — on a
  // physically-driven swipe, waiting for that round-trip reads as a stutter.
  const [visualIndex, setVisualIndex] = useState(index);

  // Follows the caller's index when it changes from outside a swipe — a pill
  // tap, browser back/forward, or a direct link.
  useEffect(() => {
    setVisualIndex(index);
  }, [index]);

  // Placed at the right panel before the first paint, with no animation. This
  // is the Phase 83D de-sync fix: the track used to live in a component that
  // outlived it, so leaving for another module tried to animate a track that
  // was no longer on screen, the animation never finished, and coming back
  // showed Schedule under a "Daily Feed" pill. Now every mount starts from
  // the index it was given, whatever happened while it was away.
  useLayoutEffect(() => {
    x.set(-visualIndex * (containerRef.current?.offsetWidth ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only; later changes animate below
  }, []);

  const snapped = useRef(false);
  useEffect(() => {
    // The mount position is set above without animation; only later index
    // changes should spring.
    if (!snapped.current) {
      snapped.current = true;
      return;
    }
    snapTo(visualIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapTo reads containerRef/x, both stable
  }, [visualIndex]);

  function snapTo(target: number) {
    const width = containerRef.current?.offsetWidth ?? 0;
    animate(x, -target * width, SPRING);
  }

  function changeIndex(target: number) {
    setVisualIndex(target);
    onIndexChange(target);
  }

  // Each panel's natural content height, watched live so the track resizes
  // when a panel's own content changes (another date, photos loading in).
  const panelEls = useRef<(HTMLDivElement | null)[]>([]);
  const [panelHeights, setPanelHeights] = useState<number[]>([]);
  const activeHeight = panelHeights[visualIndex] ?? 0;

  useEffect(() => {
    const measure = () =>
      setPanelHeights(panelEls.current.map((el) => el?.getBoundingClientRect().height ?? 0));
    const observer = new ResizeObserver(measure);
    panelEls.current.forEach((el) => el && observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, [count]);

  // Framer Motion's declarative `drag` prop silently stopped responding after
  // a few tab changes (see the history of app/dashboard/page.tsx), so the drag
  // is tracked by hand with pointer events driving a raw-pixel motion value,
  // and Framer is used only for the spring.
  const drag = useRef<{ pointerId: number; startX: number; baseX: number; engaged: boolean } | null>(
    null
  );

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // React bubbles events out of portals along the component tree, so a drag
    // inside a dialog opened from a panel would otherwise swipe the page
    // behind it. Only presses that physically start on the track count.
    if (!e.currentTarget.contains(e.target as Node)) return;
    // Deliberately NOT capturing the pointer yet: capturing immediately would
    // hijack every tap on a nested button before its own click could fire.
    // A horizontally-scrollable child (the DateRibbon) stops this event in
    // its capture phase, so dragging it scrolls it instead.
    drag.current = { pointerId: e.pointerId, startX: e.clientX, baseX: x.get(), engaged: false };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || e.pointerId !== drag.current.pointerId) return;
    const offsetX = e.clientX - drag.current.startX;
    if (!drag.current.engaged) {
      if (Math.abs(offsetX) < DRAG_ENGAGE_PX) return;
      drag.current.engaged = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    x.set(drag.current.baseX + offsetX);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || e.pointerId !== drag.current.pointerId) return;
    const { engaged, startX } = drag.current;
    const offsetX = e.clientX - startX;
    drag.current = null;
    // Never engaged: a tap, not a drag. Leave it alone so the element's own
    // click still fires, and don't re-snap (x never moved).
    if (!engaged) return;

    if (offsetX < -SWIPE_PX && visualIndex < count - 1) {
      changeIndex(visualIndex + 1);
    } else if (offsetX > SWIPE_PX && visualIndex > 0) {
      changeIndex(visualIndex - 1);
    } else {
      snapTo(visualIndex);
    }
  }

  return (
    // overflow-hidden, not just overflow-x-hidden: a taller neighbour panel
    // overflows the track, and the implicit overflow-y:auto of
    // overflow-x:hidden would turn this box into its own scroller. pt-2 leaves
    // headroom for the first card's shadow.
    //
    // flex-1 so it reaches the bottom of the screen — the caller's parent must
    // be a flex column for that. A short panel otherwise left dead space below
    // the track where a swipe did nothing.
    //
    // The gesture handlers live here rather than on the track so the padding
    // below the last card is swipeable too.
    <div
      ref={containerRef}
      className="relative flex w-full flex-1 touch-pan-y flex-col overflow-hidden pt-2 pb-4 select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {/* Each panel is exactly one viewport wide. The track starts at the
          height of the panel on screen (flexBasis) and only grows from there
          to fill the screen (grow). Both the basis and the minHeight have to
          be explicit: left to flexbox, the track's content size — and its
          automatic minimum — is the *tallest* panel's, so a short Chores
          trailed thousands of pixels of blank page under Inventory's height.
          items-start stops a short panel stretching to a tall one. */}
      <motion.div
        className="flex shrink-0 grow items-start"
        style={{
          x,
          width: `${count * 100}%`,
          flexBasis: activeHeight,
          minHeight: activeHeight,
        }}
      >
        {panels.map((panel, i) => (
          <div
            key={i}
            ref={(el) => {
              panelEls.current[i] = el;
            }}
            className="px-4"
            style={{ width: `${100 / count}%` }}
          >
            {panel}
          </div>
        ))}
      </motion.div>
    </div>
  );
}
