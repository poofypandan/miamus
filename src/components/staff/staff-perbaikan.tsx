"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Camera, ChevronRight, CircleCheck, Clock, CloudUpload, Flag, HardHat, Wrench } from "lucide-react";
import { ChoreProofPhotos } from "@/components/chores/chore-proof-photos";
import { FinishChoreSheet } from "@/components/chores/finish-chore-sheet";
import { RepairReportSheet } from "@/components/repairs/repair-report-sheet";
import { WalkInFinishSheet, WalkInStartSheet } from "@/components/repairs/walkin-sheets";
import { SyncedImg } from "@/components/shared/synced-img";
import { useStaffIdentity } from "@/components/auth/staff-login-gate";
import { useHousehold } from "@/context/household-context";
import { useLocationName } from "@/hooks/use-household-locations";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { useRepairs } from "@/hooks/use-repairs";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { expandChores, occurrencesForStaff } from "@/lib/chore-recurrence";
import { applyLeaveTriage } from "@/lib/leave";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime } from "@/lib/time";
import { isOpenRepair, staffRepairStatus, walkInAsTask } from "@/lib/repairs";
import {
  isForgotten,
  openWalkIns,
  recentlyFinished,
  staffDurationWords,
  staffOutcomeLabel,
  supervisingNow,
  supervisionStretches,
  walkInSpanLabel,
  walkInsOf,
  type SupervisionStretch,
} from "@/lib/repair-walkins";
import { cn } from "@/lib/utils";
import type { Repair, RepairWalkIn } from "@/types/database";

/**
 * The staff's Perbaikan pill (Phase 174, plan mockup 1; Bahasa Indonesia
 * only), shown only while Repairs is on. The big button first; then, each
 * only when it has something: what's being worked on (tinted), today's
 * scheduled visits, what's still broken, and what was fixed this week.
 * Lapor kerusakan stays at the foot for a problem with no tukang yet.
 */
