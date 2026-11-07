"use client";

import { InventoryAlertsPanel } from "@/components/dashboard/inventory-alerts-panel";
import { InventoryBoard } from "@/components/inventory/inventory-board";
import { useOwnerLocale } from "@/context/owner-locale-context";

/**
 * Inventory: what staff have reported running low, then the stock itself,
 * split into Pets and Home (Phase 110).
 *
 * Its own tab since Phase 100. Stock is a count of right now, not of a day,
 * so there is deliberately no date ribbon here.
 *
 * The Phase 83 "Stock Levels" ledger and the Phase 60 "Master Inventory"
 * catalogue used to be two separate lists of the same table, one counting
 * and one naming. The board is both: every item has its count, its stepper
 * and, for the owner, its edit form.
 *
 * Owner-facing: English or Bahasa Indonesia, as the owner chose (Phase 149).
 */
export function InventoryMasterTab() {
  const locale = useOwnerLocale();
  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      {/* The staff low-stock reports, which used to sit on the owner's daily
          feed a module away from the stock they are about. */}
      <InventoryAlertsPanel />

      <InventoryBoard lang={locale} canManage />
    </div>
  );
}
