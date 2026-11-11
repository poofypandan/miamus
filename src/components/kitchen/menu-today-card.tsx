"use client";

import { useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ChevronRight, CookingPot, NotebookPen } from "lucide-react";
import { useCookFlow } from "@/components/kitchen/cook-flow";
import { DishSheet } from "@/components/kitchen/dish-sheet";
import { RecipesView } from "@/components/kitchen/recipes-view";
import { useMenuWeek } from "@/hooks/use-menu";
import { useRecipes } from "@/hooks/use-recipes";
import { useToday } from "@/hooks/use-today";
import { STAFF_MEAL_LABELS, dishServings, dishTitle, dishesOn, recipeOf, weekdayLong } from "@/lib/menu";
import { servingsLabel } from "@/lib/recipes";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";

/**
 * Menu hari ini (staff, Bahasa Indonesia only; Phase 170 PR C, D9; mockup
 * screen 7). At the top of Tugas Hari Ini when the day has a plan, on every
 * staff phone of the household (anyone may cook). No plan, no card.
 *
 * Each dish: the meal (Pagi · Siang · Malam), its name as the cook reads it,
 * the servings, a recipe mark, a tick once cooked. The kitchen notes sit on
 * top. A tap opens the dish: the recipe at its servings and Sudah dimasak.
 * No prices, anywhere.
 */
export function MenuTodayCard({ day, enabled = true }: { day: string; enabled?: boolean }) {
  const today = formatDateLocal(useToday());
  const { dishes: week, notes } = useMenuWeek(day, { enabled });
  const { recipes } = useRecipes({ enabled });
  const cook = useCookFlow("id", true);
  const [openId, setOpenId] = useState<string | null>(null);
  const dishes = useMemo(() => dishesOn(week, day), [week, day]);
  const open = useMemo(() => week.find((d) => d.id === openId) ?? null, [week, openId]);

  if (!enabled || dishes.length === 0) return null;
  const title = day === today ? "Menu hari ini" : `Menu ${weekdayLong(day, "id")}`;

  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl border bg-card">
      <header className="flex items-center gap-2 px-3 pt-3 pb-1">
        <CookingPot className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      </header>
      {notes?.text && (
        <p className="mx-3 mt-1 mb-1 flex items-start gap-2 rounded-xl bg-amber-50 px-2.5 py-2 text-sm text-amber-900">
          <NotebookPen className="mt-0.5 size-4 shrink-0 text-amber-700" strokeWidth={1.75} />
          <span>
            <span className="font-medium">Catatan dapur:</span> {notes.text}
          </span>
        </p>
      )}
      <ul className="flex flex-col divide-y">
        {dishes.map((dish) => {
          const recipe = recipeOf(dish, recipes);
          const servings = dishServings(dish, recipe);
          return (
            <li key={dish.id}>
              <button
                type="button"
                onClick={() => setOpenId(dish.id)}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left active:bg-muted"
              >
                <span className="w-12 shrink-0 text-sm text-muted-foreground">{STAFF_MEAL_LABELS[dish.meal]}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className={cn("truncate text-base font-medium", dish.cooked_at ? "text-gray-500" : "text-gray-900")}>
                    {dishTitle(dish, recipe, true)}
                  </span>
                  {recipe && <BookOpen className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-label="Ada resep" />}
                </span>
                {servings !== null && <span className="shrink-0 text-sm text-muted-foreground">{servingsLabel(servings, "id")}</span>}
                {dish.cooked_at ? (
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-600" strokeWidth={2} aria-label="Sudah dimasak" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <DishSheet
        dish={open}
        lang="id"
        owner={false}
        kitchenNotes={notes?.text ?? null}
        canCook={!!open && open.day <= today}
        busy={!!open && cook.busyId === open.id}
        cookState={open ? cook.readiness(open) : "loading"}
        onRetry={cook.retry}
        onCook={(dish, servings) => {
          setOpenId(null);
          cook.start(dish, servings);
        }}
        onClose={() => setOpenId(null)}
      />
      {cook.sheets}
    </section>
  );
}

/** Dapur → Menu on a staff phone: today's menu, then the recipe box (read only). */
export function StaffMenu() {
  const today = formatDateLocal(useToday());
  return (
    <div className="flex flex-col gap-4">
      <MenuTodayCard day={today} />
      <RecipesView lang="id" owner={false} />
    </div>
  );
}
