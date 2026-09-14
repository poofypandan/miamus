"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { AdHocSheet } from "@/components/staff/adhoc-sheet";
import { RoutineProposalSheet } from "@/components/staff/routine-proposal-sheet";
import { useHousehold } from "@/context/household-context";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import { isWithinUndoWindow } from "@/lib/undo-window";
import type { ItemType, ProposalStatus } from "@/types/database";

const ITEM_LABELS: Record<ItemType, string> = {
  food: "Makanan",
  medicine: "Obat",
  treats: "Camilan",
  shampoo: "Sampo",
};

const STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
};

const STATUS_CLASSES: Record<ProposalStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-600 text-white",
  rejected: "bg-gray-200 text-gray-700",
};

// Staff-facing, so entirely Bahasa Indonesia. Collects the three manual input
// actions into one stack and lists what this household has filed, each entry
// undoable for five minutes after it was created.
export function StaffReportsPanel() {
  const {
    pets,
    inventoryAlerts,
    routineProposals,
    logs,
    undoInventoryAlert,
    undoRoutineProposal,
    deleteLogWithPhoto,
  } = useHousehold();

  // Re-renders on a timer so an entry's Batal button disappears when its
  // window lapses, rather than lingering until something else causes a render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const petName = (id: string) => pets.find((p) => p.id === id)?.name ?? "—";
  const openAlerts = inventoryAlerts.filter((a) => !a.resolved);

  // Ad-hoc entries are the ones with no schedule behind them — Catat Ekstra
  // writes exactly that. Scoped to today so the list stays short.
  const extraLogs = useMemo(() => {
    const today = formatDateLocal(new Date());
    return logs
      .filter((l) => !l.schedule_id && formatDateLocal(new Date(l.completed_at)) === today)
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  }, [logs]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Laporan & Usulan</h2>

      <div className="flex flex-col gap-2">
        <LowStockFlagButton locale="id" />
        <RoutineProposalSheet />
        <AdHocSheet />
      </div>

      <ReportList title="Stok Menipis" empty="Belum ada laporan stok.">
        {openAlerts.map((alert) => (
          <ReportRow
            key={alert.id}
            label={`${ITEM_LABELS[alert.item_type]} · ${petName(alert.pet_id)}`}
            detail={alert.note}
            badge={<Badge className="shrink-0 bg-amber-100 text-amber-900">Dilaporkan</Badge>}
            undoable={isWithinUndoWindow(alert.created_at, now)}
            onUndo={() => undoInventoryAlert(alert.id)}
          />
        ))}
      </ReportList>

      <ReportList title="Usulan Rutinitas" empty="Belum ada usulan rutinitas.">
        {routineProposals.map((proposal) => (
          <ReportRow
            key={proposal.id}
            label={`${proposal.title} · ${petName(proposal.pet_id)}`}
            detail={formatTime12h(proposal.time)}
            badge={
              <Badge className={`shrink-0 ${STATUS_CLASSES[proposal.status]}`}>
                {STATUS_LABELS[proposal.status]}
              </Badge>
            }
            // Only an undecided proposal can be withdrawn — pulling one the
            // owner already approved would leave the schedule it created
            // behind with nothing explaining it.
            undoable={proposal.status === "pending" && isWithinUndoWindow(proposal.created_at, now)}
            onUndo={() => undoRoutineProposal(proposal.id)}
          />
        ))}
      </ReportList>

      <ReportList title="Catatan Ekstra" empty="Belum ada catatan ekstra hari ini.">
        {extraLogs.map((log) => (
          <ReportRow
            key={log.id}
            label={`${log.notes ?? "Catatan"} · ${petName(log.entity_id)}`}
            detail={formatTime12h(new Date(log.completed_at))}
            undoable={isWithinUndoWindow(log.completed_at, now)}
            onUndo={() => deleteLogWithPhoto(log)}
          />
        ))}
      </ReportList>
    </section>
  );
}

function ReportList({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-xs font-medium text-gray-500">{title}</h3>
      {hasRows ? children : <p className="text-sm text-muted-foreground">{empty}</p>}
    </div>
  );
}

function ReportRow({
  label,
  detail,
  badge,
  undoable,
  onUndo,
}: {
  label: string;
  detail?: string | null;
  badge?: ReactNode;
  undoable: boolean;
  onUndo: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  async function handleUndo() {
    setBusy(true);
    try {
      await onUndo();
      toast.success("Berhasil dibatalkan");
    } catch (err) {
      console.error(err);
      toast.error("Gagal membatalkan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate">
        <span className="font-medium">{label}</span>
        {detail && <span className="text-muted-foreground"> — {detail}</span>}
      </span>
      {badge}
      {undoable && (
        <button
          type="button"
          onClick={handleUndo}
          disabled={busy}
          aria-label="Batalkan"
          className="flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-destructive active:bg-destructive/10"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
          Batal
        </button>
      )}
    </div>
  );
}
