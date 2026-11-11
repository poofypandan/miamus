"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import { FoodView } from "@/components/kitchen/food-view";
import { IngredientsSection } from "@/components/kitchen/ingredients-section";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { ShoppingTab } from "@/components/shopping/shopping-tab";
import { StaffShopping } from "@/components/shopping/staff-shopping";
import { useOwnerLocale } from "@/context/owner-locale-context";
import { useKitchenView } from "@/hooks/use-kitchen-view";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useScrollTopOnChange } from "@/hooks/use-tab-navigation";
import { amountsOn, ingredientsUnderFood } from "@/lib/features";
import type { FoodLocale } from "@/lib/food";

/** The pill itself, in the owner's language or (staff) Indonesian. */
function KitchenSwitch({ locale }: { locale: FoodLocale }) {
  const [view, setView] = useKitchenView();
  const id = locale === "id";
  return (
    <SegmentedControl
      ariaLabel={id ? "Dapur" : "Kitchen"}
      segments={[
        { value: "food", label: id ? "Makanan" : "Food" },
        // "Shopping", not "To buy": it holds the list and the home's supplies
        // (soap, pee pads) — the old Inventory (owner, 2026-11-07).
        { value: "buy", label: id ? "Belanja" : "Shopping" },
      ]}
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
  // Food at home off (Phase 171): Shopping alone, and one pill is no pills.
  const flags = useHouseholdFeatures();
  const { food } = flags;
  // Kitchen amounts (Phase 170 PR A): Ingredients under Food (D6).
  const ingredients = ingredientsUnderFood(flags);
  useScrollTopOnChange(view);
  return (
    <div className="flex flex-col gap-4 pb-6">
      {food && (
        <div className="px-4">
          <KitchenSwitch locale={locale} />
        </div>
      )}
      {amountsOn(flags) && (
        <div className="px-4 empty:hidden">
          <WhatsNewCard id="kitchen-amounts-2026-11" />
        </div>
      )}
      {view === "food" ? (
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
 * Makanan · Belanja pill. Staff add, edit and finish food; they do not
 * delete it. Bahasa Indonesia only.
 */
export function StaffKitchen() {
  const [view] = useKitchenView();
  const flags = useHouseholdFeatures();
  const { food } = flags;
  const ingredients = ingredientsUnderFood(flags);
  useScrollTopOnChange(view);
  return (
    <div className="flex flex-col gap-4">
      {food && <KitchenSwitch locale="id" />}
      {view === "food" ? (
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
