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
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { RecordType } from "@/types/database";

const RECORD_TYPE_IDS: Record<string, string> = {
  vaccine: "Vaksin",
  weight: "Berat Badan",
  vet: "Kunjungan Dokter",
  medication: "Obat",
};

const RECORD_TYPES: { value: RecordType; label: string }[] = [
  { value: "vaccine", label: "Vaccine" },
  { value: "weight", label: "Weight" },
  { value: "vet", label: "Vet Visit" },
  { value: "medication", label: "Medication" },
];

export function HealthRecordForm({ petId, onSaved }: { petId: string; onSaved?: () => void }) {
  const { createMedicalRecord } = useHousehold();
  const locale = useOwnerLocale();
  const t = useT();
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
      toast.error(t("Fill in record type and title", "Isi jenis catatan dan judulnya"));
      return;
    }
    if (showWeight && !value) {
      toast.error(t("Enter a weight", "Masukkan berat badan"));
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
      toast.success(t("Record added", "Catatan ditambahkan"));
      onSaved?.();
    } catch (err) {
      console.error(err);
      toast.error(t("Failed to add record", "Catatan gagal ditambahkan"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label>{t("Record type", "Jenis catatan")}</Label>
        <Select value={recordType} onValueChange={(v) => setRecordType(v as RecordType)}>
          <SelectTrigger className="min-h-[48px] w-full">
            <SelectValue placeholder={t("Select type", "Pilih jenis")} />
          </SelectTrigger>
          <SelectContent>
            {RECORD_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {locale === "id" ? RECORD_TYPE_IDS[type.value] : type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("Title", "Judul")}</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={
            showWeight
              ? t("e.g. Monthly weigh-in", "mis. Timbang bulanan")
              : t("e.g. Rabies vaccine", "mis. Vaksin rabies")
          }
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <Label>{t("Date", "Tanggal")}</Label>
          <Input type="date" value={recordDate} onChange={(e) => setRecordDate(e.target.value)} />
        </div>
        {showWeight && (
          <div className="flex flex-col gap-1.5">
            <Label>{t("Weight (kg)", "Berat (kg)")}</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t("e.g. 4.2", "mis. 4,2")}
            />
          </div>
        )}
        {showNextDue && (
          <div className="flex flex-col gap-1.5">
            <Label>{t("Next due date", "Jatuh tempo berikutnya")}</Label>
            <Input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("Notes", "Catatan")}</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("Optional notes", "Catatan opsional")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("Certificate / invoice photo (optional)", "Foto sertifikat / nota (opsional)")}</Label>
        <PhotoPicker
          pathPrefix={`medical/${petId}`}
          value={photoUrl}
          onChange={setPhotoUrl}
          label={t("Upload photo", "Unggah foto")}
          busyLabel={t("Uploading...", "Mengunggah...")}
          errorMessage={t("Failed to upload photo", "Foto gagal diunggah")}
        />
      </div>

      <Button onClick={handleSubmit} disabled={submitting} className="min-h-[48px] w-full">
        {submitting ? <Loader2 className="animate-spin" /> : null}
        {t("Save record", "Simpan catatan")}
      </Button>
    </div>
  );
}
