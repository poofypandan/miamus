"use client";

import { useState } from "react";
import { ChevronRight, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MiniPetAvatar } from "@/components/dashboard/mini-pet-avatar";
import { StaffRoutineSheet } from "@/components/dashboard/staff-routine-sheet";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import type { TaskEntity } from "@/types/database";

// Staff-facing, so entirely Bahasa Indonesia. Mirrors the owner's routine
// picker: choose a dog, then its proposal sheet slides out over the picker.
// Both claim a history entry, so Back unwinds sheet first, picker second.
export function StaffRoutinePicker() {
  const { pets } = useHousehold();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingPet, setEditingPet] = useState<TaskEntity | null>(null);

  useBackToClose(pickerOpen, () => setPickerOpen(false));

  if (pets.length === 0) return null;

  return (
    <>
      <Button variant="outline" className="min-h-[48px] w-full" onClick={() => setPickerOpen(true)}>
        <Send /> Usulkan Jadwal
      </Button>

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent side="bottom" className="gap-0 rounded-t-2xl px-4 pb-10">
          <SheetHeader className="px-0">
            <SheetTitle>Pilih Anjing</SheetTitle>
            <SheetDescription>
              Pilih anjing yang mau diusulkan jadwal barunya.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-2">
            {pets.map((pet) => (
              <button
                key={pet.id}
                type="button"
                onClick={() => setEditingPet(pet)}
                className="flex min-h-[56px] w-full items-center gap-3 rounded-xl border px-3 text-left active:bg-gray-50"
              >
                <MiniPetAvatar pet={pet} className="size-10" />
                <span className="flex-1 font-medium">{pet.name}</span>
                <ChevronRight className="size-5 shrink-0 text-gray-400" />
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <StaffRoutineSheet entity={editingPet} onClose={() => setEditingPet(null)} />
    </>
  );
}
