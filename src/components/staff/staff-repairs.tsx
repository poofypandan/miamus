"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, Siren, Wrench } from "lucide-react";
import { readActiveStaffId } from "@/components/auth/staff-login-gate";
import { useLocationName } from "@/hooks/use-household-locations";
import { useRepairs } from "@/hooks/use-repairs";
import { dataProvider } from "@/lib/data";
import { canUndoReport, staffRepairStatus } from "@/lib/repairs";

/** How long a closed report stays in "Laporan kerusakan saya". */
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * "Lapor kerusakan" in the staff's Lapor sheet (Phase 159, mockup 1). Staff
 * screens are Bahasa Indonesia only.
 */
export function StaffReportRepairButton({ onPress }: { onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="mb-4 flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card px-4 text-left active:bg-muted"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
        <Wrench className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-base font-semibold">Lapor kerusakan</span>
        <span className="text-xs text-muted-foreground">Ruangan, apa yang rusak, foto</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </button>
  );
}

/**
 * This person's own repair reports and what happened to them: Menunggu
 * dicek, Diterima, Dijadwalkan, Sudah diperbaiki, or Tidak perlu with the
 * owner's reason. A report under 5 minutes old can still be taken back
 * (migrations/130 allows exactly that).
 */
export function MyRepairReports() {
  const { repairs, visits, walkIns, reload } = useRepairs();
  const placeName = useLocationName();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setStaffId(readActiveStaffId());
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const mine = useMemo(
    () =>
      repairs.filter(
        (r) =>
          !!staffId &&
          r.reported_by_staff === staffId &&
          (!r.closed_at || now - new Date(r.closed_at).getTime() < RECENT_MS)
      ),
    [repairs, staffId, now]
  );
  if (mine.length === 0) return null;

  async function undo(id: string, photo: string | null) {
    try {
      await dataProvider.deleteRepair(id);
      if (photo) await dataProvider.deletePhoto(photo).catch(() => undefined);
      await reload();
      toast.success("Laporan dibatalkan");
    } catch {
      toast.error("Sudah lewat 5 menit, laporan tidak bisa dibatalkan.");
    }
  }

  return (
    <section aria-label="Laporan kerusakan saya" className="mb-4 flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Laporan kerusakan saya</h3>
      {mine.map((repair) => (
        <div key={repair.id} className="flex items-start gap-3 rounded-xl border bg-card px-3 py-2.5">
          {repair.urgent ? (
            <Siren className="mt-0.5 size-4 shrink-0 text-red-700" />
          ) : (
            <Wrench className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-sm font-medium">{repair.title}</span>
            {placeName(repair.location_id, repair.spot) && (
              <span className="text-xs text-muted-foreground">{placeName(repair.location_id, repair.spot)}</span>
            )}
            <span className="text-xs font-medium text-gray-700">{staffRepairStatus(repair, visits, walkIns)}</span>
          </div>
          {canUndoReport(repair, staffId, now) && (
            <button
              type="button"
              onClick={() => void undo(repair.id, repair.photo_url)}
              className="min-h-[40px] shrink-0 rounded-lg px-2 text-xs font-medium text-primary active:bg-muted"
            >
              Batalkan
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
