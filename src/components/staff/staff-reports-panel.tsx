"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { AdHocSheet } from "@/components/staff/adhoc-sheet";
import { StaffRoutinePicker } from "@/components/staff/staff-routine-picker";
import { useHousehold } from "@/context/household-context";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { formatTime12h } from "@/lib/time";
import { isActiveAlert } from "@/lib/inventory-status";
import { groupProposals, batchCreatedAt, type ProposalBatch } from "@/lib/proposal-batches";
import { isWithinUndoWindow } from "@/lib/undo-window";
import type { ItemType, ProposalStatus } from "@/types/database";

const DISMISSED_KEY = "dismissed_proposals";
const RECENT_DECISION_MS = 24 * 60 * 60 * 1000;

/**
 * Batches the staff member has tapped "Oke" on, kept in localStorage.
 *
 * Deliberately local rather than a database column: acknowledging that you
 * have seen the owner's answer is a per-device reading state, not a fact about
 * the proposal. Writing it to the row would clear the notice for everyone the
 * moment one person dismissed it.
 */
function useDismissedBatches() {
  // Starts empty and fills after mount — localStorage doesn't exist during
  // SSR, and reading it while rendering would make the first client paint
  // disagree with the server HTML.
  const [dismissed, setDismissed] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DISMISSED_KEY);
      if (raw) setDismissed(JSON.parse(raw) as string[]);
    } catch {
      // Blocked or corrupt storage — nothing dismissed is the safe default.
    }
  }, []);

  function dismiss(key: string) {
    setDismissed((prev) => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      try {
        window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
      } catch {
        // The batch still disappears for this session.
      }
      return next;
    });
  }

  return { dismissed, dismiss };
}

const ITEM_LABELS: Record<ItemType, string> = {
  food: "Makanan",
  medicine: "Obat",
  treats: "Camilan",
  shampoo: "Sampo",
  pee_pad: "Pee Pad",
  other: "Lainnya",
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
  const { dismissed, dismiss } = useDismissedBatches();

  // Pending submissions stay until decided; decided ones linger a day so the
  // staff member sees the answer, then drop off on their own. Anything they
  // tap "Oke" on goes immediately.
  //
  // Measured from created_at because routine_proposals has no updated_at — a
  // proposal decided long after it was filed ages out on its filing date.
  const proposalBatches = useMemo(() => {
    return groupProposals(routineProposals)
      .filter((batch) => {
        if (dismissed.includes(batch.key)) return false;
        if (batch.status === "pending") return true;
        return now - new Date(batchCreatedAt(batch)).getTime() < RECENT_DECISION_MS;
      })
      .sort((a, b) => batchCreatedAt(b).localeCompare(batchCreatedAt(a)));
  }, [routineProposals, dismissed, now]);
  const openAlerts = inventoryAlerts.filter(isActiveAlert);

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
        <StaffRoutinePicker />
        <AdHocSheet />
      </div>

      <ReportList title="Stok Menipis" empty="Belum ada laporan stok.">
        {openAlerts.map((alert) => (
          <ReportRow
            key={alert.id}
            // A shared household item has no dog to name.
            label={`${ITEM_LABELS[alert.item_type]} · ${
              alert.pet_id ? petName(alert.pet_id) : "Umum"
            }`}
            detail={alert.note}
            badge={<Badge className="shrink-0 bg-amber-100 text-amber-900">Dilaporkan</Badge>}
            undoable={isWithinUndoWindow(alert.created_at, now)}
            onUndo={() => undoInventoryAlert(alert.id)}
          />
        ))}
      </ReportList>

      <ReportList title="Usulan Jadwal" empty="Belum ada usulan jadwal.">
        {proposalBatches.map((batch) => (
          <ProposalBatchRow
            key={batch.key}
            batch={batch}
            petName={petName(batch.proposals[0].pet_id)}
            now={now}
            onDismiss={() => dismiss(batch.key)}
            onUndo={async () => {
              for (const proposal of batch.proposals) await undoRoutineProposal(proposal.id);
            }}
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

function ProposalBatchRow({
  batch,
  petName,
  now,
  onDismiss,
  onUndo,
}: {
  batch: ProposalBatch;
  petName: string;
  now: number;
  onDismiss: () => void;
  onUndo: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const head = batch.proposals[0];
  const count = batch.proposals.length;
  const decided = batch.status !== "pending";

  // The whole submission can still be withdrawn while it is undecided and
  // inside the undo window.
  const undoable = !decided && isWithinUndoWindow(batchCreatedAt(batch), now);

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
        <span className="font-medium">
          {head.title} · {petName}
        </span>
        {count > 1 && <span className="text-muted-foreground"> ({count} jadwal)</span>}
      </span>

      <Badge className={`shrink-0 ${STATUS_CLASSES[batch.status]}`}>
        {STATUS_LABELS[batch.status]}
      </Badge>

      {decided && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Oke, sembunyikan"
          className="min-h-[36px] shrink-0 rounded-lg px-2 text-xs font-medium text-muted-foreground active:bg-muted"
        >
          Oke
        </button>
      )}

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
