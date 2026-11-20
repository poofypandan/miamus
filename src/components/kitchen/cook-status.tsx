"use client";

import { useCallback } from "react";
import { CheckCircle2, CircleHelp, ShoppingBasket } from "lucide-react";
import { useHousehold } from "@/context/household-context";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { cookCheck, cookLine, cookTone, uncheckedLine, type CookCheck } from "@/lib/can-cook";
import { amountsOn } from "@/lib/features";
import type { RecipeLang, RecipeWithLines } from "@/lib/recipes";
import { cn } from "@/lib/utils";

/**
 * Can we cook it? on a phone (D18): checks a recipe at some servings
 * against the household's items as this phone holds them, with amounts
 * only while Kitchen amounts is on. It follows every sync of the lists.
 */
export function useCookCheck(forStaff: boolean): (recipe: RecipeWithLines, servings?: number | null) => CookCheck {
  const { inventoryItems } = useHousehold();
  const amounts = amountsOn(useHouseholdFeatures());
  return useCallback(
    (recipe: RecipeWithLines, servings: number | null = null) => cookCheck(recipe, servings, inventoryItems, { amounts, forStaff }),
    [inventoryItems, amounts, forStaff]
  );
}

/**
 * The line itself: "Ready to cook" in green with a tick; "Missing 2:
 * Santan, Serai" in amber with a basket while something isn't on the
 * shopping list; "To buy: Santan" in grey once all of it is (Fable S2);
 * with `unchecked`, a quiet "Not on your list: …" under it. `max` caps the
 * names where space is short (Fable S5). Nothing when nothing could be
 * checked. No prices.
 */
export function CookStatus({
  check,
  lang,
  later = false,
  unchecked = false,
  size = "sm",
  max,
  className,
}: {
  check: CookCheck;
  lang: RecipeLang;
  /** A day after today: "Ready to cook now". */
  later?: boolean;
  unchecked?: boolean;
  size?: "xs" | "sm" | "base";
  max?: number;
  className?: string;
}) {
  const line = cookLine(check, lang, { later, max });
  const notChecked = unchecked ? uncheckedLine(check, lang, { max }) : null;
  if (!line && !notChecked) return null;
  const text = size === "xs" ? "text-xs" : size === "sm" ? "text-sm" : "text-base";
  const icon = size === "base" ? "size-4" : size === "sm" ? "size-4" : "size-3";
  const tone = cookTone(check);
  const ready = tone === "ready";
  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", className)} data-cook-state={check.state} data-cook-tone={tone ?? undefined}>
      {line && (
        <span
          className={cn(
            "flex min-w-0 items-start gap-1 font-medium",
            text,
            ready ? "text-emerald-700" : tone === "listed" ? "text-muted-foreground" : "text-amber-700"
          )}
        >
          {ready ? (
            <CheckCircle2 className={cn("mt-[0.15em] shrink-0", icon)} strokeWidth={2} aria-hidden />
          ) : (
            <ShoppingBasket className={cn("mt-[0.15em] shrink-0", icon)} strokeWidth={2} aria-hidden />
          )}
          <span className="min-w-0">{line}</span>
        </span>
      )}
      {notChecked && (
        <span className={cn("flex min-w-0 items-start gap-1 text-muted-foreground", text)}>
          <CircleHelp className={cn("mt-[0.15em] shrink-0", icon)} strokeWidth={1.75} aria-hidden />
          <span className="min-w-0">{notChecked}</span>
        </span>
      )}
    </span>
  );
}
