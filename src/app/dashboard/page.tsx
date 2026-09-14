"use client";

import {
  Suspense,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { DailyFeedTab } from "@/components/dashboard/tabs/daily-feed-tab";
import { SchedulesTab } from "@/components/dashboard/tabs/schedules-tab";
import { PetProfileSheet } from "@/components/dashboard/pet-profile-sheet";
import { DASHBOARD_TABS, tabIndex } from "@/lib/dashboard-tabs";

const SPRING = { type: "spring" as const, stiffness: 300, damping: 30 };
// How far the pointer must move before a press is treated as a drag rather
// than a tap — below this, buttons nested in the carousel (pet rows, etc.)
// get a normal click instead of having it hijacked by pointer capture.
const DRAG_ENGAGE_PX = 10;

export default function DashboardPage() {
  // useSearchParams() opts this subtree out of static rendering unless it's
  // behind a Suspense boundary — the rest of the page has no static content
  // to show in the meantime anyway, so a null fallback is fine.
  return (
    <Suspense fallback={null}>
      <DashboardCanvas />
    </Suspense>
  );
}

function DashboardCanvas() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeIndex = tabIndex(searchParams.get("tab"));
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

  // The carousel's visual position is driven by this LOCAL state, not
  // directly by the router's searchParams. Deriving `activeIndex` straight
  // from useSearchParams() meant the spring-snap animation couldn't start
  // until Next.js's router finished processing the navigation (App Router
  // still does real reconciliation work for a same-route query change) —
  // on a physically-driven gesture like a swipe, that round-trip reads as a
  // stutter/freeze right as the release should feel instant. `visualIndex`
  // updates synchronously on gesture end; the URL is synced separately
  // (see changeTab) without gating the animation on it.
  const [visualIndex, setVisualIndex] = useState(routeIndex);

  // Keeps the carousel in sync when the tab changes from outside a swipe —
  // a TopNav tap, browser back/forward, or a direct link.
  useEffect(() => {
    setVisualIndex(routeIndex);
  }, [routeIndex]);

  // Framer Motion's declarative `drag` prop (combined with an `animate` x
  // target driven by percentage strings, per the original spec) turned out
  // to be unreliable here: after a couple of tab changes it silently stops
  // responding to further pointer gestures. Root-caused to DateRibbon's
  // scrollIntoView() (see date-ribbon.tsx) corrupting hit-testing on this
  // ancestor — fixed there — but `drag` itself still broke even after that
  // fix, in both dev and a production build. Tracking the drag ourselves
  // with plain pointer events (same proven approach as the swipe gesture
  // from Phase 23), driving a raw-pixel `useMotionValue`, reliably works
  // instead; Framer Motion is still used for the spring-snap animation via
  // `animate()`.
  const drag = useRef<{ pointerId: number; startX: number; baseX: number; engaged: boolean } | null>(
    null
  );

  // Each panel's natural content height, watched live so the track resizes when
  // a tab's own content changes (browsing to another date, photos loading in).
  const panelEls = useRef<(HTMLDivElement | null)[]>([]);
  const [panelHeights, setPanelHeights] = useState<number[]>([]);
  const activeHeight = panelHeights[visualIndex] ?? 0;

  function setPanelRef(index: number) {
    return (el: HTMLDivElement | null) => {
      panelEls.current[index] = el;
    };
  }

  useEffect(() => {
    const measure = () =>
      setPanelHeights(panelEls.current.map((el) => el?.getBoundingClientRect().height ?? 0));
    const observer = new ResizeObserver(measure);
    panelEls.current.forEach((el) => el && observer.observe(el));
    measure();
    return () => observer.disconnect();
  }, []);

  function snapTo(index: number) {
    const width = containerRef.current?.offsetWidth ?? 0;
    animate(x, -index * width, SPRING);
  }

  // Updates the visual carousel instantly, independent of router timing —
  // that's what actually fixes the stutter (see the visualIndex comment
  // above). The URL still needs to end up correct for TopNav's active-tab
  // highlight (it reads the same ?tab= via useSearchParams()) and for
  // deep-linking/refresh, so this still goes through the router — but as
  // a `.replace()` (not `.push()`, so swiping through tabs doesn't pile up
  // browser-history entries) fired *after* the visual update, which no
  // longer blocks or delays anything the user perceives.
  function changeTab(index: number) {
    setVisualIndex(index); // triggers the animation via the effect below
    router.replace(`/dashboard?tab=${DASHBOARD_TABS[index]}`, { scroll: false });
  }

  useEffect(() => {
    snapTo(visualIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- snapTo reads containerRef/x, both stable; re-running on their change would be a no-op
  }, [visualIndex]);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    // A drag that starts inside a horizontally-scrollable widget (the
    // DateRibbon) should scroll that widget, not the carousel — it already
    // stops this event at the capture phase via onPointerDownCapture.
    // Deliberately NOT capturing the pointer yet: capturing immediately
    // would hijack every tap on a nested button (pet rows, chevron rows,
    // etc.) before its own click had a chance to fire. Capture is deferred
    // to handlePointerMove, once the gesture has proven itself a drag.
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
    // Never engaged (moved less than the threshold) — this was a tap, not a
    // drag. Leave it alone so the underlying element's own click still
    // fires normally; don't even re-snap (x is already at baseX).
    if (!engaged) return;

    if (offsetX < -50 && visualIndex < DASHBOARD_TABS.length - 1) {
      changeTab(visualIndex + 1);
    } else if (offsetX > 50 && visualIndex > 0) {
      changeTab(visualIndex - 1);
    } else {
      snapTo(visualIndex);
    }
  }

  return (
    <>
      {/* pt-2 rather than pt-4: this container is overflow-x-hidden, which
          makes it an implicit vertical clipping context, so it still needs a
          little headroom or the first card's shadow gets sheared off. 8px is
          enough for that while pulling the headers up toward the tabs. */}
      {/* overflow-hidden, not just overflow-x-hidden: the track below is pinned
          to the *active* panel's height, so the other panel — which may be far
          taller — overflows it. Left to the implicit overflow-y:auto that
          overflow-x:hidden brings with it, that overflow would turn this box
          into its own scroller and simply move the dead space rather than
          remove it. */}
      <div ref={containerRef} className="relative w-full overflow-hidden pt-2 pb-4">
        {/* Track width and panel widths are the inverse of DASHBOARD_TABS.length
            (2 tabs -> 200% / w-1/2), so each panel is exactly one viewport.
            items-start stops the shorter panel being stretched to match the
            taller one, and the explicit height keeps the page itself only as
            long as whatever tab is actually on screen — without it the Schedule
            tab inherited Daily Feed's height and trailed ~700px of white space.
            Height is the panel's own full content height, never a viewport
            cap, so the page keeps scrolling normally. */}
        <motion.div
          className="flex w-[200%] touch-pan-y items-start select-none"
          style={{ x, height: activeHeight || undefined }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div ref={setPanelRef(0)} className="w-1/2 px-4">
            <DailyFeedTab />
          </div>
          <div ref={setPanelRef(1)} className="w-1/2 px-4">
            <SchedulesTab />
          </div>
        </motion.div>
      </div>
      <PetProfileSheet />
    </>
  );
}
