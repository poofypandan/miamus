"use client";

import { useMemo, useState } from "react";
import { ChevronRight, HardHat, Plus, RefreshCw, Share2, Siren, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { DeveloperListSheet } from "@/components/repairs/developer-list-sheet";
import { RepairReportSheet } from "@/components/repairs/repair-report-sheet";
import { RepairSheet, repairStageText } from "@/components/repairs/repair-sheet";
import { WalkInFinishSheet, WalkInStartSheet } from "@/components/repairs/walkin-sheets";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useLocationName } from "@/hooks/use-household-locations";
import { useRepairs } from "@/hooks/use-repairs";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useFormatTime } from "@/components/ui/ui-labels";
import { developerItems } from "@/lib/developer-list";
import { repairStage, repairsBoard } from "@/lib/repairs";
import { cn } from "@/lib/utils";
import type { Repair, RepairWalkIn } from "@/types/database";

/**
 * Chores → Repairs (Phase 159, D1; mockup 2): Report a problem, then — each
 * only when it has something — staff reports To review, Open repairs with
 * where they stand, and those Fixed in the last 30 days. Urgent ones come
 * first and carry the only tint.
 */
export function RepairsView() {
  const t = useT();
  const locale = useOwnerLocale();
  const { repairs, visits, walkIns, loaded, failed, reload } = useRepairs();
  const board = useMemo(() => repairsBoard(repairs, visits, new Date(), walkIns), [repairs, visits, walkIns]);
  const [reporting, setReporting] = useState(false);
  // "Someone's here" (Phase 174, D9): the staff's sheet, for a day an owner opens the gate.
  const [walkIn, setWalkIn] = useState(false);
  const [finishing, setFinishing] = useState<RepairWalkIn | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const openRepair = repairs.find((r) => r.id === openId) ?? null;
  const placeName = useLocationName();
  // Send to the developer (Phase 174 PR C): a fresh list, all ticked, each time it opens.
  const [sending, setSending] = useState(0);
  const [sendOpen, setSendOpen] = useState(false);
  const developerList = useMemo(
    () => developerItems(board.open, visits, walkIns, placeName),
    [board.open, visits, walkIns, placeName]
  );
  const empty = board.toReview.length + board.open.length + board.fixed.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <WhatsNewCard id="walkins-2026-11" />
      <WhatsNewCard id="repair-costs-2026-11" />
      <div className="flex gap-2">
        <Button className="min-h-[48px] flex-1 rounded-xl" onClick={() => setReporting(true)}>
          <Plus /> {t("Report a problem", "Lapor kerusakan")}
        </Button>
        <Button variant="outline" className="min-h-[48px] flex-1 rounded-xl" onClick={() => setWalkIn(true)}>
          <HardHat /> {t("Someone's here", "Ada tukang datang")}
        </Button>
      </div>

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
          {board.open.length > 0 && (
            <Button
              variant="ghost"
              className="min-h-[44px] self-center rounded-xl text-gray-700"
              onClick={() => {
                setSending((n) => n + 1);
                setSendOpen(true);
              }}
            >
              <Share2 /> {t("Send to the developer", "Kirim ke developer")}
            </Button>
          )}
        </>
      )}

      <RepairReportSheet open={reporting} onClose={() => setReporting(false)} locale={locale} />
      <WalkInStartSheet
        open={walkIn}
        onClose={() => setWalkIn(false)}
        locale={locale}
        asStaff={false}
        onFinishOther={(visit) => {
          setWalkIn(false);
          setFinishing(visit);
        }}
      />
      <WalkInFinishSheet visit={finishing} onClose={() => setFinishing(null)} locale={locale} asStaff={false} />
      <RepairSheet repair={openRepair} onClose={() => setOpenId(null)} />
      <DeveloperListSheet
        key={sending}
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        items={developerList}
        walkIns={walkIns}
      />
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
  const { visits, walkIns } = useRepairs();
  const formatTime = useFormatTime();
  const placeName = useLocationName();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const stage = repairStage(repair, visits, undefined, walkIns);
  const place = placeName(repair.location_id, repair.spot);
  const attention = stage.kind === "check" || stage.kind === "reported" || stage.kind === "working";
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
