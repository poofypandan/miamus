"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { LowStockFlagButton } from "@/components/dashboard/low-stock-flag";
import { ItemList } from "@/components/shopping/item-list";
import { StockStatusSheet } from "@/components/shopping/stock-status-sheet";
import { useHousehold } from "@/context/household-context";
import type { InventoryItem } from "@/types/database";

/**
 * "Belanja" on the staff view (Phase 154; it replaced "Stok"): the household's
 * things, and one tap to say one is running low or out. No counting, weighing
 * or shelf photos. Anything not on the list goes through "Ada barang lain"
 * (a note with an optional photo). Staff-facing, so Bahasa Indonesia only.
 */
export function StaffShopping() {
  const { inventoryItems, loading } = useHousehold();
  const [choosing, setChoosing] = useState<InventoryItem | null>(null);

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
      <p className="text-sm text-muted-foreground">
        Ketuk barang yang hampir habis atau sudah habis.
      </p>

      {inventoryItems.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Belum ada barang"
          description="Pemilik rumah belum menambahkan barang di sini."
        />
      ) : (
        <ItemList items={inventoryItems} lang="id" onPress={setChoosing} />
      )}

      <LowStockFlagButton locale="id" />

      <StockStatusSheet item={choosing} lang="id" onClose={() => setChoosing(null)} />
    </div>
  );
}
