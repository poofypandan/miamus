"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, PackageX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import type { ItemType } from "@/types/database";

const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: "food", label: "Food" },
  { value: "medicine", label: "Medicine" },
  { value: "treats", label: "Treats" },
  { value: "shampoo", label: "Shampoo" },
];

export function LowStockFlagButton() {
  const { pets, activePetId, flagLowStock } = useHousehold();
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));
  const [petId, setPetId] = useState("");
  const [itemType, setItemType] = useState<ItemType | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the form to the current active pet each time the drawer (re)opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPetId(activePetId ?? "");
      setItemType("");
      setNote("");
    }
  }

  async function handleSubmit() {
    if (!petId || !itemType) {
      toast.error("Choose a pet and item type");
      return;
    }
    setSubmitting(true);
    try {
      await flagLowStock({ pet_id: petId, item_type: itemType, note: note.trim() || null });
      toast.success("Low stock flagged for the owner");
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to flag low stock");
    } finally {
      setSubmitting(false);
    }
  }

  if (pets.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="min-h-[48px] w-full">
          <PackageX /> Flag Low Stock
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Flag Low Stock</SheetTitle>
          <SheetDescription>Let the owner know something needs restocking.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Pet</Label>
            <Select value={petId} onValueChange={setPetId}>
              <SelectTrigger className="min-h-[48px] w-full">
                <SelectValue placeholder="Select pet" />
              </SelectTrigger>
              <SelectContent>
                {pets.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Item</Label>
            <div className="grid grid-cols-2 gap-2">
              {ITEM_TYPES.map((it) => (
                <Button
                  key={it.value}
                  type="button"
                  variant={itemType === it.value ? "default" : "outline"}
                  className="min-h-[48px]"
                  onClick={() => setItemType(it.value)}
                >
                  {it.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Down to the last cup"
            />
          </div>
        </div>
        <SheetFooter>
          <Button onClick={handleSubmit} disabled={submitting} className="min-h-[48px]">
            {submitting ? <Loader2 className="animate-spin" /> : <PackageX />}
            Flag Low Stock
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
