"use client";

import { useId, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { StockStatusText } from "@/components/shopping/stock-status-sheet";
import { useToday } from "@/hooks/use-today";
import { FOOD_PLACE_LABELS, type FoodLocale } from "@/lib/food";
import {
  INGREDIENT_GROUPS,
  INGREDIENT_GROUP_LABELS,
  groupIngredients,
  ingredientDaysLeft,
  ingredientExpiryText,
  placeOf,
  type IngredientGroup,
} from "@/lib/ingredients";
import { CATEGORY_ICONS, stockItemName } from "@/lib/inventory";
import { photoSrc } from "@/lib/photos";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/types/database";

/**
 * Food → Ingredients grouped by place (Phase 176; plan section 5a): Use
 * soon on top, then Fridge, Freezer, Counter, Cupboard. Each item is in one
 * group only (lib/ingredients groupIngredients); an empty group is not shown.
 * A row is ItemList's row with one quiet line under the name when there is
 * something to say: the place and the date in Use soon, the date in a place
 * group. Red once past the date, amber today and tomorrow, grey otherwise.
 *
 * Shared by the owner's Kitchen and the staff's Dapur (locale "id").
 * ItemList keeps serving Shopping's supplies and the staff's Belanja.
 */
export function IngredientList({
  items,
  lang,
  onPress,
  showAmounts,
}: {
  items: InventoryItem[];
  lang: FoodLocale;
  onPress: (item: InventoryItem) => void;
  /** Kitchen amounts on (always, where this list shows; read once, not per row). */
  showAmounts: boolean;
}) {
  const today = formatDateLocal(useToday());
  const groups = useMemo(() => groupIngredients(items, today), [items, today]);
  return (
    <div className="flex flex-col gap-4">
      {INGREDIENT_GROUPS.map((group) =>
        groups[group].length === 0 ? null : (
          <Group
            key={group}
            group={group}
            items={groups[group]}
            today={today}
            lang={lang}
            onPress={onPress}
            showAmounts={showAmounts}
          />
        )
      )}
    </div>
  );
}

function Group({
  group,
  items,
  today,
  lang,
  onPress,
  showAmounts,
}: {
  group: IngredientGroup;
  items: InventoryItem[];
  today: string;
  lang: FoodLocale;
  onPress: (item: InventoryItem) => void;
  showAmounts: boolean;
}) {
  const headingId = useId();
  return (
    <div role="group" aria-labelledby={headingId} className="flex flex-col gap-1.5">
      <h3 id={headingId} className="px-1 text-xs font-medium text-muted-foreground">
        {INGREDIENT_GROUP_LABELS[lang][group]}
      </h3>
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        {items.map((item) => (
          <Row
            key={item.id}
            item={item}
            inSoon={group === "soon"}
            today={today}
            lang={lang}
            onPress={onPress}
            showAmounts={showAmounts}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  item,
  inSoon,
  today,
  lang,
  onPress,
  showAmounts,
}: {
  item: InventoryItem;
  inSoon: boolean;
  today: string;
  lang: FoodLocale;
  onPress: (item: InventoryItem) => void;
  showAmounts: boolean;
}) {
  const Icon = CATEGORY_ICONS[item.category];
  // An item that is Out has no date (migrations/154), whatever a cached row says.
  const days = item.stock_status === "out" ? null : ingredientDaysLeft(item, today);
  const dateText = ingredientExpiryText(days, lang);
  const line = inSoon ? [FOOD_PLACE_LABELS[lang][placeOf(item)], dateText].filter(Boolean).join(" · ") : dateText;
  return (
    <button
      type="button"
      onClick={() => onPress(item)}
      className="flex min-h-[52px] items-center gap-3 px-3 py-1.5 text-left text-sm active:bg-muted"
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
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{stockItemName(item)}</span>
        {line && (
          <span
            className={cn(
              // Wraps rather than cutting off "— check first" on a narrow phone.
              "text-xs break-words",
              days !== null && days < 0
                ? "font-medium text-red-700"
                : days !== null && days <= 1
                  ? "font-medium text-amber-700"
                  : "text-muted-foreground"
            )}
          >
            {line}
          </span>
        )}
      </span>
      <StockStatusText item={item} lang={lang} showAmounts={showAmounts} />
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
