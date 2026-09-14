import type { InventoryAlert } from "@/types/database";

export type AlertStatus = "pending" | "resolved";

/**
 * Whether an alert has been restocked.
 *
 * Deliberately tolerant of three generations of row:
 *   - written after Phase 50 → `status` says so;
 *   - written before it and resolved → no `status` at all, only the older
 *     `resolved` boolean;
 *   - read before the Phase 50 migration is applied → PostgREST returns no
 *     `status` field whatsoever, so everything falls through to the boolean.
 *
 * Checking `status` first and the boolean only when it is absent keeps all
 * three sorting into the right tab, rather than a pre-Phase-50 restock
 * reappearing as an active alert.
 */
export function isRestocked(alert: InventoryAlert): boolean {
  if (alert.status != null) return alert.status === "resolved";
  return alert.resolved;
}

export function isActiveAlert(alert: InventoryAlert): boolean {
  return !isRestocked(alert);
}

/**
 * When the restock happened. Rows resolved before Phase 50 carry no
 * `resolved_at`, so their creation time stands in — the same value the
 * migration backfills, so the display agrees either way.
 */
export function restockedAt(alert: InventoryAlert): string {
  return alert.resolved_at ?? alert.created_at;
}
