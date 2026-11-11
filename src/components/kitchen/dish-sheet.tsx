"use client";

import { CheckCircle2, CookingPot, Loader2, NotebookPen, Pencil, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RecipeBody } from "@/components/kitchen/recipe-detail-sheet";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useRecipes } from "@/hooks/use-recipes";
import { useStaffProfiles, useStaffNameLookup } from "@/hooks/use-staff-profiles";
import { MEAL_LABELS, dishServings, dishTitle, recipeOf, weekdayLong, type CookReadiness } from "@/lib/menu";
import { servingsLabel, type RecipeLang } from "@/lib/recipes";
import type { MenuDish } from "@/types/database";

/**
 * One planned dish (Phase 170 PR C). Staff (Bahasa Indonesia): the recipe
 * at the dish's servings, the kitchen notes on top, and Sudah dimasak at the
 * bottom. Owners (their language): the same, plus Edit and, once cooked,
 * Mark not cooked. A dish without a recipe is its name, its note and the
 * button. No prices anywhere.
 */
export function DishSheet({
  dish,
  lang,
  owner,
  kitchenNotes,
  canCook,
  busy,
  cookState,
  onRetry,
  onCook,
  onUncook,
  onEdit,
  onClose,
}: {
  dish: MenuDish | null;
  lang: RecipeLang;
  owner: boolean;
  kitchenNotes: string | null;
  /** Today or earlier: a dish isn't cooked ahead of its day. */
  canCook: boolean;
  busy: boolean;
  /** Whether the recipe and items have loaded from the server (Codex, PR #101). */
  cookState: CookReadiness;
  onRetry: () => void;
  /** With the servings on the dish's stepper (Codex, PR #101). */
  onCook: (dish: MenuDish, servings: number | null) => void;
  onUncook?: (dish: MenuDish) => void;
  onEdit?: (dish: MenuDish) => void;
  onClose: () => void;
}) {
  useBackToClose(dish !== null, onClose);
  return (
    <Sheet open={dish !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        {dish && (
          <DishBody
            key={dish.id}
            dish={dish}
            lang={lang}
            owner={owner}
            kitchenNotes={kitchenNotes}
            canCook={canCook}
            busy={busy}
            cookState={cookState}
            onRetry={onRetry}
            onCook={onCook}
            onUncook={onUncook}
            onEdit={onEdit}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DishBody({
  dish,
  lang,
  owner,
  kitchenNotes,
  canCook,
  busy,
  cookState,
  onRetry,
  onCook,
  onUncook,
  onEdit,
}: {
  dish: MenuDish;
  lang: RecipeLang;
  owner: boolean;
  kitchenNotes: string | null;
  canCook: boolean;
  busy: boolean;
  /** Whether the recipe and items have loaded from the server (Codex, PR #101). */
  cookState: CookReadiness;
  onRetry: () => void;
  /** With the servings on the dish's stepper (Codex, PR #101). */
  onCook: (dish: MenuDish, servings: number | null) => void;
  onUncook?: (dish: MenuDish) => void;
  onEdit?: (dish: MenuDish) => void;
}) {
  const id = lang === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  const { recipes, fresh: recipesFresh } = useRecipes();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, tr("Someone", "Seseorang"));
  const recipe = recipeOf(dish, recipes);
  const title = dishTitle(dish, recipe, !owner);
  const servings = dishServings(dish, recipe);
  const meta = [weekdayLong(dish.day, lang), MEAL_LABELS[lang][dish.meal], servings ? servingsLabel(servings, lang) : null]
    .filter(Boolean)
    .join(" · ");
  const cookedTime = dish.cooked_at
    ? new Date(dish.cooked_at).toLocaleTimeString(id ? "id-ID" : "en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  const before = (
    <>
      <p className="-mt-3 text-sm text-muted-foreground">{meta}</p>
      {kitchenNotes && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          <NotebookPen className="mt-0.5 size-4 shrink-0 text-amber-700" strokeWidth={1.75} />
          <p className={owner ? "text-sm text-amber-900" : "text-base text-amber-900"}>
            <span className="font-medium">{tr("Kitchen notes", "Catatan dapur")}:</span> {kitchenNotes}
          </p>
        </div>
      )}
      {dish.notes && (
        <p className={owner ? "text-sm text-gray-700" : "text-base text-gray-700"}>
          <span className="font-medium">{tr("Note", "Catatan")}:</span> {dish.notes}
        </p>
      )}
      {/* Only once the list came from the server: a recipe still loading isn't deleted. */}
      {dish.recipe_id && !recipe && recipesFresh && (
        <p className="text-sm text-muted-foreground">{tr("Recipe deleted", "Resep sudah dihapus")}</p>
      )}
    </>
  );

  const footer = (shown: number | null) => (
    <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t bg-background px-4 pt-3 pb-[env(safe-area-inset-bottom)]">
      {dish.cooked_at ? (
        <p className="flex min-h-11 items-center gap-2 text-base font-medium text-emerald-700">
          <CheckCircle2 className="size-5 shrink-0" strokeWidth={1.75} />
          {tr("Cooked", "Sudah dimasak")}
          <span className="font-normal text-muted-foreground">
            · {cookedTime}
            {dish.cooked_by ? ` · ${staffName(dish.cooked_by)}` : ""}
          </span>
        </p>
      ) : canCook && cookState === "loading" ? (
        <Button className="min-h-12 rounded-xl text-base" disabled>
          <Loader2 className="animate-spin" /> {tr("Loading…", "Sedang memuat…")}
        </Button>
      ) : canCook && cookState === "failed" ? (
        <Button variant="outline" className="min-h-12 rounded-xl text-base" onClick={onRetry}>
          <RefreshCw /> {tr("Couldn't load. Try again", "Belum bisa dimuat. Coba lagi")}
        </Button>
      ) : canCook ? (
        <Button className="min-h-12 rounded-xl text-base" onClick={() => onCook(dish, shown)} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <CookingPot />} {tr("Cooked", "Sudah dimasak")}
        </Button>
      ) : null}
      {owner && (onEdit || (dish.cooked_at && onUncook)) && (
        <div className="flex gap-2">
          {onEdit && (
            <Button variant="outline" className="min-h-11 flex-1 rounded-xl" onClick={() => onEdit(dish)}>
              <Pencil /> {tr("Edit", "Ubah")}
            </Button>
          )}
          {dish.cooked_at && onUncook && (
            <Button variant="outline" className="min-h-11 flex-1 rounded-xl" onClick={() => onUncook(dish)} disabled={busy}>
              <RotateCcw /> {tr("Mark not cooked", "Tandai belum dimasak")}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (recipe) {
    return (
      <RecipeBody
        recipe={recipe}
        lang={lang}
        owner={owner}
        servings={servings ?? undefined}
        title={title}
        before={before}
        footer={(shown) => footer(shown)}
      />
    );
  }

  return (
    <div className="flex min-h-[40dvh] flex-col">
      <SheetHeader>
        <SheetTitle className={owner ? "text-xl" : "text-2xl"}>{title}</SheetTitle>
        <SheetDescription className="sr-only">{tr("Dish", "Masakan")}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {before}
        {footer(null)}
      </div>
    </div>
  );
}
