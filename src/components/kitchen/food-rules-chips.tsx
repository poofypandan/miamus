"use client";

import { Utensils } from "lucide-react";
import { FOOD_RULES, foodRuleLabel, foodRulesLabel, normalizeFoodRules, type FoodRule } from "@/lib/food-preferences";
import { cn } from "@/lib/utils";

/**
 * The household's food preferences as chips (PR C2, migrations/176): Halal,
 * No alcohol, No beef, Vegetarian, any number of them, and No rules. Used on
 * Kitchen notes and on Kakak's question card ("More"). `value` null: nobody
 * has answered yet, so no chip is on.
 */
export function FoodRulesChips({
  value,
  locale,
  disabled,
  onChange,
  label,
}: {
  value: FoodRule[] | null;
  locale: "en" | "id";
  disabled?: boolean;
  onChange: (rules: FoodRule[]) => void;
  label: string;
}) {
  const chosen = new Set(value ?? []);
  const none = value !== null && value.length === 0;
  const chip = (on: boolean) =>
    cn(
      "min-h-10 rounded-full border px-3.5 text-sm disabled:opacity-50",
      on ? "border-primary bg-primary text-primary-foreground" : "text-gray-700 active:bg-muted"
    );
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {FOOD_RULES.map((rule) => {
        const on = chosen.has(rule);
        return (
          <button
            key={rule}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(normalizeFoodRules(on ? [...chosen].filter((r) => r !== rule) : [...chosen, rule]))}
            className={chip(on)}
          >
            {foodRuleLabel(rule, locale)}
          </button>
        );
      })}
      <button type="button" aria-pressed={none} disabled={disabled} onClick={() => onChange([])} className={chip(none)}>
        {locale === "id" ? "Tidak ada aturan" : "No rules"}
      </button>
    </div>
  );
}

/**
 * The preferences beside the kitchen notes, read-only (D4: the cook needs
 * them too): "Preferensi makanan: Halal · Tanpa alkohol". Nothing when none
 * is set or the answer was no rules.
 */
export function FoodRulesLine({
  rules,
  locale,
  className,
}: {
  rules: FoodRule[] | null | undefined;
  locale: "en" | "id";
  className?: string;
}) {
  if (!rules || rules.length === 0) return null;
  return (
    <span className={cn("flex items-start gap-2", className)} data-testid="food-rules-line">
      <Utensils className="mt-0.5 size-4 shrink-0 text-amber-700" strokeWidth={1.75} aria-hidden="true" />
      <span>
        <span className="font-medium">{locale === "id" ? "Preferensi makanan" : "Food preferences"}:</span>{" "}
        {foodRulesLabel(rules, locale)}
      </span>
    </span>
  );
}
