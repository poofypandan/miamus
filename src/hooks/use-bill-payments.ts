"use client";

import { useEffect, useState } from "react";
import { useHousehold } from "@/context/household-context";
import { ensureBillPayments, loadBillPayments, subscribeBillPayments } from "@/lib/bill-payments";
import type { BillPayment } from "@/types/database";

/**
 * The household's bill payments (Phase 164 PR B), owners only: read once and
 * shared by every screen that shows them, read again when one changes here
 * or the household changes. `enabled` false (no bill on screen) reads nothing.
 */
export function useBillPayments(enabled = true): {
  payments: BillPayment[];
  loaded: boolean;
  failed: boolean;
  reload: () => void;
} {
  const { activeHouseholdId } = useHousehold();
  const [state, setState] = useState<{ payments: BillPayment[]; loaded: boolean; failed: boolean }>({
    payments: [],
    loaded: false,
    failed: false,
  });

  useEffect(() => subscribeBillPayments(setState), []);

  useEffect(() => {
    if (!enabled || !activeHouseholdId) return;
    ensureBillPayments(activeHouseholdId);
  }, [enabled, activeHouseholdId]);

  return { ...state, reload: () => void loadBillPayments() };
}
