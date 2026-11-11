"use client";

import { useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  NotebookPen,
  Plus,
  ShoppingBasket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WhatsNewCard } from "@/components/shared/whats-new";
import { AddMissingSheet } from "@/components/kitchen/add-missing-sheet";
import { useCookFlow } from "@/components/kitchen/cook-flow";
import { DishFormSheet, type DishFormTarget } from "@/components/kitchen/dish-form-sheet";
import { DishSheet } from "@/components/kitchen/dish-sheet";
import { KitchenNotesSheet } from "@/components/kitchen/kitchen-notes-sheet";
import { RecipesView } from "@/components/kitchen/recipes-view";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useAllHeldDishes, useMenuWeek } from "@/hooks/use-menu";
import { useRecipes } from "@/hooks/use-recipes";
import { useToday } from "@/hooks/use-today";
import { pushInPlace } from "@/lib/in-place-navigation";
import {
  MEALS,
  MEAL_LABELS,
  addDays,
  canCopyLastWeek,
  copyLastWeek,
  dayMonth,
  dishServings,
  dishesOn,
  recipeOf,
  weekDays,
  weekRangeLabel,
  weekStart,
  weekdayLong,
} from "@/lib/menu";
import { addDishes, deleteDishes } from "@/lib/menu-store";
import { servingsLabel, type RecipeLang, type RecipeWithLines } from "@/lib/recipes";
import { formatDateLocal } from "@/lib/scheduleEngine";
import type { MenuDish, MenuMeal } from "@/types/database";
import { cn } from "@/lib/utils";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Kitchen → Menu for owners (Phase 170 PR C, D9; mockup screen 4). The week
 * reads at a glance: seven days, each with its meals and dishes, today
 * marked, cooked dishes ticked. Above it the kitchen notes; below it Add
 * missing to Shopping and the recipe box.
 *
 * In the URL like every toggle (CLAUDE.md, State Persistence): &week=<a day
 * in it> for another week, &recipes=1 for the recipe box, so Back and the
 * camera's reload agree with the screen.
 */
