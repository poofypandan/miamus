"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InventoryItemForm } from "@/components/inventory/inventory-item-form";
import { IngredientList } from "@/components/kitchen/ingredient-list";
import { ItemList } from "@/components/shopping/item-list";
import { StockStatusSheet } from "@/components/shopping/stock-status-sheet";
import { TrackAmountSheet } from "@/components/shopping/track-amount-sheet";
import type { InventoryItem, InventoryScope } from "@/types/database";

/**
 * A list of stock items with the sheets they open (Phase 170 PR A): tap for
 * Enough · Running low · Out (and the amount, when tracked); owners also
 * get Edit item and Track amount. One component for Shopping's supplies,
 * Food → Ingredients and the staff's lists, so each place behaves the same.
 */
export function StockItemsPanel({
  id,
  title,
  hint,
  items,
  lang,
  owner,
  defaultScope,
  addLabel,
  empty,
  headings = true,
  prominent = false,
  places = false,
}: {
  /** For the heading's aria link. */
  id: string;
  /** None on the staff's Belanja, which had no heading (no new reading for staff). */
  title?: string;
  hint?: string;
  items: InventoryItem[];
  lang: "en" | "id";
  /** Owners get Add item, Edit item and Track amount. */
  owner: boolean;
  defaultScope: InventoryScope;
  addLabel?: string;
  /** Shown instead of the list when it's empty. */
  empty: ReactNode;
  headings?: boolean;
  /**
   * A main section (Food → Ingredients): the heading as large as Ready to
   * eat's, and the owner's add button full width under it instead of small
   * in the corner. Shopping's supplies keep the small one.
   */
  prominent?: boolean;
  /**
   * Food → Ingredients (Phase 176): grouped by place with Use soon on top
   * (IngredientList), and the sheet says where each one is kept and when it
   * expires. Shopping's supplies and the staff's Belanja keep ItemList.
   */
  places?: boolean;
}) {
  const [choosing, setChoosing] = useState<InventoryItem | null>(null);
  const [tracking, setTracking] = useState<InventoryItem | null>(null);
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);
  // The item the form shows, kept while it closes so the title doesn't flip
  // to "Add item" during the fade-out.
  const [formItem, setFormItem] = useState<InventoryItem | null>(null);
  function edit(next: InventoryItem | "new") {
    setFormItem(next === "new" ? null : next);
    setEditing(next);
  }

  return (
    <section
      className={prominent ? "flex flex-col gap-4" : "flex flex-col gap-2"}
      aria-labelledby={title ? id : undefined}
    >
      {prominent && (title || hint) && (
        <div className="flex flex-col">
          {title && (
            <h2 id={id} className="text-base font-semibold text-gray-900">
              {title}
            </h2>
          )}
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
      )}
      {prominent && owner && addLabel && (
        <Button
          variant="outline"
          className="min-h-12 w-full rounded-xl text-base"
          onClick={() => edit("new")}
        >
          <Plus /> {addLabel}
        </Button>
      )}
      {!prominent && (title || (owner && addLabel)) && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            {title && (
              <h2 id={id} className="text-sm font-semibold text-gray-900">
                {title}
              </h2>
            )}
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          {owner && addLabel && (
            <Button
              variant="ghost"
              size="sm"
              className="-mr-2 min-h-10"
              onClick={() => edit("new")}
            >
              <Plus /> {addLabel}
            </Button>
          )}
        </div>
      )}
      {items.length === 0 ? (
        empty
      ) : places ? (
        <IngredientList items={items} lang={lang} onPress={setChoosing} showAmounts />
      ) : (
        <ItemList
          items={items}
          lang={lang}
          onPress={setChoosing}
          headings={headings}
        />
      )}

      <StockStatusSheet
        item={choosing}
        lang={lang}
        places={places}
        onClose={() => setChoosing(null)}
        onEdit={
          owner
            ? (item) => {
                // Straight from one sheet to the next: useBackToClose holds the
                // editor's history entry until the sheet's own has gone.
                setChoosing(null);
                edit(item);
              }
            : undefined
        }
        onTrack={
          owner
            ? (item) => {
                setChoosing(null);
                setTracking(item);
              }
            : undefined
        }
      />
      {owner && (
        <>
          <TrackAmountSheet item={tracking} onClose={() => setTracking(null)} />
          <InventoryItemForm
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            item={formItem}
            defaultScope={defaultScope}
          />
        </>
      )}
    </section>
  );
}
