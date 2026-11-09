"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, Check, Loader2, Pencil, RotateCcw, Siren, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChoreEditorDialog } from "@/components/chores/chore-editor-dialog";
import { ChoreProofPhotos } from "@/components/chores/chore-proof-photos";
import { RepairReportSheet } from "@/components/repairs/repair-report-sheet";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useLocationName } from "@/hooks/use-household-locations";
import { useRepairs } from "@/hooks/use-repairs";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { useFormatTime } from "@/components/ui/ui-labels";
import { dataProvider } from "@/lib/data";
import { photoSrc } from "@/lib/photos";
import { REPAIR_LIMITS, repairStage, visitNotes, visitTitle, visitsOf } from "@/lib/repairs";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { OwnerLocale } from "@/lib/owner-locale";
import type { HouseholdTask, Repair } from "@/types/database";

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
  const { repairs, visits, reload } = useRepairs();
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

  const stage = repairStage(repair, visits);
  const mine = visitsOf(repair.id, visits);
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
    }, t(`Deleted "${repair.title}"`, `"${repair.title}" dihapus`), true);
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

        {mine.length > 0 && (
          <section className="flex flex-col gap-3" aria-label={t("Visits", "Kunjungan")}>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("Visits", "Kunjungan")}
            </h3>
            {mine.map((visit) => (
              <VisitRow key={visit.id} visit={visit} locale={locale} formatTime={formatTime} staffName={staffName} />
            ))}
          </section>
        )}

        {repair.fixed_by_name && (
          <p className="text-sm text-gray-700">
            {t("Repair person", "Tukang")}: <span className="font-medium">{repair.fixed_by_name}</span>
          </p>
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
  const tint = stage.kind === "check" || stage.kind === "reported" ? "border-amber-200 bg-amber-50 text-amber-900" : "bg-muted/60 text-gray-700";
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
