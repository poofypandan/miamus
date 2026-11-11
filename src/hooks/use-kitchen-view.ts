"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { pushInPlace } from "@/lib/in-place-navigation";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { kitchenViewFor, type KitchenViewValue } from "@/lib/features";

export type KitchenView = KitchenViewValue;

function parseView(raw: string | null): KitchenView {
  return raw === "buy" || raw === "menu" ? raw : "food";
}

/**
 * The Kitchen's Food · Shopping · Menu pill (Phase 156; Menu from Phase 170
 * PR B), in the URL as ?kitchen=buy or ?kitchen=menu — the same rule as
 * every other toggle (CLAUDE.md, State Persistence): the pill and the list
 * read one value, it survives the reload a phone can do on the way back
 * from the camera, and Back flips it back.
 *
 * Food is the absence of the param: it is the time-sensitive one, so every
 * existing link to the tab opens on it. Shared by the owner's Kitchen tab and
 * the staff's Dapur.
 */
export function useKitchenView(): [KitchenView, (next: KitchenView) => void] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Food at home or the Kitchen switch off (Phase 171): its pill's links
  // open the first pill that's there.
  const { flags } = useHouseholdFeatures();
  const view: KitchenView = kitchenViewFor(parseView(searchParams.get("kitchen")), flags);

  function setView(next: KitchenView) {
    if (next === view) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "food") params.delete("kitchen");
    else params.set("kitchen", next);
    const query = params.toString();
    pushInPlace(query ? `${pathname}?${query}` : pathname);
  }

  return [view, setView];
}
