"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BookOpen, Loader2, Minus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useT, useOwnerLocale } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useRecipes } from "@/hooks/use-recipes";
import { MEALS, MEAL_LABELS, MENU_LIMITS, dayMonth, nextPosition, weekDays, weekStart, weekdayShort } from "@/lib/menu";
import { addDishes, deleteDishes, updateDish } from "@/lib/menu-store";
import { servingsLabel, sortRecipes, type RecipeWithLines } from "@/lib/recipes";
import type { MenuDish, MenuMeal } from "@/types/database";
import { cn } from "@/lib/utils";

/** What the form opens with: a dish to edit, or a day (and meal) to add to. */
export type DishFormTarget =
  | { dish: MenuDish }
  | { day: string; meal: MenuMeal; recipe?: RecipeWithLines | null };

/**
 * Add a dish / edit a dish (owners, Phase 170 PR C). The only thing to type
 * is the dish: pick a recipe (servings start at the recipe's) or just write
 * a name ("Nasi goreng"). Day and meal are taps; the note is optional. No
 * new required fields.
 */
export function DishFormSheet({
  target,
  dishes,
  onClose,
}: {
  target: DishFormTarget | null;
  /** Every dish held, for the next position in a meal. */
  dishes: readonly MenuDish[];
  onClose: () => void;
}) {
  useBackToClose(target !== null, onClose);
  const key = target ? ("dish" in target ? target.dish.id : `${target.day}-${target.meal}-${target.recipe?.id ?? ""}`) : "none";
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl">
        {target && <DishForm key={key} target={target} dishes={dishes} onDone={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function DishForm({ target, dishes, onDone }: { target: DishFormTarget; dishes: readonly MenuDish[]; onDone: () => void }) {
  const t = useT();
  const lang = useOwnerLocale();
  const { recipes } = useRecipes();
  const editing = "dish" in target ? target.dish : null;
  const startRecipe = editing
    ? (recipes.find((r) => r.id === editing.recipe_id) ?? null)
    : "recipe" in target
      ? (target.recipe ?? null)
      : null;

  const [day, setDay] = useState(editing?.day ?? ("day" in target ? target.day : ""));
  const [meal, setMeal] = useState<MenuMeal>(editing?.meal ?? ("meal" in target ? target.meal : "lunch"));
  const [recipe, setRecipe] = useState<RecipeWithLines | null>(startRecipe);
  const [title, setTitle] = useState(editing?.title ?? startRecipe?.name ?? "");
  const [servings, setServings] = useState<number | null>(editing?.servings ?? startRecipe?.servings ?? null);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const days = weekDays(weekStart(day));
  const q = title.trim().toLowerCase();
  const matches = useMemo(() => {
    if (recipe) return [];
    const sorted = sortRecipes(recipes);
    return (q ? sorted.filter((r) => r.name.toLowerCase().includes(q) || (r.name_id ?? "").toLowerCase().includes(q)) : sorted).slice(0, 6);
  }, [recipes, recipe, q]);

  function pick(next: RecipeWithLines) {
    setRecipe(next);
    setTitle(next.name);
    setServings(next.servings);
  }

  function unpick() {
    setRecipe(null);
    setServings(null);
  }

  const canSave = title.trim().length > 0 && !saving;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    const input = {
      day,
      meal,
      recipe_id: recipe?.id ?? null,
      title: title.trim().slice(0, MENU_LIMITS.title),
      servings: recipe ? servings : null,
      notes: notes.trim().slice(0, MENU_LIMITS.notes) || null,
    };
    try {
      if (editing) {
        const moved = editing.day !== day || editing.meal !== meal;
        await updateDish(editing.id, moved ? { ...input, position: nextPosition(dishes, day, meal) } : input);
      } else {
        await addDishes([{ ...input, position: nextPosition(dishes, day, meal) }]);
      }
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await deleteDishes([editing.id]);
      toast.success(t(`Removed — ${editing.title}`, `Dihapus — ${editing.title}`));
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't remove it. Try again.", "Gagal menghapus. Coba lagi."));
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col">
      <SheetHeader>
        <SheetTitle className="text-xl">{editing ? t("Edit dish", "Ubah masakan") : t("Add a dish", "Tambah masakan")}</SheetTitle>
        <SheetDescription className="sr-only">{t("A dish on the menu", "Masakan di menu")}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="grid grid-cols-7 gap-1" role="radiogroup" aria-label={t("Day", "Hari")}>
          {days.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={d === day}
              aria-label={`${weekdayShort(d, lang)} ${dayMonth(d, lang)}`}
              onClick={() => setDay(d)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center rounded-xl border text-xs transition-colors",
                d === day ? "border-primary bg-primary text-primary-foreground" : "bg-card text-gray-700 active:bg-muted"
              )}
            >
              <span className="font-medium">{weekdayShort(d, lang)}</span>
              <span className={cn("tabular-nums", d === day ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {Number(d.slice(8))}
              </span>
            </button>
          ))}
        </div>

        <SegmentedControl
          ariaLabel={t("Meal", "Waktu makan")}
          segments={MEALS.map((value) => ({ value, label: MEAL_LABELS[lang][value] }))}
          value={meal}
          onChange={setMeal}
        />

        <div className="flex flex-col gap-2">
          <label htmlFor="dish-title" className="text-sm font-medium text-gray-900">
            {t("Dish", "Masakan")}
          </label>
          {recipe ? (
            <div className="flex min-h-12 items-center gap-3 rounded-xl border bg-card px-3">
              <BookOpen className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{recipe.name}</span>
              <button
                type="button"
                onClick={unpick}
                className="flex size-10 items-center justify-center text-muted-foreground"
                aria-label={t("Not this recipe", "Bukan resep ini")}
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <>
              <Input
                id="dish-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("Pick a recipe or type a dish", "Pilih resep atau ketik masakan")}
                maxLength={MENU_LIMITS.title}
                autoComplete="off"
                className="min-h-12 rounded-xl"
              />
              {matches.length > 0 && (
                <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
                  {matches.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => pick(r)}
                      className="flex min-h-11 items-center gap-3 px-3 text-left active:bg-muted"
                    >
                      <BookOpen className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                      <span className="min-w-0 flex-1 truncate text-sm">{r.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{servingsLabel(r.servings, lang)}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {recipe && servings !== null && (
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
            <span className="text-sm font-medium text-gray-900">{t("Servings", "Porsi")}</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="size-11 rounded-xl"
                onClick={() => setServings((s) => Math.max(MENU_LIMITS.minServings, (s ?? 1) - 1))}
                disabled={servings <= MENU_LIMITS.minServings}
                aria-label={t("Fewer servings", "Kurangi porsi")}
              >
                <Minus />
              </Button>
              <span className="min-w-24 text-center text-base font-semibold tabular-nums" aria-live="polite">
                {servingsLabel(servings, lang)}
              </span>
              <Button
                type="button"
                variant="outline"
                className="size-11 rounded-xl"
                onClick={() => setServings((s) => Math.min(MENU_LIMITS.maxServings, (s ?? 1) + 1))}
                disabled={servings >= MENU_LIMITS.maxServings}
                aria-label={t("More servings", "Tambah porsi")}
              >
                <Plus />
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label htmlFor="dish-notes" className="text-sm font-medium text-gray-900">
            {t("Note (optional)", "Catatan (opsional)")}
          </label>
          <Input
            id="dish-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("Less spicy", "Jangan terlalu pedas")}
            maxLength={MENU_LIMITS.notes}
            className="min-h-11 rounded-xl"
          />
        </div>

        <Button type="submit" className="min-h-12 rounded-xl text-base" disabled={!canSave}>
          {saving && <Loader2 className="animate-spin" />}
          {t("Save", "Simpan")}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            className={cn("min-h-11 rounded-xl", confirmDelete ? "text-red-700" : "text-muted-foreground")}
            onClick={remove}
            disabled={saving}
          >
            <Trash2 /> {confirmDelete ? t("Tap again to remove", "Ketuk lagi untuk menghapus") : t("Remove from the menu", "Hapus dari menu")}
          </Button>
        )}
      </div>
    </form>
  );
}
