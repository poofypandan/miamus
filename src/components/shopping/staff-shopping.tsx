"use client";

import { useMemo } from "react";
import { Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { usePurchase } from "@/components/shopping/bought-sheet";
import { ToBuyRow } from "@/components/shopping/shopping-tab";
import { StockItemsPanel } from "@/components/shopping/stock-items-panel";
import { useHousehold } from "@/context/household-context";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { amountsOn, ingredientsUnderFood } from "@/lib/features";
import { STOCK_STATUS_LABELS, compareForList, isLowStock, stockItemName, stockStatus } from "@/lib/inventory";
import { amountLine, isIngredient, isTracked } from "@/lib/kitchen-units";

/**
 * "Belanja" on the staff view (Phase 154; it replaced "Stok"): the household's
 * things, and one tap to say one is running low or out. No counting, weighing
 * or shelf photos. Anything not on the list goes through "Ada barang lain"
 * (a note with an optional photo). Staff-facing, so Bahasa Indonesia only.
 *
 * Kitchen amounts (Phase 170 PR A, D3): staff often shop at the pasar, so
 * while it's on, "Perlu dibeli" sits at the top with a tick per item (Beli
 * berapa? on tracked ones), and food items browse under Makanan (D6).
 */
export function StaffShopping() {
  const { inventoryItems, loading } = useHousehold();
  const flags = useHouseholdFeatures();
  const showAmounts = amountsOn(flags);
  const purchase = usePurchase("id");
  const items = useMemo(
    () => (ingredientsUnderFood(flags) ? inventoryItems.filter((item) => !isIngredient(item)) : inventoryItems),
    [flags, inventoryItems]
  );
  const toBuy = useMemo(
    () => (showAmounts ? inventoryItems.filter(isLowStock).sort(compareForList) : []),
    [inventoryItems, showAmounts]
  );

  if (loading && inventoryItems.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-2/3 rounded-lg" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      {toBuy.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="staff-to-buy">
          <h2 id="staff-to-buy" className="text-sm font-semibold text-gray-900">
            Perlu dibeli <span className="text-gray-400">({toBuy.length})</span>
          </h2>
          <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
            {toBuy.map((item) => {
              const status = stockStatus(item);
              const amount = isTracked(item) ? amountLine(item, "id").text : null;
              return (
                <ToBuyRow
                  key={item.id}
                  title={stockItemName(item)}
                  detail={[STOCK_STATUS_LABELS.id[status], amount].filter(Boolean).join(" · ")}
                  out={status === "out"}
                  tickLabel={`${stockItemName(item)} sudah dibeli`}
                  onTick={() => purchase.buy(item)}
                />
              );
            })}
          </div>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        Ketuk barang yang hampir habis atau sudah habis.
      </p>

      <StockItemsPanel
        id="staff-supplies"
        title="Stok di rumah"
        items={items}
        lang="id"
        owner={false}
        defaultScope="home"
        empty={
          <EmptyState
            icon={Package}
            title="Belum ada barang"
            description={
              inventoryItems.length > 0
                ? "Bahan masakan ada di Makanan."
                : "Pemilik rumah belum menambahkan barang di sini."
            }
          />
        }
      />

      <LowStockFlagButton locale="id" />
      {purchase.sheet}
    </div>
  );
}
