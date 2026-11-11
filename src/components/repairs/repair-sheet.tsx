"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Camera, CalendarPlus, Check, HardHat, Loader2, Pencil, RotateCcw, Siren, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { ChoreProofPhotos } from "@/components/chores/chore-proof-photos";
import { RepairReportSheet } from "@/components/repairs/repair-report-sheet";
import { RepairCostSection } from "@/components/repairs/repair-cost";
import { RepairNotes } from "@/components/repairs/repair-notes";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useLocationName } from "@/hooks/use-household-locations";
import { useRepairs } from "@/hooks/use-repairs";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { useFormatTime } from "@/components/ui/ui-labels";
import { dataProvider } from "@/lib/data";
import { photoSrc } from "@/lib/photos";
import { REPAIR_LIMITS, costEntryOpen, repairStage, visitNotes, visitTitle, visitsOf, walkInAsTask, warrantyLabel } from "@/lib/repairs";
import {
  isOpenWalkIn,
  ownerOutcomeLabel,
  supervisedByLine,
  supervisionStretches,
  walkInSpanLabel,
  walkInTime,
  walkInsOf,
  type SupervisionStretch,
} from "@/lib/repair-walkins";
import { WalkInFinishSheet } from "@/components/repairs/walkin-sheets";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { OwnerLocale } from "@/lib/owner-locale";
import type { HouseholdTask, Repair, RepairWalkIn } from "@/types/database";

