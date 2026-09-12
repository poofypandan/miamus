"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PhotoPicker } from "@/components/photo-picker";
import { useHousehold } from "@/context/household-context";
import type { RecordType } from "@/types/database";

const RECORD_TYPES: { value: RecordType; label: string }[] = [
  { value: "vaccine", label: "Vaccine" },
  { value: "vet", label: "Vet Visit" },
  { value: "medication", label: "Medication" },
];

export function HealthUploadDialog({ entityId }: { entityId: string }) {
  const { createMedicalRecord } = useHousehold();
  const [open, setOpen] = useState(false);
  const [recordType, setRecordType] = useState<RecordType | "">("");
  const [title, setTitle] = useState("");
  const [administeredAt, setAdministeredAt] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setRecordType("");
    setTitle("");
    setAdministeredAt("");
    setNextDueDate("");
    setNotes("");
    setPhotoUrl(null);
  }

  async function handleSubmit() {
    if (!recordType || !title) {
      toast.error("Fill in record type and title");
      return;
    }
    setSubmitting(true);
    try {
      await createMedicalRecord({
        entity_id: entityId,
        record_type: recordType,
        title,
        administered_at: administeredAt || null,
        next_due_date: nextDueDate || null,
        document_photo_url: photoUrl,
        notes: notes || null,
      });
      toast.success("Record added");
      reset();
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add record");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Add record
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Health Record</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Record type</Label>
            <Select value={recordType} onValueChange={(v) => setRecordType(v as RecordType)}>
              <SelectTrigger className="min-h-[48px] w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {RECORD_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Rabies vaccine"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label>Administered on</Label>
              <Input
                type="date"
                value={administeredAt}
                onChange={(e) => setAdministeredAt(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Next due date</Label>
              <Input
                type="date"
                value={nextDueDate}
                onChange={(e) => setNextDueDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Certificate / invoice photo</Label>
            <PhotoPicker
              pathPrefix={`medical/${entityId}`}
              value={photoUrl}
              onChange={setPhotoUrl}
              label="Upload photo"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            Save record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
