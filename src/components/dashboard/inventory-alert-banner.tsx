"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { isActiveAlert } from "@/lib/inventory-status";
import type { ItemType } from "@/types/database";

const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  food: "Food",
  medicine: "Medicine",
  treats: "Treats",
  shampoo: "Shampoo",
  other: "Other",
};

// Owner-only: surfaces low-stock flags staff raised from the Daily Feed so
// they're seen the moment the owner opens the app, not buried in a list.
export function InventoryAlertBanner() {
  const { userRole, inventoryAlerts, entities, resolveInventoryAlert } = useHousehold();

  if (userRole !== "owner") return null;

  const active = inventoryAlerts.filter(isActiveAlert);
  if (active.length === 0) return null;

  const entityById = new Map(entities.map((e) => [e.id, e]));

  return (
    <div className="flex flex-col gap-2 border-b border-amber-300 bg-amber-50 px-4 py-3">
      {active.map((alert) => (
        <AlertRow
          key={alert.id}
          petName={alert.pet_id ? (entityById.get(alert.pet_id)?.name ?? "Unknown pet") : null}
          itemLabel={ITEM_TYPE_LABELS[alert.item_type]}
          note={alert.note}
          onResolve={() => resolveInventoryAlert(alert.id)}
        />
      ))}
    </div>
  );
}

function AlertRow({
  petName,
  itemLabel,
  note,
  onResolve,
}: {
  // Null for a shared household item that isn't tied to any one dog.
  petName: string | null;
  itemLabel: string;
  note: string | null;
  onResolve: () => Promise<void>;
}) {
  const [resolving, setResolving] = useState(false);

  async function handleResolve() {
    setResolving(true);
    try {
      await onResolve();
      toast.success("Marked resolved");
    } catch (err) {
      console.error(err);
      toast.error("Failed to mark resolved");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex min-w-0 items-start gap-1.5 text-amber-900">
        <TriangleAlert className="size-4 shrink-0 translate-y-0.5" />
        <span className="min-w-0">
          <span className="font-medium">
            {petName ? `Low Stock: ${petName}'s ${itemLabel}` : `Low Stock: ${itemLabel} (Household)`}
          </span>
          {note && <span className="text-amber-800"> — {note}</span>}
        </span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="min-h-[36px] shrink-0 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
        onClick={handleResolve}
        disabled={resolving}
      >
        {resolving ? <Loader2 className="animate-spin" /> : null}
        Mark Resolved
      </Button>
    </div>
  );
}
