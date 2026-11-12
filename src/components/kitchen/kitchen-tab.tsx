"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { FoodView } from "@/components/kitchen/food-view";
import { IngredientsSection } from "@/components/kitchen/ingredients-section";
import { MenuView } from "@/components/kitchen/menu-view";
import { StaffMenu } from "@/components/kitchen/menu-today-card";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { ShoppingTab } from "@/components/shopping/shopping-tab";
import { StaffShopping } from "@/components/shopping/staff-shopping";
import { useOwnerLocale } from "@/context/owner-locale-context";
import { useKitchenView } from "@/hooks/use-kitchen-view";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useScrollTopOnChange } from "@/hooks/use-tab-navigation";
import { amountsOn, ingredientsUnderFood, kitchenViews, recipesOn } from "@/lib/features";
import type { FoodLocale } from "@/lib/food";

const VIEW_LABELS = {
  en: { food: "Food", buy: "Shopping", menu: "Menu" },
  id: { food: "Makanan", buy: "Belanja", menu: "Menu" },
} as const;

/**
 * The pill itself, in the owner's language or (staff) Indonesian: Food ·
 * Menu · Shopping (Shopping · Menu without Food), each only while its
 * feature is on. "Shopping", not
 * "To buy": it holds the list and the home's supplies (soap, pee pads) —
 * the old Inventory (owner, 2026-11-07). One pill is no pills.
 */
function KitchenSwitch({ locale }: { locale: FoodLocale }) {
  const [view, setView] = useKitchenView();
  const { flags } = useHouseholdFeatures();
  const views = kitchenViews(flags);
  if (views.length < 2) return null;
  return (
    <SegmentedControl
      ariaLabel={locale === "id" ? "Dapur" : "Kitchen"}
      segments={views.map((value) => ({ value, label: VIEW_LABELS[locale][value] }))}
      value={view}
      onChange={setView}
    />
  );
}

/**
 * The owner's Kitchen tab (Phase 156; it replaced Shopping, still the
 * "inventory" module in the URL so old links land here). Food first, because
 * it is the time-sensitive one; Shopping is the Phase 154 shopping list with
 * the home's supplies under it (soap, pee pads, dog food). No sixth tab.
 */
export function KitchenTab() {
  const locale = useOwnerLocale();
  const [view] = useKitchenView();
  const flags = useHouseholdFeatures();
  // Kitchen amounts (Phase 170 PR A): Ingredients under Food (D6).
  const ingredients = ingredientsUnderFood(flags);
  useScrollTopOnChange(view);
  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="px-4 empty:hidden">
        <KitchenSwitch locale={locale} />
      </div>
      {amountsOn(flags) && view !== "menu" && (
        <div className="px-4 empty:hidden">
          <WhatsNewCard id="kitchen-amounts-2026-11" />
        </div>
      )}
      {view === "menu" && recipesOn(flags) ? (
        <div className="px-4">
          <MenuView />
        </div>
      ) : view === "food" ? (
        <div className="flex flex-col gap-6 px-4">
          <FoodView locale={locale} canDelete readyHeading={ingredients} />
          {ingredients && <IngredientsSection lang={locale} owner />}
        </div>
      ) : (
        <ShoppingTab />
      )}
    </div>
  );
}

/**
 * "Dapur" on a staff phone (Phase 156; it replaced "Belanja"): the same
 * Makanan · Menu · Belanja pill. Staff add, edit and finish food; they do
 * not delete it. Menu opens today's menu and the recipes, read only
 * (Phase 170 PR B and C).
 * Bahasa Indonesia only.
 */
export function StaffKitchen() {
  const [view] = useKitchenView();
  const flags = useHouseholdFeatures();
  const ingredients = ingredientsUnderFood(flags);
  useScrollTopOnChange(view);
  return (
    <div className="flex flex-col gap-4">
      <KitchenSwitch locale="id" />
      {view === "menu" && recipesOn(flags) ? (
        <StaffMenu />
      ) : view === "food" ? (
        <div className="flex flex-col gap-6">
          <FoodView locale="id" canDelete={false} readyHeading={ingredients} />
          {ingredients && <IngredientsSection lang="id" owner={false} />}
        </div>
      ) : (
        <StaffShopping />
      )}
    </div>
  );
}
