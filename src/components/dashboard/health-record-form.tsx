"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { PhotoPicker } from "@/components/photo-picker";
import { useHousehold } from "@/context/household-context";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { RecordType } from "@/types/database";

const RECORD_TYPES: { value: RecordType; label: string }[] = [
  { value: "vaccine", label: "Vaccine" },
  { value: "weight", label: "Weight" },
  { value: "vet", label: "Vet Visit" },
  { value: "medication", label: "Medication" },
];

export function HealthRecordForm({ petId, onSaved }: { petId: string; onSaved?: () => void }) {
  const { createMedicalRecord } = useHousehold();
  const [recordType, setRecordType] = useState<RecordType | "">("");
  const [title, setTitle] = useState("");
  const [recordDate, setRecordDate] = useState(() => formatDateLocal(new Date()));
  const [value, setValue] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showWeight = recordType === "weight";
  const showNextDue = recordType === "vaccine" || recordType === "medication";

  async function handleSubmit() {
    if (!recordType || !title) {
      toast.error("Fill in record type and title");
      return;
    }
    if (showWeight && !value) {
      toast.error("Enter a weight");
      return;
    }
    setSubmitting(true);
    try {
      await createMedicalRecord({
        entity_id: petId,
        record_type: recordType,
        title,
        administered_at: recordDate || null,
        next_due_date: showNextDue ? nextDueDate || null : null,
        value: showWeight ? Number(value) : null,
        document_photo_url: photoUrl,
        notes: notes || null,
      });
      toast.success("Record added");
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error("Failed to add record");
    } finally {
      setSubmitting(false);
    }
  }

  return (
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
          placeholder={showWeight ? "e.g. Monthly weigh-in" : "e.g. Rabies vaccine"}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label>Date</Label>
          <Input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
        </div>
        {showWeight && (
          <div className="flex flex-col gap-1.5">
            <Label>Weight (kg)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. 4.2"
            />
          </div>
        )}
        {showNextDue && (
          <div className="flex flex-col gap-1.5">
            <Label>Next due date</Label>
            <Input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
            />
          </div>
        )}
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
        <Label>Certificate / invoice photo (optional)</Label>
        <PhotoPicker
          pathPrefix={`medical/${petId}`}
          value={photoUrl}
          onChange={setPhotoUrl}
          label="Upload photo"
        />
      </div>

      <Button onClick={handleSubmit} disabled={submitting} className="min-h-[48px] w-full">
        {submitting ? <Loader2 className="animate-spin" /> : null}
        Save record
      </Button>
    </div>
  );
}