export function MenuView() {
  const t = useT();
  const lang = useOwnerLocale();
  const today = formatDateLocal(useToday());
  const params = useSearchParams();
  const pathname = usePathname();
  const weekParam = params.get("week");
  const monday = weekStart(weekParam && DAY.test(weekParam) ? weekParam : today);
  const showRecipes = params.get("recipes") === "1";

  const { dishes, notes, loaded, weekLoaded } = useMenuWeek(monday);
  // Last week too, for Copy last week.
  const { weekLoaded: lastWeekLoaded } = useMenuWeek(addDays(monday, -7));
  const held = useAllHeldDishes();
  const { recipes } = useRecipes();
  const cook = useCookFlow(lang, false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<DishFormTarget | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const open = useMemo(() => held.find((d) => d.id === openId) ?? null, [held, openId]);

  function go(next: { week?: string | null; recipes?: boolean }) {
    const q = new URLSearchParams(params.toString());
    if (next.week !== undefined) {
      if (next.week === null || weekStart(next.week) === weekStart(today)) q.delete("week");
      else q.set("week", next.week);
    }
    if (next.recipes !== undefined) {
      if (next.recipes) q.set("recipes", "1");
      else q.delete("recipes");
    }
    const query = q.toString();
    pushInPlace(query ? `${pathname}?${query}` : pathname);
  }

  const thisWeek = weekStart(today);
  const heading =
    monday === thisWeek
      ? t("This week", "Minggu ini")
      : monday === addDays(thisWeek, 7)
        ? t("Next week", "Minggu depan")
        : monday === addDays(thisWeek, -7)
          ? t("Last week", "Minggu lalu")
          : weekRangeLabel(monday, lang);

  const toCopy = useMemo(() => copyLastWeek(held, monday), [held, monday]);
  // Only once both weeks came from the server, never from the phone's copy alone (Codex, PR #101).
  const copyReady = canCopyLastWeek(
    [...(weekLoaded ? [monday] : []), ...(lastWeekLoaded ? [addDays(monday, -7)] : [])],
    monday,
    toCopy
  );
  const end = addDays(monday, 6);
  const from = today > monday ? today : monday;
  const anyLeft = dishes.some((d) => d.day >= from && !d.cooked_at && d.recipe_id);

  async function copy() {
    if (!copyReady) return;
    setCopying(true);
    try {
      const added = await addDishes(toCopy);
      toast.success(t(`Copied ${added.length} dishes from last week`, `${added.length} masakan disalin dari minggu lalu`), {
        action: {
          label: t("Undo", "Batalkan"),
          onClick: () =>
            void deleteDishes(added.map((d) => d.id)).catch(() =>
              toast.error(t("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi."))
            ),
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't copy. Try again.", "Gagal menyalin. Coba lagi."));
    } finally {
      setCopying(false);
    }
  }

  function addTo(day: string) {
    const planned = new Set(dishesOn(dishes, day).map((d) => d.meal));
    const meal: MenuMeal = (["lunch", "dinner", "breakfast"] as const).find((m) => !planned.has(m)) ?? "lunch";
    setForm({ day, meal });
  }

  function plan(recipe: RecipeWithLines) {
    go({ recipes: false });
    setForm({ day: from <= end ? from : monday, meal: "lunch", recipe });
  }

  if (showRecipes) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => go({ recipes: false })}
          className="-ml-1 flex min-h-11 items-center gap-1 self-start rounded-xl pr-2 text-sm font-medium text-gray-700 active:bg-muted"
        >
          <ChevronLeft className="size-4" /> {t("Menu", "Menu")}
        </button>
        <div className="empty:hidden">
          <WhatsNewCard id="recipes-2026-11" />
        </div>
        <RecipesView lang={lang} owner onPlan={plan} />
        <DishFormSheet target={form} dishes={held} onClose={() => setForm(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="empty:hidden">
        <WhatsNewCard id="menu-2026-11" />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="text-lg font-semibold text-gray-900">{heading}</h2>
          <p className="text-sm text-muted-foreground tabular-nums">{weekRangeLabel(monday, lang)}</p>
        </div>
        {monday !== thisWeek && (
          <Button variant="ghost" className="min-h-10 rounded-xl px-3 text-sm" onClick={() => go({ week: null })}>
            {t("Today", "Hari ini")}
          </Button>
        )}
        <Button
          variant="outline"
          className="size-10 rounded-xl"
          onClick={() => go({ week: addDays(monday, -7) })}
          aria-label={t("Previous week", "Minggu sebelumnya")}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant="outline"
          className="size-10 rounded-xl"
          onClick={() => go({ week: addDays(monday, 7) })}
          aria-label={t("Next week", "Minggu berikutnya")}
        >
          <ChevronRight />
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setNotesOpen(true)}
        className="flex min-h-14 items-start gap-3 rounded-2xl border bg-card px-3 py-3 text-left active:bg-muted"
      >
        <NotebookPen className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-xs font-medium text-muted-foreground">{t("Kitchen notes", "Catatan dapur")}</span>
          {notes?.text ? (
            <span className="text-sm text-gray-900">{notes.text}</span>
          ) : (
            <span className="text-sm text-muted-foreground">
              {t("Add a note for whoever cooks", "Tambah catatan untuk yang memasak")}
            </span>
          )}
        </span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      </button>

      {!loaded && dishes.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {weekDays(monday).map((day) => (
            <DayCard
              key={day}
              day={day}
              today={today}
              lang={lang}
              dishes={dishesOn(dishes, day)}
              recipes={recipes}
              onOpen={(dish) => setOpenId(dish.id)}
              onAdd={() => addTo(day)}
            />
          ))}
        </div>
      )}

      {copyReady && (
        <Button variant="outline" className="min-h-11 rounded-xl" onClick={copy} disabled={copying}>
          <CopyPlus /> {t("Copy last week", "Salin minggu lalu")}
        </Button>
      )}
      {anyLeft && (
        <Button variant="outline" className="min-h-11 rounded-xl" onClick={() => setMissingOpen(true)}>
          <ShoppingBasket /> {t("Add missing to Shopping", "Tambahkan yang kurang ke Belanja")}
        </Button>
      )}

      <button
        type="button"
        onClick={() => go({ recipes: true })}
        className="flex min-h-14 items-center gap-3 rounded-2xl border bg-card px-3 text-left active:bg-muted"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <BookOpen className="size-4" strokeWidth={1.75} />
        </span>
        <span className="flex-1 text-sm font-medium text-gray-900">
          {t("Recipes", "Resep")}
          {recipes.length > 0 && <span className="font-normal text-muted-foreground"> · {recipes.length}</span>}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      </button>

      <DishSheet
        dish={open}
        lang={lang}
        owner
        kitchenNotes={notes?.text ?? null}
        canCook={!!open && open.day <= today}
        busy={!!open && cook.busyId === open.id}
        cookState={open ? cook.readiness(open) : "loading"}
        onRetry={cook.retry}
        onCook={(dish, servings) => {
          setOpenId(null);
          cook.start(dish, servings);
        }}
        onUncook={(dish) => void cook.undo(dish, dish.title)}
        onEdit={(dish) => {
          setOpenId(null);
          setForm({ dish });
        }}
        onClose={() => setOpenId(null)}
      />
      {cook.sheets}
      <DishFormSheet target={form} dishes={held} onClose={() => setForm(null)} />
      <KitchenNotesSheet open={notesOpen} notes={notes} onClose={() => setNotesOpen(false)} />
      <AddMissingSheet open={missingOpen} dishes={dishes} from={from} to={end} onClose={() => setMissingOpen(false)} />
    </div>
  );
}

/** One day of the week: its meals and dishes, or a quiet "Nothing planned". */
function DayCard({
  day,
  today,
  lang,
  dishes,
  recipes,
  onOpen,
  onAdd,
}: {
  day: string;
  today: string;
  lang: RecipeLang;
  dishes: MenuDish[];
  recipes: readonly RecipeWithLines[];
  onOpen: (dish: MenuDish) => void;
  onAdd: () => void;
}) {
  const id = lang === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  const isToday = day === today;
  const past = day < today;
  const addLabel = tr(`Add a dish, ${weekdayLong(day, lang)}`, `Tambah masakan, ${weekdayLong(day, lang)}`);

  return (
    <section
      aria-label={`${weekdayLong(day, lang)} ${dayMonth(day, lang)}`}
      data-day={day}
      className={cn("overflow-hidden rounded-2xl border bg-card", isToday && "border-primary/40 ring-1 ring-primary/15")}
    >
      <header className="flex min-h-12 items-center gap-2 pl-3">
        <span className={cn("text-sm font-semibold", past ? "text-gray-500" : "text-gray-900")}>{weekdayLong(day, lang)}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{dayMonth(day, lang)}</span>
        {isToday && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            {tr("Today", "Hari ini")}
          </span>
        )}
        <span className="flex-1" />
        {dishes.length === 0 && <span className="text-xs text-muted-foreground">{tr("Nothing planned", "Belum ada menu")}</span>}
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="flex size-12 shrink-0 items-center justify-center text-muted-foreground active:text-gray-900"
        >
          <Plus className="size-4" />
        </button>
      </header>
      {dishes.length > 0 && (
        <ul className="flex flex-col border-t border-dashed">
          {MEALS.flatMap((meal) =>
            dishes
              .filter((d) => d.meal === meal)
              .map((dish, index) => {
                const recipe = recipeOf(dish, recipes);
                const servings = dishServings(dish, recipe);
                return (
                  <li key={dish.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(dish)}
                      className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left active:bg-muted"
                    >
                      <span className="w-[5.25rem] shrink-0 text-xs text-muted-foreground">
                        {index === 0 ? MEAL_LABELS[lang][meal] : ""}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className={cn("truncate text-sm font-medium", dish.cooked_at ? "text-gray-500" : "text-gray-900")}>
                            {dish.title}
                          </span>
                          {dish.recipe_id && recipe && (
                            <BookOpen className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-label={tr("Recipe", "Resep")} />
                          )}
                        </span>
                        {dish.notes && <span className="truncate text-xs text-muted-foreground">{dish.notes}</span>}
                      </span>
                      {servings !== null && (
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{servingsLabel(servings, lang)}</span>
                      )}
                      {dish.cooked_at && (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-600" strokeWidth={2} aria-label={tr("Cooked", "Sudah dimasak")} />
                      )}
                    </button>
                  </li>
                );
              })
          )}
        </ul>
      )}
    </section>
  );
}
