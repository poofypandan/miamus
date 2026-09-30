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
import { WhatsAppNotifyPanel } from "@/components/staff/whatsapp-notify-panel";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";

// `label` is what actually reaches the database: an ad-hoc entry is a task_log
// with no schedule, and its type lives in the free-text `notes` column
// ("Pipis Ekstra — muntah sedikit"). That string is shown verbatim in the
// staff's Catatan Ekstra list and in the owner's photo lightbox, so these stay
// human Indonesian rather than machine slugs like `vomit_sick`. The read side
// maps them back to a category in lib/schedule-categories.
const ADHOC_TYPES = [
  { value: "potty", label: "Pipis Ekstra" },
  { value: "vomit_sick", label: "Muntah / Sakit" },
  { value: "other", label: "Lainnya" },
] as const;

/**
 * The one ad-hoc type that is an emergency rather than a record (Phase 99).
 *
 * A pipis ekstra is something the owner reads later; a dog that is vomiting is
 * something they need to know about now. Until this, both ended the same way —
 * a toast and a closed sheet — so the most time-sensitive thing a staff member
 * can report was also the quietest. This one swaps to the WhatsApp handoff
 * instead of closing; the other two keep the toast, because interrupting
 * someone to nag them about a routine note is how a prompt gets ignored when
 * it finally matters.
 */
const URGENT_TYPE = "vomit_sick";

export function AdHocSheet() {
  const { pets, logTask } = useHousehold();
  const [open, setOpen] = useState(false);
  const [entityId, setEntityId] = useState<string>("");
  const [type, setType] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set once a sick report is filed, which swaps the sheet to the handoff.
  // Holds its own copy of the dog and the note because `reset()` has already
  // cleared the form by the time this renders.
  const [urgentReport, setUrgentReport] = useState<{ petName: string; note: string } | null>(
    null
  );
  useBackToClose(open, close);

  function reset() {
    setEntityId("");
    setType("");
    setNotes("");
    setPhotoUrl(null);
  }

  /**
   * Every way out of this sheet, in one place.
   *
   * Radix only fires onOpenChange for closes *it* initiates — a swipe, Esc, a
   * tap on the overlay. Setting `open` to false ourselves changes the prop
   * without it, so the cleanup that used to live only in onOpenChange was
   * skipped by the handoff's "Selesai" button and by the Back gesture: the
   * next Catat Ekstra reopened on the previous sick report's WhatsApp screen
   * instead of a blank form.
   */
  function close() {
    setOpen(false);
    reset();
    setUrgentReport(null);
  }

  async function handleSubmit() {
    if (!entityId || !type) {
      toast.error("Pilih anjing dan jenis catatan dulu");
      return;
    }
    const typeLabel = ADHOC_TYPES.find((t) => t.value === type)?.label ?? "Ekstra";
    // Read before reset() clears the form — the handoff needs the dog's name.
    const petName = pets.find((p) => p.id === entityId)?.name ?? "anjing";
    const note = notes.trim();
    setSubmitting(true);
    try {
      await logTask({
        entity_id: entityId,
        module: "pet",
        photo_url: photoUrl,
        notes: notes ? `${typeLabel} — ${notes}` : typeLabel,
      });
      reset();
      if (type === URGENT_TYPE) {
        // No toast: the panel that replaces the form says so itself, and a
        // toast over it would only compete with the button it is pointing at.
        setUrgentReport({ petName, note });
      } else {
        toast.success(`${typeLabel} dicatat ✅`);
        setOpen(false);
      }
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
        if (!next) {
          reset();
          setUrgentReport(null);
        }
      }}
    >
      {/* Was a floating action button. It now sits in the Laporan & Usulan
          stack with the other two manual actions, styled to match them, so all
          three inputs read as one group instead of one of them hovering over
          the agenda and covering the last task of the day. */}
      <SheetTrigger asChild>
        <Button variant="outline" className="min-h-[48px] w-full">
          <Plus /> Catat Ekstra
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
        {urgentReport ? (
          <>
            {/* Visually hidden, but Radix requires every sheet to have a title;
                the panel below carries the visible one. */}
            <SheetHeader className="sr-only">
              <SheetTitle>Laporan sakit tersimpan</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <WhatsAppNotifyPanel
                tone="urgent"
                title={`Laporan sakit ${urgentReport.petName} tersimpan`}
                description="Ini laporan darurat. Pemilik tidak menerima notifikasi otomatis — kirim pesan WhatsApp sekarang juga."
                ctaLabel="Kirim Peringatan ke Pemilik"
                message={`URGENT 🚨: Laporan sakit/muntah untuk ${urgentReport.petName}.${
                  urgentReport.note ? ` Catatan: ${urgentReport.note}.` : ""
                } Mohon cek aplikasi sekarang:`}
                onDone={close}
              />
            </div>
          </>
        ) : (
          <>
          <SheetHeader>
            <SheetTitle>Catat Ekstra</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-1.5">
              <Label>Anjing</Label>
              <Select value={entityId} onValueChange={setEntityId}>
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
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="min-h-[48px] w-full">
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
                busyLabel="Mengunggah..."
                errorMessage="Gagal mengunggah foto"
              />
            </div>
          </div>
          <SheetFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button onClick={handleSubmit} disabled={submitting} className="min-h-[48px]">
              {submitting ? <Loader2 className="animate-spin" /> : null}
              Simpan
            </Button>
          </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