export function StaffRepairsView() {
  const { householdTasks, leaveRequests } = useHousehold();
  const { staffId } = useStaffIdentity();
  const { repairs, visits, walkIns, supervision, pendingIds } = useRepairs();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, "Staf");
  const placeName = useLocationName();
  const todayKey = formatDateLocal(useToday());
  useMinuteClock();

  const [starting, setStarting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [finishing, setFinishing] = useState<RepairWalkIn | null>(null);
  const [choreKey, setChoreKey] = useState<string | null>(null);

  const stretches = useMemo(() => supervisionStretches(supervision, walkIns, repairs), [supervision, walkIns, repairs]);
  const byId = useMemo(() => new Map(repairs.map((r) => [r.id, r])), [repairs]);
  const working = useMemo(() => openWalkIns(walkIns), [walkIns]);
  const fixed = useMemo(() => recentlyFinished(walkIns), [walkIns]);

  // Today's scheduled visits ("Awasi perbaikan"), whatever day the Tugas
  // ribbon is on; this phone's own and the unclaimed ones, as on Tugas.
  const todaysVisits = useMemo(() => {
    const all = applyLeaveTriage(expandChores({ rows: householdTasks, date: todayKey, today: todayKey }), leaveRequests);
    const mine = staffId ? occurrencesForStaff(all, staffId) : all;
    return mine.filter((o) => !!o.task.repair_id && o.date === todayKey && o.status === "pending");
  }, [householdTasks, leaveRequests, todayKey, staffId]);
  const openChore = todaysVisits.find((o) => o.key === choreKey) ?? null;

  const stillBroken = useMemo(() => {
    const busy = new Set(working.map((v) => v.repair_id));
    return repairs
      .filter((r) => (isOpenRepair(r, walkIns) || r.status === "reported") && !busy.has(r.id))
      .sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.created_at.localeCompare(a.created_at));
  }, [repairs, walkIns, working]);

  // The open-stretch holder of each open walk-in, for "diawasi Ari".
  const supervisorOf = (visitId: string) => stretches.find((s) => s.visitId === visitId && !s.end)?.staffId ?? null;

  /** A picked repair with a visit scheduled today opens that chore instead (plan, screen 2). */
  function openScheduled(repairId: string): boolean {
    const scheduled = todaysVisits.find((o) => o.task.repair_id === repairId);
    if (!scheduled) return false;
    setStarting(false);
    setChoreKey(scheduled.key);
    return true;
  }

  return (
    <div className="flex flex-col gap-3 pb-6">
      <button
        type="button"
        onClick={() => setStarting(true)}
        className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-primary px-4 text-left text-primary-foreground active:opacity-90"
      >
        <Wrench className="size-6 shrink-0" aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-semibold">Ada tukang datang</span>
          <span className="text-xs text-primary-foreground/75">Apa yang diperbaiki, siapa, foto sebelum</span>
        </span>
      </button>

      {working.length > 0 && (
        <Section title="Sedang dikerjakan">
          {working.map((visit) => {
            const repair = byId.get(visit.repair_id);
            const supervisor = supervisorOf(visit.id);
            return (
              <div
                key={visit.id}
                data-testid="walkin-open-card"
                className="flex flex-col gap-1.5 rounded-xl border border-amber-300 border-l-[3px] border-l-amber-500 bg-amber-50 p-3"
              >
                <div className="flex items-center gap-2.5">
                  <SyncedImg url={visit.before_photo_url} size={160} className="size-11 shrink-0 rounded-lg bg-muted object-cover" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-gray-900">{repair?.title ?? ""}</span>
                    {repair && placeName(repair.location_id, repair.spot) && (
                      <span className="truncate text-xs text-muted-foreground">{placeName(repair.location_id, repair.spot)}</span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFinishing(visit)}
                    className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground active:opacity-90"
                  >
                    <Camera className="size-4" aria-hidden /> Selesai
                  </button>
                </div>
                <p className="flex items-center gap-1 text-xs font-medium text-amber-900">
                  <HardHat className="size-3.5 shrink-0" aria-hidden />
                  {[
                    visit.worker_name,
                    supervisor ? `diawasi ${staffName(supervisor)}` : null,
                    walkInSpanLabel(visit, "id"),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {isForgotten(visit, todayKey) && (
                  <p className="flex items-center gap-1 text-xs font-medium text-amber-900">
                    <Clock className="size-3.5 shrink-0" aria-hidden /> Belum ditutup sejak kemarin
                  </p>
                )}
                {pendingIds.has(visit.id) && <Waiting />}
              </div>
            );
          })}
        </Section>
      )}

      {todaysVisits.length > 0 && (
        <Section title="Hari ini">
          {todaysVisits.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setChoreKey(o.key)}
              className="flex min-h-14 items-center gap-2.5 rounded-xl border bg-card p-3 text-left active:bg-muted"
            >
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-gray-900">{o.task.title}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {[o.task.due_time ? formatTime(o.task.due_time, "id") : null, placeName(o.task.location_id, o.task.spot), o.task.notes]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          ))}
        </Section>
      )}

      {stillBroken.length > 0 && (
        <Section title="Masih rusak">
          {stillBroken.map((repair) => (
            <div key={repair.id} className="flex items-center gap-2.5 rounded-xl border bg-card p-3">
              <RepairThumb repair={repair} walkIns={walkIns} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium text-gray-900">{repair.title}</span>
                {placeName(repair.location_id, repair.spot) && (
                  <span className="truncate text-xs text-muted-foreground">{placeName(repair.location_id, repair.spot)}</span>
                )}
              </span>
              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-gray-700">
                {staffRepairStatus(repair, visits, walkIns)}
              </span>
            </div>
          ))}
        </Section>
      )}

      {fixed.length > 0 && (
        <Section title="Sudah diperbaiki">
          {fixed.map((visit) => {
            const repair = byId.get(visit.repair_id);
            return (
              <div key={visit.id} className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{repair?.title ?? ""}</span>
                  <CircleCheck className="size-4 shrink-0 text-emerald-700" aria-hidden />
                </div>
                <ChoreProofPhotos row={walkInAsTask(visit, repair?.title ?? "")} locale="id" interactive />
                <p className="text-xs font-medium text-emerald-800">
                  {[visit.outcome ? staffOutcomeLabel(visit.outcome) : null, visit.worker_name, walkInSpanLabel(visit, "id")]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {pendingIds.has(visit.id) && <Waiting />}
              </div>
            );
          })}
        </Section>
      )}

      <button
        type="button"
        onClick={() => setReporting(true)}
        className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border bg-card text-sm font-medium text-gray-700 active:bg-muted"
      >
        <Flag className="size-4" aria-hidden /> Lapor kerusakan
      </button>

      <WalkInStartSheet
        open={starting}
        onClose={() => setStarting(false)}
        locale="id"
        asStaff
        onOpenScheduled={openScheduled}
        onFinishOther={(visit) => {
          setStarting(false);
          setFinishing(visit);
        }}
      />
      <WalkInFinishSheet visit={finishing} onClose={() => setFinishing(null)} locale="id" asStaff />
      <RepairReportSheet open={reporting} onClose={() => setReporting(false)} locale="id" asStaff />
      <FinishChoreSheet occurrence={openChore} open={!!openChore} onOpenChange={(next) => !next && setChoreKey(null)} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="mt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Waiting() {
  return (
    <p className="flex items-center gap-1 text-[11px] font-medium text-amber-900">
      <CloudUpload className="size-3.5" aria-hidden /> Menunggu dikirim
    </p>
  );
}

/** The problem's photo, or the first walk-in's before photo (a "Baru" repair has none of its own). */
function RepairThumb({ repair, walkIns }: { repair: Repair; walkIns: RepairWalkIn[] }) {
  const url = repair.photo_url ?? walkInsOf(repair.id, walkIns)[0]?.before_photo_url ?? null;
  if (!url) {
    return (
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Wrench className="size-4 text-muted-foreground" aria-hidden />
      </span>
    );
  }
  return <SyncedImg url={url} size={160} className="size-11 shrink-0 rounded-lg bg-muted object-cover" />;
}

/**
 * On Tugas Hari Ini, for the person supervising only (plan mockup 7):
 * "Sedang mengawasi perbaikan · AC menetes · sejak 10.00 · 1 jam 20 menit",
 * with Selesai. The same open walk-in as on the Perbaikan pill.
 */
export function SupervisingStrip() {
  const { staffId } = useStaffIdentity();
  const { repairs, walkIns, supervision } = useRepairs();
  const clock = useMinuteClock();
  const [finishing, setFinishing] = useState<RepairWalkIn | null>(null);
  const mine: SupervisionStretch | null = useMemo(() => {
    if (!staffId) return null;
    return supervisingNow(supervisionStretches(supervision, walkIns, repairs), walkIns).get(staffId) ?? null;
  }, [staffId, supervision, walkIns, repairs]);
  if (!mine) return null;
  const visit = walkIns.find((v) => v.id === mine.visitId) ?? null;
  const running = staffDurationWords(clock - new Date(mine.start).getTime());

  return (
    <>
      <div
        data-testid="supervising-strip"
        className={cn("flex items-center gap-3 rounded-xl border border-amber-300 border-l-[3px] border-l-amber-500 bg-amber-50 p-3")}
      >
        <Wrench className="size-5 shrink-0 text-amber-800" aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-amber-950">Sedang mengawasi perbaikan</span>
          <span className="truncate text-xs text-amber-900">
            {[mine.repairTitle, `sejak ${formatTime(new Date(mine.start), "id")}`, running].filter(Boolean).join(" · ")}
          </span>
        </span>
        {visit && (
          <button
            type="button"
            onClick={() => setFinishing(visit)}
            className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground active:opacity-90"
          >
            <Camera className="size-4" aria-hidden /> Selesai
          </button>
        )}
      </div>
      <WalkInFinishSheet visit={finishing} onClose={() => setFinishing(null)} locale="id" asStaff />
    </>
  );
}
