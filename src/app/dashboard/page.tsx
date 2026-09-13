"use client";

import { Suspense, useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { DailyFeedTab } from "@/components/dashboard/tabs/daily-feed-tab";
import { SchedulesTab } from "@/components/dashboard/tabs/schedules-tab";
import { HealthTab } from "@/components/dashboard/tabs/health-tab";
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
  const activeIndex = tabIndex(searchParams.get("tab"));
  const containerRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);

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

  function changeTab(index: number) {
    router.push(`/dashboard?tab=${DASHBOARD_TABS[index]}`, { scroll: false });
  }

  function snapToActiveTab() {
    const width = containerRef.current?.offsetWidth ?? 0;
    animate(x, -activeIndex * width, SPRING);
  }

  useEffect(snapToActiveTab, [activeIndex, x]);

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

    if (offsetX < -50 && activeIndex < DASHBOARD_TABS.length - 1) {
      changeTab(activeIndex + 1);
    } else if (offsetX > 50 && activeIndex > 0) {
      changeTab(activeIndex - 1);
    } else {
      snapToActiveTab();
    }
  }

  return (
    <>
      <div ref={containerRef} className="relative w-full overflow-x-hidden">
        <motion.div
          className="flex w-[300%] touch-pan-y select-none"
          style={{ x }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="w-1/3 px-4">
            <DailyFeedTab />
          </div>
          <div className="w-1/3 px-4">
            <SchedulesTab />
          </div>
          <div className="w-1/3 px-4">
            <HealthTab />
          </div>
        </motion.div>
      </div>
      <PetProfileSheet />
    </>
  );
}