export function shortDate(iso: string, locale: OwnerLocale): string {
  const date = iso.length === 10 ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

/**
 * One repair, for owners (Phase 159, mockup 3): the problem photo, where,
 * who reported it, then each visit with its before and after photos. The
 * buttons follow where it stands: Accept / Not needed for a staff report;
 * Schedule a visit; Fixed / Needs another visit once work is done; Reopen
 * when closed. Edit and Delete are quiet links.
 */
export function RepairSheet({ repair, onClose }: { repair: Repair | null; onClose: () => void }) {
  useBackToClose(!!repair, onClose);
  return (
    <Sheet open={!!repair} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[90dvh] max-w-md gap-0 overflow-y-auto rounded-t-2xl">
        {repair && <RepairDetail key={repair.id} repairId={repair.id} fallback={repair} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function RepairDetail({ repairId, fallback, onClose }: { repairId: string; fallback: Repair; onClose: () => void }) {
  const { repairs, visits, walkIns, supervision, reload } = useRepairs();
  // The live row, so a decision made here shows at once after the reload.
  const repair = repairs.find((r) => r.id === repairId) ?? fallback;
  const locale = useOwnerLocale();
  const t = useT();
  const formatTime = useFormatTime();
  const placeName = useLocationName();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const today = formatDateLocal(useToday());
  const [busy, setBusy] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [finishing, setFinishing] = useState<RepairWalkIn | null>(null);

  const stage = repairStage(repair, visits, today, walkIns);
  const mine = visitsOf(repair.id, visits);
  const myWalkIns = walkInsOf(repair.id, walkIns);
  const stretches = supervisionStretches(supervision, walkIns, repairs);
  const place = placeName(repair.location_id, repair.spot);

  async function act(run: () => Promise<unknown>, done: string, close = false) {
    setBusy(true);
    try {
      await run();
      await reload();
      toast.success(done);
      if (close) onClose();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  const setStatus = (status: "open" | "fixed" | "dismissed", done: string, extra: { dismiss_reason?: string | null } = {}) =>
    act(() => dataProvider.updateRepair(repair.id, { status, ...extra }), done);

  async function remove() {
    await act(async () => {
      await dataProvider.deleteRepair(repair.id);
      if (repair.photo_url) await dataProvider.deletePhoto(repair.photo_url).catch(() => undefined);
      // Its walk-ins went with it (the cascade); their photos too.
      for (const v of myWalkIns) {
        for (const url of [v.before_photo_url, v.after_photo_url]) {
          if (url) await dataProvider.deletePhoto(url).catch(() => undefined);
        }
      }
    }, t(`Deleted "${repair.title}"`, `"${repair.title}" dihapus`), true);
  }

  /** An owner may delete a single walk-in sooner than its repair (D8). */
  async function removeWalkIn(visit: RepairWalkIn) {
    await act(async () => {
      if (!(await dataProvider.deleteRepairWalkIn(visit.id))) throw new Error("Walk-in was not deleted.");
      for (const url of [visit.before_photo_url, visit.after_photo_url]) {
        if (url) await dataProvider.deletePhoto(url).catch(() => undefined);
      }
    }, t("Visit deleted", "Kunjungan dihapus"));
  }

  const reporter = repair.reported_by_staff
    ? t(`Reported by ${staffName(repair.reported_by_staff)}`, `Dilaporkan oleh ${staffName(repair.reported_by_staff)}`)
    : t("Reported by an owner", "Dilaporkan pemilik rumah");

  return (
    <>
      <SheetHeader className="gap-1 border-b pb-3">
        <SheetTitle className="flex items-center gap-2 pr-8 text-lg">
          {repair.urgent && <Siren className="size-5 shrink-0 text-red-700" aria-label={t("Urgent", "Darurat")} />}
          {repair.title}
        </SheetTitle>
        <SheetDescription>
          {[place, `${reporter} · ${shortDate(repair.created_at, locale)}`].filter(Boolean).join(" · ")}
        </SheetDescription>
      </SheetHeader>

      <div className="flex flex-col gap-4 px-4 pt-4 pb-6">
        {repair.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoSrc(repair.photo_url, 640)} alt="" className="max-h-64 w-full rounded-xl bg-muted object-cover" />
        )}
        {repair.details && <p className="text-sm text-gray-700">{repair.details}</p>}

        <StageLine repair={repair} stage={stage} locale={locale} formatTime={formatTime} staffName={staffName} />

        {mine.length + myWalkIns.length > 0 && (
          <section className="flex flex-col gap-3" aria-label={t("Visits", "Kunjungan")}>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("Visits", "Kunjungan")}
            </h3>
            {mine.map((visit) => (
              <VisitRow key={visit.id} visit={visit} locale={locale} formatTime={formatTime} staffName={staffName} />
            ))}
            {myWalkIns.map((visit) => (
              <WalkInRow
                key={visit.id}
                visit={visit}
                title={repair.title}
                stretches={stretches}
                locale={locale}
                staffName={staffName}
                busy={busy}
                onFinish={() => setFinishing(visit)}
                onDelete={() => void removeWalkIn(visit)}
              />
            ))}
          </section>
        )}

        {repair.fixed_by_name && (
          <p className="text-sm text-gray-700">
            {t("Repair person", "Tukang")}: <span className="font-medium">{repair.fixed_by_name}</span>
          </p>
        )}
        {warrantyLabel(repair.warranty_until, locale) && (
          <p className="text-sm text-gray-700">{warrantyLabel(repair.warranty_until, locale)}</p>
        )}
        {repair.status === "dismissed" && repair.dismiss_reason && (
          <p className="text-sm text-gray-700">
            {t("Not needed", "Tidak perlu")}: {repair.dismiss_reason}
          </p>
        )}

        {/* What can be done next, by where it stands. */}
        {stage.kind === "reported" &&
          (dismissing ? (
            <div className="flex flex-col gap-2 rounded-xl border p-3">
              <Input
                value={reason}
                maxLength={REPAIR_LIMITS.dismissReason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t("Why (optional; staff see it)", "Alasannya (opsional; staf bisa membaca)")}
                className="min-h-[44px]"
              />
              <div className="flex gap-2">
                <Button variant="outline" className="min-h-[44px] flex-1 rounded-xl" onClick={() => setDismissing(false)}>
                  {t("Cancel", "Batal")}
                </Button>
                <Button
                  className="min-h-[44px] flex-1 rounded-xl"
                  disabled={busy}
                  onClick={() =>
                    setStatus("dismissed", t("Marked not needed", "Ditandai tidak perlu"), {
                      dismiss_reason: reason.trim() || null,
                    })
                  }
                >
                  {busy && <Loader2 className="animate-spin" />} {t("Not needed", "Tidak perlu")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                className="min-h-[48px] flex-1 rounded-xl"
                disabled={busy}
                onClick={() => setStatus("open", t("Accepted", "Diterima"))}
              >
                <Check /> {t("Accept", "Terima")}
              </Button>
              <Button variant="outline" className="min-h-[48px] flex-1 rounded-xl" onClick={() => setDismissing(true)}>
                <X /> {t("Not needed", "Tidak perlu")}
              </Button>
            </div>
          ))}

        {stage.kind === "check" && (
          <div className="flex gap-2">
            <Button
              className="min-h-[48px] flex-1 rounded-xl"
              disabled={busy}
              onClick={() => setStatus("fixed", t("Marked fixed", "Ditandai sudah diperbaiki"))}
            >
              <Check /> {t("Fixed", "Sudah diperbaiki")}
            </Button>
            <Button variant="outline" className="min-h-[48px] flex-1 rounded-xl" onClick={() => setScheduling(true)}>
              <CalendarPlus /> {t("Needs another visit", "Perlu datang lagi")}
            </Button>
          </div>
        )}

        {(stage.kind === "unscheduled" || stage.kind === "scheduled") && (
          <div className="flex flex-col gap-2">
            <Button className="min-h-[48px] rounded-xl" onClick={() => setScheduling(true)}>
              <CalendarPlus /> {t("Schedule a visit", "Jadwalkan perbaikan")}
            </Button>
            <Button
              variant="ghost"
              className="min-h-[44px] rounded-xl"
              disabled={busy}
              onClick={() => setStatus("fixed", t("Marked fixed", "Ditandai sudah diperbaiki"))}
            >
              <Check /> {t("Already fixed", "Sudah diperbaiki")}
            </Button>
          </div>
        )}

        {(stage.kind === "fixed" || stage.kind === "dismissed") && (
          <Button
            variant="outline"
            className="min-h-[48px] rounded-xl"
            disabled={busy}
            onClick={() => setStatus("open", t("Reopened", "Dibuka lagi"))}
          >
            <RotateCcw /> {t("Reopen", "Buka lagi")}
          </Button>
        )}

        {/* PR B (migrations/131): what it cost (owners only), and the thread —
            below the next step, which is what the sheet is opened for. */}
        {costEntryOpen(repair, walkIns) && <RepairCostSection repairId={repair.id} />}
        <RepairNotes repairId={repair.id} locale={locale} />

        <div className="flex items-center justify-center gap-2 border-t pt-3">
          <Button variant="ghost" className="min-h-[44px]" onClick={() => setEditing(true)}>
            <Pencil /> {t("Edit", "Ubah")}
          </Button>
          {confirmDelete ? (
            <Button variant="destructive" className="min-h-[44px] rounded-xl" disabled={busy} onClick={remove}>
              <Trash2 /> {t("Delete for good", "Hapus permanen")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              className="min-h-[44px] text-destructive hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> {t("Delete", "Hapus")}
            </Button>
          )}
        </div>
        {confirmDelete && (
          <p className="-mt-2 text-center text-[11px] text-muted-foreground">
            {t(
              "The repair and its photo go. Visits stay as ordinary chores.",
              "Perbaikan dan fotonya dihapus. Kunjungannya tetap sebagai tugas biasa."
            )}
          </p>
        )}
      </div>

      <RepairReportSheet open={editing} onClose={() => setEditing(false)} locale={locale} repair={repair} />
      <WalkInFinishSheet visit={finishing} onClose={() => setFinishing(null)} locale={locale} asStaff={false} />
      <ChoreEditorDialog
        open={scheduling}
        onOpenChange={(open) => {
          setScheduling(open);
          if (!open) void reload();
        }}
        task={null}
        defaultDate={today}
        preset={{
          title: visitTitle(repair),
          locationId: repair.location_id,
          spot: repair.spot,
          category: "maintenance",
          notes: visitNotes(repair),
          repairId: repair.id,
        }}
      />
    </>
  );
}

function StageLine({
  repair,
  stage,
  locale,
  formatTime,
  staffName,
}: {
  repair: Repair;
  stage: ReturnType<typeof repairStage>;
  locale: OwnerLocale;
  formatTime: (value: string) => string;
  staffName: (id: string | null | undefined) => string;
}) {
  const text = repairStageText(repair, stage, locale, formatTime, staffName);
  const tint =
    stage.kind === "check" || stage.kind === "reported" || stage.kind === "working"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "bg-muted/60 text-gray-700";
  return <p className={`rounded-xl border px-3 py-2 text-sm font-medium ${tint}`}>{text}</p>;
}

/** Where a repair stands, in a few words, for the owners' list and sheet. */
export function repairStageText(
  repair: Repair,
  stage: ReturnType<typeof repairStage>,
  locale: OwnerLocale,
  formatTime: (value: string) => string,
  staffName: (id: string | null | undefined) => string
): string {
  const id = locale === "id";
  switch (stage.kind) {
    case "reported":
      return id ? "Perlu dicek: terima atau tolak" : "To review: accept or dismiss";
    case "unscheduled":
      return id ? "Belum dijadwalkan" : "Not scheduled";
    case "working": {
      const who = stage.walkIn.worker_name?.trim();
      const since = walkInSpanLabel(stage.walkIn, locale);
      return who
        ? id
          ? `${who} sedang bekerja · ${since}`
          : `${who} is here · ${since}`
        : id
          ? `Tukang sedang bekerja · ${since}`
          : `A repair person is here · ${since}`;
    }
    case "scheduled": {
      const v = stage.next;
      const parts = [shortDate(v.due_date, locale), v.due_time ? formatTime(v.due_time.slice(0, 5)) : null].filter(Boolean).join(" ");
      const who = repair.fixed_by_name ?? (v.assigned_to ? staffName(v.assigned_to) : null);
      return who ? `${parts} · ${who}` : parts;
    }
    case "check":
      return id ? "Pekerjaan selesai — cek fotonya" : "Work done — check the photos";
    case "fixed": {
      const when = repair.closed_at ? shortDate(repair.closed_at, locale) : "";
      const base = id ? `Sudah diperbaiki ${when}` : `Fixed ${when}`;
      return repair.fixed_by_name ? `${base} · ${repair.fixed_by_name}` : base;
    }
    case "dismissed":
      return id ? "Tidak perlu" : "Not needed";
  }
}

function VisitRow({
  visit,
  locale,
  formatTime,
  staffName,
}: {
  visit: HouseholdTask;
  locale: OwnerLocale;
  formatTime: (value: string) => string;
  staffName: (id: string | null | undefined) => string;
}) {
  const id = locale === "id";
  const when = [shortDate(visit.due_date, locale), visit.due_time ? formatTime(visit.due_time.slice(0, 5)) : null]
    .filter(Boolean)
    .join(" ");
  const status =
    visit.status === "completed"
      ? id
        ? "selesai"
        : "done"
      : id
        ? "dijadwalkan"
        : "planned";
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3">
      <p className="text-sm">
        <span className="font-medium">{when}</span>
        {visit.assigned_to && ` · ${staffName(visit.assigned_to)}`} · <span className="text-muted-foreground">{status}</span>
      </p>
      {visit.status === "completed" && <ChoreProofPhotos row={visit} locale={locale} interactive />}
    </div>
  );
}

/**
 * A walk-in in the repair's timeline (Phase 174, plan mockup 5): "Walk-in ·
 * Pak Budi · Tue 9:10–11:40 AM · logged by Ari", who supervised, before and
 * after side by side, the chip and the note. An open one can be finished
 * here; an owner can delete a visit sooner than its repair (D8).
 */
function WalkInRow({
  visit,
  title,
  stretches,
  locale,
  staffName,
  busy,
  onFinish,
  onDelete,
}: {
  visit: RepairWalkIn;
  title: string;
  stretches: SupervisionStretch[];
  locale: OwnerLocale;
  staffName: (id: string | null | undefined) => string;
  busy: boolean;
  onFinish: () => void;
  onDelete: () => void;
}) {
  const id = locale === "id";
  const [confirm, setConfirm] = useState(false);
  const arrived = walkInTime(visit, "in");
  const head = [id ? "Datang langsung" : "Walk-in", visit.worker_name?.trim()].filter(Boolean).join(" · ");
  const when = [
    arrived ? shortDate(arrived.at, locale) : null,
    walkInSpanLabel(visit, locale),
    visit.logged_by_staff ? (id ? `dicatat ${staffName(visit.logged_by_staff)}` : `logged by ${staffName(visit.logged_by_staff)}`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const sentLater = walkInTime(visit, "in")?.phoneTime || walkInTime(visit, "out")?.phoneTime;
  const supervised = supervisedByLine(stretches, visit.id, (sid) => staffName(sid), locale);
  return (
    <div className="flex flex-col gap-2 rounded-xl border p-3" data-testid="walkin-row">
      <p className="flex items-start gap-1.5 text-sm">
        <HardHat className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{head}</span>
          <span className="text-xs text-muted-foreground">
            {when}
            {sentLater && (id ? " · jam HP, dikirim belakangan" : " · phone time, sent later")}
          </span>
          {supervised && <span className="text-xs text-muted-foreground">{supervised}</span>}
        </span>
      </p>
      <ChoreProofPhotos row={walkInAsTask(visit, title)} locale={locale} interactive />
      {visit.outcome && (
        <p className="flex items-center gap-1 text-sm font-medium text-gray-800">
          <Check className="size-4 shrink-0" aria-hidden /> {ownerOutcomeLabel(visit.outcome, locale)}
        </p>
      )}
      {visit.note && <p className="text-sm text-gray-700">{visit.note}</p>}
      <div className="flex flex-wrap items-center gap-2">
        {isOpenWalkIn(visit) && (
          <Button className="min-h-[44px] rounded-xl" onClick={onFinish}>
            <Camera /> {id ? "Selesai" : "Finished"}
          </Button>
        )}
        {confirm ? (
          <Button variant="destructive" className="min-h-[44px] rounded-xl" disabled={busy} onClick={onDelete}>
            <Trash2 /> {id ? "Hapus kunjungan ini" : "Delete this visit"}
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="min-h-[44px] text-destructive hover:text-destructive"
            onClick={() => setConfirm(true)}
          >
            <Trash2 /> {id ? "Hapus" : "Delete"}
          </Button>
        )}
      </div>
    </div>
  );
}
