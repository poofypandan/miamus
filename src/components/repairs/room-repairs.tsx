"use client";

import { useState } from "react";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RepairRow } from "@/components/repairs/repairs-view";
import { RepairReportSheet } from "@/components/repairs/repair-report-sheet";
import { RepairSheet } from "@/components/repairs/repair-sheet";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useRepairs } from "@/hooks/use-repairs";

/** How many past repairs a room's sheet lists. */
const HISTORY = 10;

/**
 * A room's repairs, in its sheet (Phase 159, mockup 5): open ones first, then
 * its history ("Dinding retak · Fixed 3 Oct · Pak Budi"), and Report a
 * problem here. Owners only — the room sheet is in the owners' Rooms view.
 */
export function RoomRepairs({ locationId }: { locationId: string }) {
  const t = useT();
  const locale = useOwnerLocale();
  const { repairs } = useRepairs();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);

  const here = repairs.filter((r) => r.location_id === locationId);
  const open = here.filter((r) => r.status === "reported" || r.status === "open");
  const past = here
    .filter((r) => r.status === "fixed" || r.status === "dismissed")
    .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""))
    .slice(0, HISTORY);

  return (
    <section aria-label={t("Repairs", "Perbaikan")} className="flex flex-col gap-1.5">
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {t("Repairs", "Perbaikan")}
      </h4>
      {open.length + past.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          {[...open, ...past].map((repair, index) => (
            <RepairRow key={repair.id} repair={repair} onOpen={setOpenId} first={index === 0} />
          ))}
        </div>
      )}
      <Button variant="outline" className="min-h-[44px] rounded-xl" onClick={() => setReporting(true)}>
        <Wrench /> {t("Report a problem here", "Lapor kerusakan di sini")}
      </Button>
      <RepairReportSheet
        open={reporting}
        onClose={() => setReporting(false)}
        locale={locale}
        presetLocationId={locationId}
      />
      <RepairSheet repair={repairs.find((r) => r.id === openId) ?? null} onClose={() => setOpenId(null)} />
    </section>
  );
}
