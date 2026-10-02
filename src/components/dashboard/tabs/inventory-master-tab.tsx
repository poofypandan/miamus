"use client";

import { InventoryAlertsPanel } from "@/components/dashboard/inventory-alerts-panel";
import { InventoryBoard } from "@/components/inventory/inventory-board";

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
 * Owner-facing, so entirely English per the Phase 46 language boundary.
 */
export function InventoryMasterTab() {
  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      {/* The staff low-stock reports, which used to sit on the owner's daily
          feed a module away from the stock they are about. */}
      <InventoryAlertsPanel />

      <InventoryBoard lang="en" canManage />
    </div>
  );
}
