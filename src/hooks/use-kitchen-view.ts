"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { pushInPlace } from "@/lib/in-place-navigation";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { kitchenViewFor } from "@/lib/features";

export type KitchenView = "food" | "buy";

/**
 * The Kitchen's Food · Shopping pill (Phase 156), in the URL as ?kitchen=buy —
 * the same rule as every other toggle (CLAUDE.md, State Persistence): the
 * pill and the list read one value, it survives the reload a phone can do on
 * the way back from the camera, and Back flips it back.
 *
 * Food is the absence of the param: it is the time-sensitive one, so every
 * existing link to the tab opens on it. Shared by the owner's Kitchen tab and
 * the staff's Dapur.
 */
export function useKitchenView(): [KitchenView, (next: KitchenView) => void] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Food at home switched off (Phase 171): every Kitchen link opens Shopping.
  const { flags } = useHouseholdFeatures();
  const view: KitchenView = kitchenViewFor(searchParams.get("kitchen") === "buy" ? "buy" : "food", flags);

  function setView(next: KitchenView) {
    if (next === view) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "buy") params.set("kitchen", "buy");
    else params.delete("kitchen");
    const query = params.toString();
    pushInPlace(query ? `${pathname}?${query}` : pathname);
  }

  return [view, setView];
}
