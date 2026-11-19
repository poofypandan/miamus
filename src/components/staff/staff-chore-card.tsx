"use client";

import { useState, type ComponentProps } from "react";
import { CircleSlash, MoreHorizontal, PanelBottomOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChoreCard } from "@/components/chores/chore-card";
import { ChoreProofPlaces } from "@/components/chores/proof-places";
import { CouldntDoSheet } from "@/components/staff/couldnt-do-sheet";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useClearProofWhenSettled } from "@/hooks/use-chore-proof";
import { useHousehold } from "@/context/household-context";
import { choreDraftKey } from "@/lib/chore-draft";

/**
 * A chore on a staff phone's list (19 Nov, product change #2): the task and
 * its proof. An open chore of this person's shows its Sebelum and Sesudah
 * places on the card, so it is finished from the list; a chore for Anyone is
 * taken first ("Saya kerjakan", in its sheet). Tapping the name opens the
 * chore's sheet as before (notes, the repair, the photos).
 *
 * The card's menu (the three dots) keeps "Tidak bisa dikerjakan" one tap
 * away, with the sheet beside it. Staff-facing, so Bahasa Indonesia.
 */
export function StaffChoreCard({
  canSayCouldnt,
  ...card
}: Omit<ComponentProps<typeof ChoreCard>, "staff" | "proof" | "menu" | "locale"> & {
  /** "Tidak bisa dikerjakan" can be said for it: not said yet, and within the last week (canFileFor). */
  canSayCouldnt: boolean;
}) {
  const { occurrence, onPress, waitingToSend = false } = card;
  const done = occurrence.status === "completed";
  const { activeHouseholdId } = useHousehold();
  // Photos taken on this card, for a chore finished on another phone: let
  // them go, as the sheet does (the sheet may never be opened now).
  useClearProofWhenSettled(choreDraftKey(activeHouseholdId, occurrence.template.id, occurrence.date), done && !waitingToSend);
  const [menuOpen, setMenuOpen] = useState(false);
  const [couldntOpen, setCouldntOpen] = useState(false);
  useBackToClose(menuOpen, () => setMenuOpen(false));
  // The photos go on the card once the chore is this person's (or someone's):
  // a chore for Anyone is taken first.
  const proof = !done && occurrence.task.assigned_to ? <ChoreProofPlaces occurrence={occurrence} /> : undefined;

  return (
    <>
      <ChoreCard
        {...card}
        locale="id"
        staff
        proof={proof}
        menu={
          done ? undefined : (
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Pilihan lain"
              className="-mt-1 -mr-1.5 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
            >
              <MoreHorizontal className="size-5" />
            </button>
          )
        }
      />
      {!done && (
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-2xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <SheetHeader className="text-left">
              <SheetTitle>{occurrence.task.title}</SheetTitle>
              <SheetDescription className="sr-only">Pilihan untuk tugas ini</SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-2 px-4">
              {canSayCouldnt && (
                <Button
                  variant="outline"
                  className="min-h-12 w-full rounded-xl font-medium text-gray-700"
                  onClick={() => {
                    setMenuOpen(false);
                    setCouldntOpen(true);
                  }}
                >
                  <CircleSlash /> Tidak bisa dikerjakan
                </Button>
              )}
              {onPress && (
                <Button
                  variant="outline"
                  className="min-h-12 w-full rounded-xl font-medium text-gray-700"
                  onClick={() => {
                    setMenuOpen(false);
                    onPress();
                  }}
                >
                  <PanelBottomOpen /> Lihat detail
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
      <CouldntDoSheet target={{ kind: "chore", occurrence }} open={couldntOpen} onOpenChange={setCouldntOpen} />
    </>
  );
}

