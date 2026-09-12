"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PhotoPicker } from "@/components/photo-picker";
import { useHousehold } from "@/context/household-context";

const ADHOC_TYPES = [
  { value: "potty", label: "Pipis Ekstra" },
  { value: "snack", label: "Snack Ekstra" },
  { value: "medication", label: "Obat Ekstra" },
] as const;

export function AdHocSheet() {
  const { entities, logTask } = useHousehold();
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setEntityId("");
    setType("");
    setNotes("");
    setPhotoUrl(null);
  }

  async function handleSubmit() {
    if (!entityId || !type) {
      toast.error("Pilih anjing dan jenis catatan dulu");
      return;
    }
    const typeLabel = ADHOC_TYPES.find((t) => t.value === type)?.label ?? "Ekstra";
    setSubmitting(true);
    try {
      await logTask({
        entity_id: entityId,
        module: "pet",
        photo_url: photoUrl,
        notes: notes ? `${typeLabel} — ${notes}` : typeLabel,
      });
      toast.success(`${typeLabel} dicatat ✅`);
      reset();
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Gagal menyimpan catatan ekstra");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button
          size="lg"
          className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 gap-1.5 rounded-full px-5 shadow-lg"
        >
          <Plus /> Catat Ekstra
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Catat Ekstra</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-1.5">
            <Label>Anjing</Label>
            <Select value={entityId} onValueChange={setEntityId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih anjing" />
              </SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Jenis</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih jenis catatan" />
              </SelectTrigger>
              <SelectContent>
                {ADHOC_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Catatan (opsional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="mis. Muntah sedikit setelah makan"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Foto (opsional)</Label>
            <PhotoPicker
              pathPrefix={entityId ? `pet/${entityId}` : "pet/adhoc"}
              value={photoUrl}
              onChange={setPhotoUrl}
              label="Ambil Foto"
              errorMessage="Gagal mengunggah foto"
            />
          </div>
        </div>
        <SheetFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            Simpan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
