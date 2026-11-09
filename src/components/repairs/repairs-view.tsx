"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Plus, RefreshCw, Siren, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { RepairReportSheet } from "@/components/repairs/repair-report-sheet";
import { RepairSheet, repairStageText } from "@/components/repairs/repair-sheet";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useLocationName } from "@/hooks/use-household-locations";
import { useRepairs } from "@/hooks/use-repairs";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useFormatTime } from "@/components/ui/ui-labels";
import { repairStage, repairsBoard } from "@/lib/repairs";
import { cn } from "@/lib/utils";
import type { Repair } from "@/types/database";

/**
 * Chores → Repairs (Phase 159, D1; mockup 2): Report a problem, then — each
 * only when it has something — staff reports To review, Open repairs with
 * where they stand, and those Fixed in the last 30 days. Urgent ones come
 * first and carry the only tint.
 */
export function RepairsView() {
  const t = useT();
  const locale = useOwnerLocale();
  const { repairs, visits, loaded, failed, reload } = useRepairs();
  const board = useMemo(() => repairsBoard(repairs, visits), [repairs, visits]);
  const [reporting, setReporting] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const openRepair = repairs.find((r) => r.id === openId) ?? null;
  const empty = board.toReview.length + board.open.length + board.fixed.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <WhatsNewCard id="repair-costs-2026-11" />
      <Button className="min-h-[48px] rounded-xl" onClick={() => setReporting(true)}>
        <Plus /> {t("Report a problem", "Lapor kerusakan")}
      </Button>

      {failed && repairs.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
          {t("Repairs couldn't load.", "Perbaikan gagal dimuat.")}
          <Button variant="outline" className="min-h-[44px] rounded-xl" onClick={() => void reload()}>
            <RefreshCw /> {t("Try again", "Coba lagi")}
          </Button>
        </div>
      ) : loaded && empty ? (
        <EmptyState
          icon={Wrench}
          title={t("Nothing to repair", "Tidak ada yang perlu diperbaiki")}
          description={t(
            "When something breaks, report it here with a photo. Staff can report too, from Lapor.",
            "Kalau ada yang rusak, laporkan di sini dengan foto. Staf juga bisa melapor dari tombol Lapor."
          )}
        />
      ) : (
        <>
          <RepairSection title={t("To review", "Perlu dicek")} repairs={board.toReview} onOpen={setOpenId} />
          <RepairSection title={t("Open", "Sedang berjalan")} repairs={board.open} onOpen={setOpenId} />
          <RepairSection title={t("Fixed", "Sudah diperbaiki")} repairs={board.fixed} onOpen={setOpenId} />
        </>
      )}

      <RepairReportSheet open={reporting} onClose={() => setReporting(false)} locale={locale} />
      <RepairSheet repair={openRepair} onClose={() => setOpenId(null)} />
    </div>
  );
}

function RepairSection({
  title,
  repairs,
  onOpen,
}: {
  title: string;
  repairs: Repair[];
  onOpen: (id: string) => void;
}) {
  if (repairs.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-baseline justify-between text-sm font-semibold text-gray-900">
        {title}
        <span className="text-xs font-normal text-muted-foreground">{repairs.length}</span>
      </h2>
      <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
        {repairs.map((repair, index) => (
          <RepairRow key={repair.id} repair={repair} onOpen={onOpen} first={index === 0} />
        ))}
      </div>
    </section>
  );
}

export function RepairRow({ repair, onOpen, first }: { repair: Repair; onOpen: (id: string) => void; first?: boolean }) {
  const locale = useOwnerLocale();
  const t = useT();
  const { visits } = useRepairs();
  const formatTime = useFormatTime();
  const placeName = useLocationName();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const stage = repairStage(repair, visits);
  const place = placeName(repair.location_id, repair.spot);
  const attention = stage.kind === "check" || stage.kind === "reported";
  return (
    <button
      type="button"
      onClick={() => onOpen(repair.id)}
      className={cn(
        "flex min-h-[64px] w-full items-center gap-3 px-3 py-2.5 text-left active:bg-muted",
        !first && "border-t",
        repair.urgent && repair.status !== "fixed" && repair.status !== "dismissed" && "bg-red-50/70"
      )}
    >
      {repair.urgent && repair.status !== "fixed" ? (
        <Siren className="size-4 shrink-0 text-red-700" aria-label={t("Urgent", "Darurat")} />
      ) : (
        <Wrench className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-gray-900">{repair.title}</span>
        {place && <span className="truncate text-xs text-muted-foreground">{place}</span>}
        <span className={cn("truncate text-xs", attention ? "font-medium text-amber-800" : "text-gray-600")}>
          {repairStageText(repair, stage, locale, formatTime, staffName)}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
