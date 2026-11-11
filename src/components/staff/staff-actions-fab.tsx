"use client";

import { useMemo, useState } from "react";
import { ChevronRight, CookingPot, MessageSquareText, Plus } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  StaffReportsPanel,
  useDismissedBatches,
  useNow,
  visibleProposalBatches,
} from "@/components/staff/staff-reports-panel";
import { FoodFormSheet } from "@/components/kitchen/food-form-sheet";
import { MyRepairReports, StaffReportRepairButton } from "@/components/staff/staff-repairs";
import { RepairReportSheet } from "@/components/repairs/repair-report-sheet";
import { FeedbackSheet } from "@/components/shared/feedback-sheet";
import { StaffPushRow, StaffPushSheet } from "@/components/staff/staff-push-sheet";
import { useStaffPush } from "@/hooks/use-staff-push";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdFeatures } from "@/hooks/use-household-features";

/**
 * "+ Lapor" — the staff view's floating action button, opening a bottom sheet
 * with the three manual reports and their history (Phase 85). They used to
 * sit at the very end of the task feed, the one place on the screen nobody
 * scrolls to mid-shift.
 *
 * Staff-facing, so Bahasa Indonesia.
 */
export function StaffActionsFab() {
  const { routineProposals, pets } = useHousehold();
  // Food at home and Repairs switched off (Phase 171): their buttons go, and
  // the line above them gets shorter, never longer (no new reading, D14).
  const { food: foodOn, repairs: repairsOn } = useHouseholdFeatures();
  const [open, setOpen] = useState(false);
  // Food came to the door (Phase 156): the add-food sheet, straight from here.
  const [addingFood, setAddingFood] = useState(false);
  // Something broken (Phase 159): the repair report, straight from here.
  const [reportingRepair, setReportingRepair] = useState(false);
  // About the app itself (roadmap item 9): last and quiet, below the reports.
  const [sendingFeedback, setSendingFeedback] = useState(false);
  // Notifications on this phone (Phase 166, D7): the very last row.
  const [pushSettings, setPushSettings] = useState(false);
  // One copy for the row and its sheet, read once rather than on every open.
  const staffPush = useStaffPush();
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
    () => visibleProposalBatches(routineProposals, dismissed, now).filter((batch) => batch.status !== "pending").length,
    [routineProposals, dismissed, now]
  );

  return (
    <>
      {/* Pinned to the app's column, not the viewport's edge, so on a tablet
          it sits by the content it belongs to. pointer-events-none on the
          full-width strip, so only the button itself blocks taps beneath.
          z-20, under the tab and launch covers (Phase 123 — at z-50 it
          floated over them); see the ladder in brand/brand-cover.tsx. Its
          sheet portals to z-50 on its own. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-md justify-end px-6">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={unseenAnswers > 0 ? `Lapor — ${unseenAnswers} jawaban baru` : "Lapor"}
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
        <SheetContent side="bottom" className="mx-auto max-h-[85dvh] max-w-md gap-0 rounded-t-2xl">
          <SheetHeader className="border-b">
            <SheetTitle>Laporan & Usulan</SheetTitle>
            <SheetDescription>
              {/* Without pets there is no schedule to suggest and no pet note
                  to write (Phase 162); without Food or Repairs, no button for
                  them (Phase 171). */}
              {lapor({
                food: foodOn,
                repairs: repairsOn,
                pets: pets.length > 0,
              })}
            </SheetDescription>
          </SheetHeader>
          {/* overscroll-contain: reaching the end of the list must not start
              scrolling (or pull-to-refreshing) the page behind the sheet. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
            {/* First, because food arrives mid-task and goes off: a photo is
                enough, the owners are told. */}
            {foodOn && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setAddingFood(true);
                }}
                className="mb-4 flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left active:bg-muted"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                  <CookingPot className="size-5" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-base font-semibold">Makanan masuk</span>
                  <span className="text-xs text-muted-foreground">Foto, simpan di mana, kedaluwarsa</span>
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </button>
            )}
            {repairsOn && (
              <>
                <StaffReportRepairButton
                  onPress={() => {
                    setOpen(false);
                    setReportingRepair(true);
                  }}
                />
                <MyRepairReports />
              </>
            )}
            <StaffReportsPanel dismissed={dismissed} dismiss={dismiss} now={now} />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSendingFeedback(true);
              }}
              className="mt-4 flex min-h-12 w-full items-center gap-3 rounded-xl px-1 text-left text-sm active:bg-muted"
            >
              <MessageSquareText className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">Kirim masukan</span>
                <span className="text-xs text-muted-foreground">Ide atau masalah di aplikasi</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
            <StaffPushRow
              staffPush={staffPush}
              onPress={() => {
                setOpen(false);
                setPushSettings(true);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <FoodFormSheet open={addingFood} item={null} locale="id" onClose={() => setAddingFood(false)} />
      <RepairReportSheet open={reportingRepair} onClose={() => setReportingRepair(false)} locale="id" asStaff />
      <FeedbackSheet open={sendingFeedback} onClose={() => setSendingFeedback(false)} locale="id" asStaff />
      <StaffPushSheet staffPush={staffPush} open={pushSettings} onClose={() => setPushSettings(false)} />
    </>
  );
}

/**
 * The sheet's one line, from what is on: "Catat makanan masuk, lapor
 * kerusakan, atau laporkan stok." Each part goes with its button.
 */
export function lapor({ food, repairs, pets }: { food: boolean; repairs: boolean; pets: boolean }): string {
  const parts = [
    food && "catat makanan masuk",
    repairs && "lapor kerusakan",
    "laporkan stok",
    pets && "usulkan jadwal",
    pets && "catat kegiatan ekstra",
  ].filter((part): part is string => !!part);
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, atau ${parts[parts.length - 1]}` : parts[0];
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}
