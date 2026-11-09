"use client";

import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FoodPhotoField } from "@/components/kitchen/food-photo-field";
import { SpotField } from "@/components/chores/spot-field";
import { RoomSelect } from "@/components/repairs/room-select";
import { readActiveStaffId } from "@/components/auth/staff-login-gate";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHousehold } from "@/context/household-context";
import { useRepairs } from "@/hooks/use-repairs";
import { dataProvider } from "@/lib/data";
import { REPAIR_LIMITS } from "@/lib/repairs";
import type { OwnerLocale } from "@/lib/owner-locale";
import { cn } from "@/lib/utils";
import type { Repair } from "@/types/database";

/** Best effort: a photo left behind is swept by the nightly clean-up (migrations/130). */
async function dropPhoto(url: string | null | undefined) {
  if (!url) return;
  try {
    await dataProvider.deletePhoto(url);
  } catch (err) {
    console.warn("Repair photo not removed; the nightly clean-up will", err);
  }
}

/**
 * Report a problem, or (owners) edit one (Phase 159, mockup 1). The room
 * (by floor), the spot, what's wrong (required), a photo (strongly
 * suggested), and Urgent. Shared by owners — whose reports go straight on
 * the list — and staff phones, whose reports wait for an owner (D2) and,
 * when urgent, push the owners (D6). Staff screens pass locale "id" and
 * `asStaff`.
 */
