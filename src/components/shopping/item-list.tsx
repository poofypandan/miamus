"use client";

import { ChevronRight } from "lucide-react";
import { StockStatusText } from "@/components/shopping/stock-status-sheet";
import {
  CATEGORY_ICONS,
  INVENTORY_SCOPES,
  SCOPE_LABELS_EN,
  SCOPE_LABELS_ID,
  compareForList,
  stockItemName,
} from "@/lib/inventory";
import { photoSrc } from "@/lib/photos";
import type { InventoryItem } from "@/types/database";

/**
 * Every item, Pets then Home, as plain rows (Phase 154): name, and a quiet
 * word only when it is running low or out. One scroll with two headings
 * rather than a Pets | Home switch, so nothing is hidden behind a tap.
 */
export function ItemList({
  items,
  lang,
  onPress,
}: {
  items: InventoryItem[];
  lang: "en" | "id";
  onPress: (item: InventoryItem) => void;
}) {
  const scopes = lang === "id" ? SCOPE_LABELS_ID : SCOPE_LABELS_EN;
  return (
    <div className="flex flex-col gap-4">
      {INVENTORY_SCOPES.map((scope) => {
        const rows = items.filter((item) => item.scope === scope).sort(compareForList);
        if (rows.length === 0) return null;
        return (
          <div key={scope} className="flex flex-col gap-1.5">
            <h3 className="px-1 text-xs font-medium text-muted-foreground">{scopes[scope]}</h3>
            <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
              {rows.map((item) => {
                const Icon = CATEGORY_ICONS[item.category];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onPress(item)}
                    className="flex min-h-[52px] items-center gap-3 px-3 text-left text-sm active:bg-muted"
                  >
                    {item.photo_url ? (
                      // The product itself, so the right brand is bought.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoSrc(item.photo_url, 160)}
                        alt=""
                        loading="lazy"
                        className="size-9 shrink-0 rounded-md object-cover ring-1 ring-border"
                      />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center" aria-hidden>
                        <Icon className="size-4 text-muted-foreground" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{stockItemName(item)}</span>
                    <StockStatusText item={item} lang={lang} />
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
