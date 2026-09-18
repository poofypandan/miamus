"use client";

import { useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { useHousehold } from "@/context/household-context";
import {
  STOCK_CATEGORIES,
  STOCK_CATEGORY_ICONS,
  STOCK_CATEGORY_LABELS_EN,
  isStockItem,
  needsRestock,
  stockItemName,
  totalUnits,
} from "@/lib/inventory";
import { cn } from "@/lib/utils";
import type { InventoryAuditWithStaff, InventoryItem, StockCategory } from "@/types/database";

/**
 * Stock levels — what the staff's "Cek Stok" counts add up to (PRD 02).
 *
 * Owner-facing, so entirely English per the Phase 46 language boundary.
 * Rendered inside the Household module, which is already owner-gated.
 */
export function InventoryTab() {
  const { inventoryItems, latestInventoryAudits } = useHousehold();

  const groups = useMemo(() => {
    const byCategory = new Map<StockCategory, InventoryItem[]>();
    for (const item of inventoryItems) {
      if (!isStockItem(item)) continue;
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    return STOCK_CATEGORIES.filter((c) => byCategory.has(c)).map((category) => ({
      category,
      // Restock rows float to the top of their shelf: they are the reason
      // anyone opens this screen.
      items: byCategory
        .get(category)!
        .sort(
          (a, b) =>
            Number(needsRestock(b)) - Number(needsRestock(a)) ||
            stockItemName(a).localeCompare(stockItemName(b))
        ),
    }));
  }, [inventoryItems]);

  const restockCount = useMemo(
    () => groups.reduce((n, g) => n + g.items.filter(needsRestock).length, 0),
    [groups]
  );

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Stock Levels</h2>
        {restockCount > 0 && (
          <Badge className="h-5 bg-red-100 px-1.5 text-[10px] text-red-800">
            {restockCount} to restock
          </Badge>
        )}
      </div>

      {groups.map(({ category, items }) => {
        const Icon = STOCK_CATEGORY_ICONS[category];
        return (
          <section key={category} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Icon className="size-3.5" />
              {STOCK_CATEGORY_LABELS_EN[category]}
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                {items.length}
              </Badge>
            </h3>
            {items.map((item) => (
              <StockRow key={item.id} item={item} audit={latestInventoryAudits[item.id]} />
            ))}
          </section>
        );
      })}
    </div>
  );
}

function StockRow({ item, audit }: { item: InventoryItem; audit?: InventoryAuditWithStaff }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const total = totalUnits(item);
  const restock = needsRestock(item);
  const name = stockItemName(item);

  // The item row carries last_audited_at even if the audit fetch failed, so
  // "when" falls back to it; only "by whom" and the photo need the audit.
  const checkedAt = audit?.created_at ?? item.last_audited_at;
  const lastChecked = checkedAt
    ? `${formatDistanceToNow(new Date(checkedAt), { addSuffix: true })}${
        audit?.staff_name ? ` by ${audit.staff_name}` : ""
      }`
    : "Never checked";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5",
        restock && "border-red-200 bg-red-50/60"
      )}
    >
      {audit?.photo_url ? (
        <button
          type="button"
          onClick={() => setPhotoOpen(true)}
          aria-label={`View stock photo for ${name}`}
          className="shrink-0 rounded-lg"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={audit.photo_url}
            alt=""
            loading="lazy"
            className="size-12 rounded-lg object-cover ring-1 ring-border"
          />
        </button>
      ) : (
        <div className="size-12 shrink-0 rounded-lg bg-muted" aria-hidden />
      )}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{total}</span>{" "}
          {item.unit_type}
          {item.units_per_box > 1 &&
            ` · ${item.boxes_count} box${item.boxes_count === 1 ? "" : "es"} + ${item.loose_units_count} loose`}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">Last checked: {lastChecked}</p>
      </div>

      {restock ? (
        <Badge className="h-6 shrink-0 bg-red-600 px-2 text-[11px] text-white">Restock</Badge>
      ) : (
        <span
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-700"
          aria-label="In stock"
        >
          <span className="size-2.5 rounded-full bg-emerald-500" /> OK
        </span>
      )}

      {audit?.photo_url && (
        <PhotoLightbox
          open={photoOpen}
          onClose={() => setPhotoOpen(false)}
          items={[
            {
              src: audit.photo_url,
              alt: `Stock photo of ${name}`,
              title: name,
              description: `${audit.boxes_counted} box${audit.boxes_counted === 1 ? "" : "es"} + ${audit.loose_units_counted} loose · ${format(new Date(audit.created_at), "d MMM yyyy, h:mm a")}${audit.staff_name ? ` · ${audit.staff_name}` : ""}`,
            },
          ]}
        />
      )}
    </div>
  );
}