export function RepairReportSheet({
  open,
  onClose,
  locale,
  asStaff = false,
  repair = null,
  presetLocationId = null,
}: {
  open: boolean;
  onClose: () => void;
  locale: OwnerLocale;
  asStaff?: boolean;
  /** Owners editing; null to report a new one. */
  repair?: Repair | null;
  /** "Report a problem here" from a room. */
  presetLocationId?: string | null;
}) {
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md gap-0 overflow-y-auto rounded-t-2xl">
        {open && (
          <ReportForm
            key={repair?.id ?? `new-${presetLocationId ?? ""}`}
            locale={locale}
            asStaff={asStaff}
            repair={repair}
            presetLocationId={presetLocationId}
            onDone={onClose}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ReportForm({
  locale,
  asStaff,
  repair,
  presetLocationId,
  onDone,
}: {
  locale: OwnerLocale;
  asStaff: boolean;
  repair: Repair | null;
  presetLocationId: string | null;
  onDone: () => void;
}) {
  const ind = locale === "id";
  const tr = (en: string, id: string) => (ind ? id : en);
  const { reload } = useRepairs();
  // An owner on the Staff view reports as an owner: straight on the list
  // (migrations/130 refuses a "waiting" report from an owner).
  const { userRole } = useHousehold();
  const waitsForOwner = asStaff && userRole !== "owner";
  const ids = { room: useId(), title: useId(), details: useId(), who: useId() };

  const [locationId, setLocationId] = useState<string | null>(repair?.location_id ?? presetLocationId);
  const [spot, setSpot] = useState<string | null>(repair?.spot ?? null);
  const [title, setTitle] = useState(repair?.title ?? "");
  const [details, setDetails] = useState(repair?.details ?? "");
  const [photo, setPhoto] = useState<File | string | null>(repair?.photo_url ?? null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [urgent, setUrgent] = useState(repair?.urgent ?? false);
  const [fixedBy, setFixedBy] = useState(repair?.fixed_by_name ?? "");
  const [saving, setSaving] = useState(false);

  const canSave = title.trim().length > 0 && !photoBusy && !saving;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    const staffId = asStaff ? readActiveStaffId() : null;
    if (waitsForOwner && !staffId) {
      toast.error("Pilih nama Anda dulu, lalu coba lagi.");
      return;
    }
    setSaving(true);
    const fields = {
      title: title.trim().slice(0, REPAIR_LIMITS.title),
      details: details.trim() ? details.trim().slice(0, REPAIR_LIMITS.details) : null,
      location_id: locationId,
      spot: locationId ? spot : null,
      urgent,
    };
    let uploaded: string | null = null;
    try {
      if (photo instanceof File) uploaded = await dataProvider.uploadPhoto(photo, "repairs");
      if (repair) {
        const photoPatch =
          photo instanceof File ? { photo_url: uploaded } : photo === null && repair.photo_url ? { photo_url: null } : {};
        await dataProvider.updateRepair(repair.id, {
          ...fields,
          ...photoPatch,
          fixed_by_name: fixedBy.trim() ? fixedBy.trim().slice(0, REPAIR_LIMITS.fixedByName) : null,
        });
        if ("photo_url" in photoPatch) void dropPhoto(repair.photo_url);
        toast.success(tr("Saved", "Tersimpan"));
      } else {
        const created = await dataProvider.createRepair({
          ...fields,
          photo_url: uploaded,
          status: waitsForOwner ? "reported" : "open",
          reported_by_staff: staffId,
        });
        if (waitsForOwner) {
          toast.success("Terkirim ke pemilik rumah", {
            description: urgent ? "Darurat: pemilik rumah langsung diberi tahu." : undefined,
            action: {
              label: "Batalkan",
              onClick: () => {
                void dataProvider
                  .deleteRepair(created.id)
                  .then(() => {
                    void dropPhoto(created.photo_url);
                    void reload();
                    toast.success("Laporan dibatalkan");
                  })
                  .catch(() => toast.error("Sudah lewat 5 menit, laporan tidak bisa dibatalkan."));
              },
            },
          });
        } else {
          toast.success(tr(`Reported — ${created.title}`, `Dilaporkan — ${created.title}`));
        }
      }
      void reload();
      onDone();
    } catch (err) {
      console.error(err);
      void dropPhoto(uploaded);
      toast.error(tr("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col">
      <SheetHeader className="pb-2">
        <SheetTitle className="text-center text-lg font-semibold">
          {repair ? tr("Edit repair", "Ubah perbaikan") : tr("Report a problem", "Lapor kerusakan")}
        </SheetTitle>
        <SheetDescription className="sr-only">
          {tr("Where, what's wrong, and a photo.", "Di mana, apa yang rusak, dan fotonya.")}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pb-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.room} className="text-xs">
            {asStaff ? "Ruangan" : tr("Room", "Ruangan")}
          </Label>
          <RoomSelect
            id={ids.room}
            value={locationId}
            onChange={(next) => {
              setLocationId(next);
              setSpot(null);
            }}
            locale={locale}
          />
        </div>

        {locationId && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              {/* Staff forms never say "opsional" (docs/indonesian-glossary.md). */}
              {asStaff ? "Bagian (boleh dikosongkan)" : tr("Spot (optional)", "Bagian (opsional)")}
            </Label>
            <SpotField value={spot} onChange={setSpot} placeIds={[locationId]} locale={locale} />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.title} className="text-xs">
            {tr("What's wrong?", "Apa yang rusak?")}
          </Label>
          <Input
            id={ids.title}
            value={title}
            maxLength={REPAIR_LIMITS.title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tr("e.g. The tap is dripping", "mis. Keran bocor")}
            className="min-h-[48px]"
          />
        </div>

        <FoodPhotoField value={photo} onChange={setPhoto} onBusyChange={setPhotoBusy} locale={locale} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.details} className="text-xs">
            {asStaff ? "Keterangan (boleh dikosongkan)" : tr("More details (optional)", "Keterangan (opsional)")}
          </Label>
          <Textarea
            id={ids.details}
            value={details}
            maxLength={REPAIR_LIMITS.details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={tr("Since when, how bad", "Sejak kapan, seberapa parah")}
          />
        </div>

        <label
          className={cn(
            "flex items-start gap-3 rounded-xl border p-3",
            urgent ? "border-red-300 bg-red-50" : "border-zinc-200"
          )}
        >
          <input
            type="checkbox"
            checked={urgent}
            onChange={(e) => setUrgent(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-red-700"
          />
          <span className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Siren className="size-4 text-red-700" /> {tr("Urgent", "Darurat")}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {asStaff
                ? "Bocor, listrik, gas — pemilik rumah langsung diberi tahu."
                : tr("Leaks, electricity, gas: shown first.", "Bocor, listrik, gas: tampil paling atas.")}
            </span>
          </span>
        </label>

        {repair && !asStaff && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={ids.who} className="text-xs">
              {tr("Repair person (optional)", "Tukang (opsional)")}
            </Label>
            <Input
              id={ids.who}
              value={fixedBy}
              maxLength={REPAIR_LIMITS.fixedByName}
              onChange={(e) => setFixedBy(e.target.value)}
              placeholder={tr("e.g. Pak Budi, AC repair", "mis. Pak Budi, tukang AC")}
              className="min-h-[48px]"
            />
            <p className="text-[11px] text-muted-foreground">
              {tr("A name only. Their number stays in your phone.", "Nama saja. Nomornya tetap di HP Anda.")}
            </p>
          </div>
        )}

        <Button type="submit" disabled={!canSave} className="min-h-[52px] rounded-xl text-base">
          {saving && <Loader2 className="animate-spin" />}
          {repair ? tr("Save", "Simpan") : asStaff ? "Kirim" : tr("Report", "Laporkan")}
        </Button>
      </div>
    </form>
  );
}
