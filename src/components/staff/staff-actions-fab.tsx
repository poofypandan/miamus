"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  StaffReportsPanel,
  useDismissedBatches,
  useNow,
  visibleProposalBatches,
} from "@/components/staff/staff-reports-panel";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";

/**
 * "+ Lapor" — the staff view's floating action button, opening a bottom sheet
 * with the three manual reports and their history (Phase 85). They used to
 * sit at the very end of the task feed, the one place on the screen nobody
 * scrolls to mid-shift.
 *
 * Staff-facing, so Bahasa Indonesia.
 */
export function StaffActionsFab() {
  const { routineProposals } = useHousehold();
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));

  // Owned here rather than in the panel: the badge below and the drawer's
  // list must agree on what has been acknowledged, and two copies of this
  // state would each only learn about their own "Oke" taps.
  const { dismissed, dismiss } = useDismissedBatches();
  const now = useNow();

  // Owner answers the staff member hasn't tapped "Oke" on yet. Before this
  // phase they sat in plain view at the bottom of the feed; tucked into a
  // drawer, they need a signal on the button or they'd go unseen.
  const unseenAnswers = useMemo(
    () =>
      visibleProposalBatches(routineProposals, dismissed, now).filter(
        (batch) => batch.status !== "pending"
      ).length,
    [routineProposals, dismissed, now]
  );

  return (
    <>
      {/* Pinned to the app's column, not the viewport's edge, so on a tablet
          it sits by the content it belongs to. pointer-events-none on the
          full-width strip, so only the button itself blocks taps beneath. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md justify-end px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={
            unseenAnswers > 0 ? `Lapor — ${unseenAnswers} jawaban baru` : "Lapor"
          }
          className="pointer-events-auto relative flex h-14 items-center gap-2 rounded-full bg-primary pr-5 pl-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-black/25 transition-transform active:scale-95"
        >
          <Plus className="size-5" />
          Lapor
          {unseenAnswers > 0 && (
            <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white ring-2 ring-white">
              {unseenAnswers}
            </span>
          )}
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        {/* Capped below full height so the page stays visible above it, and a
            flex column so only the body scrolls — the title stays put while a
            long history scrolls beneath it. */}
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[85dvh] max-w-md gap-0 rounded-t-2xl"
        >
          <SheetHeader className="border-b">
            <SheetTitle>Laporan & Usulan</SheetTitle>
            <SheetDescription>
              Laporkan stok, usulkan jadwal, atau catat kegiatan ekstra.
            </SheetDescription>
          </SheetHeader>
          {/* overscroll-contain: reaching the end of the list must not start
              scrolling (or pull-to-refreshing) the page behind the sheet. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
            <StaffReportsPanel dismissed={dismissed} dismiss={dismiss} now={now} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
