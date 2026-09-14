"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { ScheduleCategoryName } from "@/types/database";

// Staff-facing, so every string here is Bahasa Indonesia. The category values
// themselves stay in English because they are database enum values that
// master_schedules and categorizeSchedule both key off.
const CATEGORIES: { value: ScheduleCategoryName; label: string }[] = [
  { value: "meal", label: "Makan" },
  { value: "potty", label: "Pipis & Pup" },
  { value: "medication", label: "Obat" },
  { value: "grooming", label: "Grooming" },
  { value: "temporary", label: "Lainnya" },
];

export function RoutineProposalSheet() {
  const { pets, submitRoutineProposal } = useHousehold();
  const [open, setOpen] = useState(false);
  const [petId, setPetId] = useState("");
  const [category, setCategory] = useState<ScheduleCategoryName | "">("");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useBackToClose(open, () => setOpen(false));

  function reset() {
    setPetId("");
    setCategory("");
    setTitle("");
    setTime("");
    setNotes("");
  }

  async function handleSubmit() {
    if (!petId || !category || !title.trim() || !time) {
      toast.error("Lengkapi anjing, jenis, nama, dan jam dulu");
      return;
    }
    setSubmitting(true);
    try {
      await submitRoutineProposal({
        pet_id: petId,
        title: title.trim(),
        category,
        time,
        notes: notes.trim() || null,
        created_by: "staff",
      });
      toast.success("Usulan terkirim, menunggu persetujuan pemilik");
      reset();
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengirim usulan");
    } finally {
      setSubmitting(false);
    }
  }

  if (pets.length === 0) return null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button variant="outline" className="min-h-[48px] w-full">
          <Send /> Usulkan Rutinitas
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Usulkan Rutinitas Baru</SheetTitle>
          <SheetDescription>
            Usulan dikirim ke pemilik dulu. Rutinitas baru aktif setelah disetujui.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label>Anjing</Label>
            <Select value={petId} onValueChange={setPetId}>
              <SelectTrigger className="min-h-[48px] w-full">
                <SelectValue placeholder="Pilih anjing" />
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
            <Label>Jenis</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ScheduleCategoryName)}
            >
              <SelectTrigger className="min-h-[48px] w-full">
                <SelectValue placeholder="Pilih jenis rutinitas" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Nama Rutinitas</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Obat Batuk Sore"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Jam</Label>
            <Input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="min-h-[48px] [color-scheme:light]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Catatan (opsional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="mis. Setengah tablet sesudah makan"
            />
          </div>
        </div>

        <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <Button onClick={handleSubmit} disabled={submitting} className="min-h-[48px]">
            {submitting ? <Loader2 className="animate-spin" /> : <Send />}
            Kirim Usulan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
