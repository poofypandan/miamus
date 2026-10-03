"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { pushInPlace } from "@/lib/in-place-navigation";
import { toast } from "sonner";
import { ClipboardCopy, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { InventoryItemCard } from "@/components/inventory/inventory-item-card";
import { InventoryItemForm } from "@/components/inventory/inventory-item-form";
import { useHousehold } from "@/context/household-context";
import {
  INVENTORY_SCOPES,
  SCOPE_LABELS_EN,
  SCOPE_LABELS_ID,
  buildShoppingList,
  compareForList,
  isLowStock,
} from "@/lib/inventory";
import type { InventoryItem, InventoryScope } from "@/types/database";

const COPY = {
  en: {
    scopes: SCOPE_LABELS_EN,
    aria: "Inventory",
    add: "Add item",
    copy: "Copy shopping list",
    copied: (n: number) => `Shopping list copied — ${n} item${n === 1 ? "" : "s"}`,
    copyFailed: "Couldn't copy to the clipboard",
    emptyTitle: (scope: InventoryScope) =>
      scope === "pet" ? "No pet supplies yet" : "No home supplies yet",
    empty: (scope: InventoryScope) =>
      scope === "pet"
        ? "Tap Add item for the dog food, supplies and medicine this household keeps."
        : "Tap Add item for the fresh food, pantry staples and household supplies you keep.",
  },
  id: {
    scopes: SCOPE_LABELS_ID,
    aria: "Inventaris",
    add: "",
    copy: "",
    copied: () => "",
    copyFailed: "",
    emptyTitle: () => "Belum ada barang",
    empty: () => "Pemilik belum menambahkan barang di sini.",
  },
} as const;

/**
 * The inventory, split into Pets and Home (Phase 110).
 *
 * Shared by the owner's Inventory tab and the staff view's "Stok". Both see
 * the same cards with the same +/- steppers; only `canManage` (the owner)
 * adds the Add / Edit / Delete controls and the shopping list. Staff count
 * stock up and down and look at reference photos — and the database holds
 * them to exactly that (migrations/099), whatever this component renders.
 *
 * Which half is showing lives in the URL (?scope=), per CLAUDE.md's State
 * Persistence rule, so the pill and the list always read the same value and
 * Back returns to the other half.
 */
export function InventoryBoard({ lang, canManage }: { lang: "en" | "id"; canManage: boolean }) {
  const { inventoryItems, loading } = useHousehold();
  const t = COPY[lang];

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const param = searchParams.get("scope");
  const scope: InventoryScope = param === "home" ? "home" : "pet";

  function setScope(next: InventoryScope) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("scope", next);
    // In place: the scope pill is the same page (Phase 121).
    pushInPlace(`${pathname}?${params.toString()}`);
  }

  // null = closed; "new" = adding; an item = editing it.
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);

  const lowCounts = useMemo(() => {
    const counts: Record<InventoryScope, number> = { pet: 0, home: 0 };
    for (const item of inventoryItems) if (isLowStock(item)) counts[item.scope] += 1;
    return counts;
  }, [inventoryItems]);

  const visible = useMemo(
    () => inventoryItems.filter((item) => item.scope === scope).sort(compareForList),
    [inventoryItems, scope]
  );

  async function copyShoppingList() {
    const list = buildShoppingList(inventoryItems);
    if (!list) return;
    try {
      await navigator.clipboard.writeText(list);
      toast.success(t.copied(lowCounts.pet + lowCounts.home));
    } catch (err) {
      // Clipboard access needs a secure context and, on some browsers, a
      // permission — neither is guaranteed inside an installed PWA.
      console.error(err);
      toast.error(t.copyFailed);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SegmentedControl
        ariaLabel={t.aria}
        segments={INVENTORY_SCOPES.map((s) => ({
          value: s,
          label: t.scopes[s],
          // How many are low on each side, so the other half's problems are
          // visible without switching to it.
          badge: lowCounts[s] > 0 ? lowCounts[s] : undefined,
        }))}
        value={scope}
        onChange={setScope}
      />

      {canManage && (
        <div className="flex gap-2">
          <Button className="min-h-[44px] flex-1" onClick={() => setEditing("new")}>
            <Plus /> {t.add}
          </Button>
          {lowCounts.pet + lowCounts.home > 0 && (
            <Button variant="outline" className="min-h-[44px] flex-1" onClick={copyShoppingList}>
              <ClipboardCopy /> {t.copy}
            </Button>
          )}
        </div>
      )}

      {loading && inventoryItems.length === 0 ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Package} title={t.emptyTitle(scope)} description={t.empty(scope)} />
      ) : (
        <div className="flex flex-col gap-2">
          {visible.map((item) => (
            <InventoryItemCard
              key={item.id}
              item={item}
              lang={lang}
              onEdit={canManage ? () => setEditing(item) : undefined}
            />
          ))}
        </div>
      )}

      {canManage && (
        <InventoryItemForm
          open={editing !== null}
          onOpenChange={(open) => !open && setEditing(null)}
          item={editing === "new" ? null : editing}
          defaultScope={scope}
        />
      )}
    </div>
  );
}
