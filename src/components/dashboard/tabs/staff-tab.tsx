"use client";

import { useMemo } from "react";
import { Camera, Info, PackageX, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useHousehold } from "@/context/household-context";
import { useRequireOwner } from "@/hooks/use-require-owner";
import { describeLog } from "@/lib/schedule-categories";
import { formatTime12h } from "@/lib/time";
import type { ItemType } from "@/types/database";

const AUDIT_LIMIT = 20;

const ITEM_LABELS: Record<ItemType, string> = {
  food: "Food",
  medicine: "Medicine",
  treats: "Treats",
  shampoo: "Shampoo",
  pee_pad: "Pee Pad",
  other: "Other",
};

type AuditKind = "log" | "proposal" | "alert";

interface AuditEntry {
  id: string;
  kind: AuditKind;
  at: string;
  action: string;
  subject: string;
  actor: string;
}

const KIND_META: Record<AuditKind, { icon: typeof Camera; label: string; className: string }> = {
  log: { icon: Camera, label: "Task", className: "bg-emerald-100 text-emerald-900" },
  proposal: { icon: Send, label: "Proposal", className: "bg-amber-100 text-amber-900" },
  alert: { icon: PackageX, label: "Inventory", className: "bg-sky-100 text-sky-900" },
};

// Owner-facing, so entirely English per the Phase 46 language boundary.
export function StaffTab() {
  const { logs, routineProposals, inventoryAlerts, pets, schedules, loading } = useHousehold();
  const isOwner = useRequireOwner();

  const petName = useMemo(() => {
    const byId = new Map(pets.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (byId.get(id) ?? "Unknown pet") : "Household");
  }, [pets]);

  // Three tables, one chronology. Built from data the dashboard already holds
  // rather than re-querying, so the list stays in step with everything else on
  // screen.
  const entries = useMemo<AuditEntry[]>(() => {
    const rows: AuditEntry[] = [
      ...logs.map((log) => ({
        id: `log-${log.id}`,
        kind: "log" as const,
        at: log.completed_at,
        action: log.photo_url ? "Logged with photo" : "Logged",
        subject: `${describeLog(log, schedules).title} · ${petName(log.entity_id)}`,
        actor: "Staff",
      })),
      ...routineProposals.map((proposal) => ({
        id: `proposal-${proposal.id}`,
        kind: "proposal" as const,
        at: proposal.created_at,
        action: `Proposed routine · ${proposal.status}`,
        subject: `${proposal.title} · ${petName(proposal.pet_id)}`,
        // The only column in the schema that records an author at all.
        actor: proposal.created_by ? titleCase(proposal.created_by) : "Staff",
      })),
      ...inventoryAlerts.map((alert) => ({
        id: `alert-${alert.id}`,
        kind: "alert" as const,
        at: alert.created_at,
        action: "Reported low stock",
        subject: `${ITEM_LABELS[alert.item_type]} · ${petName(alert.pet_id)}`,
        actor: "Staff",
      })),
    ];
    return rows.sort((a, b) => b.at.localeCompare(a.at)).slice(0, AUDIT_LIMIT);
  }, [logs, routineProposals, inventoryAlerts, schedules, petName]);

  if (!isOwner) return null;

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-900">Audit Log</h2>

      {/* Stated rather than implied. Everyone signs in with one shared
          household PIN and has no database identity (see
          supabase/rls-policies.sql), so the app can show what was done and
          when, but not which person did it. Labelling every row with an
          invented name would be worse than saying so. */}
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>
          Staff share one household PIN, so actions are attributed to the staff role rather than
          to an individual. Per-person attribution needs individual sign-ins.
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="pt-4 text-center text-sm text-muted-foreground">No staff activity yet.</p>
      ) : (
        <Card className="py-2">
          <CardContent className="flex flex-col divide-y px-0">
            {entries.map((entry) => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const meta = KIND_META[entry.kind];
  const Icon = meta.icon;
  const at = new Date(entry.at);

  return (
    <div className="flex items-start gap-3 px-4 py-3 text-sm">
      <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${meta.className}`}>
        <Icon className="size-3.5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{entry.subject}</span>
        <span className="truncate text-xs text-muted-foreground">
          {entry.action} · {entry.actor}
        </span>
      </span>
      <span className="shrink-0 text-right text-xs text-muted-foreground">
        <span className="block">{at.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        <span className="block tabular-nums">{formatTime12h(at)}</span>
      </span>
      <Badge variant="secondary" className="hidden shrink-0 text-[10px] sm:inline-flex">
        {meta.label}
      </Badge>
    </div>
  );
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
