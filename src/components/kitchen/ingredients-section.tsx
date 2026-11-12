"use client";

import { useMemo } from "react";
import { StockItemsPanel } from "@/components/shopping/stock-items-panel";
import { useHousehold } from "@/context/household-context";
import { isIngredient } from "@/lib/kitchen-units";

/**
 * Food → Ingredients (Phase 170 PR A, D6): the fresh-food and pantry items,
 * beside Ready to eat, with their amount where tracked or their status.
 * Tapping one opens the same sheet as in Shopping. As prominent as Ready to
 * eat: the same heading size and, for owners, a full-width Add ingredient.
 * Shown while Kitchen amounts and Food at home are both on; Shopping then
 * lists only the non-food supplies, so each item lives in one browsing place.
 *
 * Shared by the owner's Kitchen (owner, in their language) and the staff's
 * Dapur (Bahasa Indonesia, no editing).
 */
export function IngredientsSection({ lang, owner }: { lang: "en" | "id"; owner: boolean }) {
  const { inventoryItems } = useHousehold();
  const items = useMemo(() => inventoryItems.filter(isIngredient), [inventoryItems]);
  const id = lang === "id";
  return (
    <StockItemsPanel
      id="food-ingredients"
      title={id ? "Bahan masakan" : "Ingredients"}
      hint={id ? "Makanan segar dan bahan pokok" : "Fresh food and pantry"}
      items={items}
      lang={lang}
      owner={owner}
      defaultScope="home"
      addLabel={id ? "Tambah bahan masakan" : "Add ingredient"}
      headings={false}
      prominent
      empty={
        <p className="rounded-xl border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
          {owner
            ? id
              ? "Tambahkan beras, telur, minyak dan bahan lain yang selalu ada di rumah."
              : "Add rice, eggs, oil and the other things your kitchen keeps."
            : "Belum ada bahan masakan."}
        </p>
      }
    />
  );
}
