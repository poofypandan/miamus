"use client";

import { Badge } from "@/components/ui/badge";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { RoutineProposalSheet } from "@/components/staff/routine-proposal-sheet";
import { useHousehold } from "@/context/household-context";
import { formatTime12h } from "@/lib/time";
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

// Staff-facing, so entirely Bahasa Indonesia. Shows what this household has
// reported and proposed, so staff can see a request landed rather than filing
// the same thing twice.
export function StaffReportsPanel() {
  const { pets, inventoryAlerts, routineProposals } = useHousehold();
  const petName = (id: string) => pets.find((p) => p.id === id)?.name ?? "—";

  const openAlerts = inventoryAlerts.filter((a) => !a.resolved);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-gray-900">Laporan & Usulan</h2>

      <div className="flex flex-col gap-2">
        <LowStockFlagButton locale="id" />
        <RoutineProposalSheet />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-gray-500">Stok Menipis</h3>
        {openAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada laporan stok.</p>
        ) : (
          openAlerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">
                  {ITEM_LABELS[alert.item_type]} · {petName(alert.pet_id)}
                </span>
                {alert.note && <span className="text-muted-foreground"> — {alert.note}</span>}
              </span>
              <Badge className="shrink-0 bg-amber-100 text-amber-900">Dilaporkan</Badge>
            </div>
          ))
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-gray-500">Usulan Rutinitas</h3>
        {routineProposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada usulan rutinitas.</p>
        ) : (
          routineProposals.map((proposal) => (
            <div
              key={proposal.id}
              className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <span className="font-medium">
                  {proposal.title} · {petName(proposal.pet_id)}
                </span>
                <span className="text-muted-foreground"> — {formatTime12h(proposal.time)}</span>
              </span>
              <Badge className={`shrink-0 ${STATUS_CLASSES[proposal.status]}`}>
                {STATUS_LABELS[proposal.status]}
              </Badge>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
