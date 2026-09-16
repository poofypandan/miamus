"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2, PackageX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { isActiveAlert, isRestocked, restockedAt } from "@/lib/inventory-status";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { InventoryAlert, ItemType } from "@/types/database";

// Three rows, matching the photo grid's cap: the history is a record, not the
// day's work, so it stays a glance rather than a list to scroll past.
const COLLAPSED_LIMIT = 3;

const ITEM_LABELS: Record<ItemType, string> = {
  food: "Food",
  medicine: "Medicine",
  treats: "Treats",
  shampoo: "Shampoo",
  pee_pad: "Pee Pad",
  other: "Other",
};

// Owner-facing, so entirely English per the Phase 46 language boundary.
export function InventoryAlertsPanel() {
  const { inventoryAlerts, entities, userRole, selectedDate } = useHousehold();
  const [tab, setTab] = useState<"active" | "history">("active");
  const [isExpanded, setIsExpanded] = useState(false);
  const dateStr = formatDateLocal(selectedDate);

  const entityById = useMemo(() => new Map(entities.map((e) => [e.id, e])), [entities]);

  const active = useMemo(
    () =>
      inventoryAlerts
        .filter(isActiveAlert)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [inventoryAlerts]
  );

  // Restocks belong to the day they happened, so this follows the same
  // selectedDate as the feed and the photo grid rather than showing every
  // restock ever. Active alerts stay unfiltered: something still running low
  // is a problem today whichever day is being browsed.
  const history = useMemo(
    () =>
      inventoryAlerts
        .filter((alert) => isRestocked(alert) && formatDateLocal(new Date(restockedAt(alert))) === dateStr)
        .sort((a, b) => restockedAt(b).localeCompare(restockedAt(a))),
    [inventoryAlerts, dateStr]
  );

  // Browsing to another day, or switching tabs, starts collapsed again.
  const [lastKey, setLastKey] = useState(`${tab}|${dateStr}`);
  if (lastKey !== `${tab}|${dateStr}`) {
    setLastKey(`${tab}|${dateStr}`);
    setIsExpanded(false);
  }

  if (userRole !== "owner") return null;
  if (inventoryAlerts.length === 0) return null;

  const matching = tab === "active" ? active : history;
  const capped = tab === "history" && matching.length > COLLAPSED_LIMIT;
  const rows = capped && !isExpanded ? matching.slice(0, COLLAPSED_LIMIT) : matching;

  return (
    <section className="mt-8 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-900">Inventory</h3>

      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        <TabButton active={tab === "active"} onClick={() => setTab("active")}>
          Active Alerts {active.length > 0 && `(${active.length})`}
        </TabButton>
        <TabButton active={tab === "history"} onClick={() => setTab("history")}>
          Restocked {history.length > 0 && `(${history.length})`}
        </TabButton>
      </div>

      {rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          {tab === "active" ? "Nothing is running low." : "No restocks on this day."}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              petName={alert.pet_id ? (entityById.get(alert.pet_id)?.name ?? null) : null}
            />
          ))}

          {capped && (
            <button
              type="button"
              onClick={() => setIsExpanded((expanded) => !expanded)}
              aria-expanded={isExpanded}
              className="flex min-h-[44px] items-center justify-center gap-1 rounded-lg text-sm font-medium text-zinc-600 transition-colors active:bg-zinc-100"
            >
              {isExpanded ? "Show Fewer" : `View All Restocked (${matching.length})`}
              <ChevronDown className={cn("size-4 transition-transform", isExpanded && "rotate-180")} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "min-h-[40px] flex-1 rounded-lg bg-white text-sm font-medium text-gray-900 shadow-sm"
          : "min-h-[40px] flex-1 rounded-lg text-sm font-medium text-gray-500"
      }
    >
      {children}
    </button>
  );
}

function AlertRow({ alert, petName }: { alert: InventoryAlert; petName: string | null }) {
  const { resolveInventoryAlert } = useHousehold();
  const [busy, setBusy] = useState(false);
  const restocked = isRestocked(alert);

  // A shared household item has no pet to name — Phase 49 made pet_id optional.
  const subject = petName ? `${petName}'s ${ITEM_LABELS[alert.item_type]}` : `${ITEM_LABELS[alert.item_type]} (Household)`;

  async function handleResolve() {
    setBusy(true);
    try {
      await resolveInventoryAlert(alert.id);
      toast.success(`Marked restocked — ${subject}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to mark restocked");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm">
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{subject}</span>
        {alert.note && <span className="truncate text-xs text-muted-foreground">{alert.note}</span>}
        {restocked && (
          <span className="text-xs text-muted-foreground">
            Restocked{" "}
            {new Date(restockedAt(alert)).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </span>
        )}
      </span>

      {restocked ? (
        <Badge className="shrink-0 gap-1 bg-emerald-600 text-white">
          <Check className="size-3.5" /> Restocked
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="min-h-[40px] shrink-0"
          onClick={handleResolve}
          disabled={busy}
        >
          {busy ? <Loader2 className="animate-spin" /> : <PackageX />}
          Restocked
        </Button>
      )}
    </div>
  );
}
