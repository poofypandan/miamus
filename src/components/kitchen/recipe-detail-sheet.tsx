"use client";

import { useState, type ReactNode } from "react";
import { CalendarPlus, Languages, Minus, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import {
  RECIPE_LIMITS,
  STAFF_STEPS_MISSING,
  amountLabel,
  lineName,
  missingIndonesian,
  scaleAmount,
  servingsLabel,
  splitSteps,
  staffText,
  type RecipeLang,
  type RecipeWithLines,
} from "@/lib/recipes";
import { cn } from "@/lib/utils";

/**
 * One recipe (Phase 170 PR B; mockup screen 6). Shared by the owner's
 * Kitchen → Menu and the staff's Dapur → Menu.
 *
 * Staff phones read it in Bahasa Indonesia, low on reading: big text, the
 * amounts first, one short step per line, numbered. The servings stepper
 * scales every amount (stored amounts never change). No prices, anywhere.
 *
 * Owners also get Edit and, for an English recipe, a quiet note while it
 * has no Indonesian version, and an English · Bahasa Indonesia switch to see
 * what the cook reads.
 */
export function RecipeDetailSheet({
  recipe,
  lang,
  owner,
  onClose,
  onEdit,
  onPlan,
}: {
  recipe: RecipeWithLines | null;
  lang: RecipeLang;
  owner: boolean;
  onClose: () => void;
  /** Owners: open the editor, optionally at the Indonesian version. */
  onEdit?: (recipe: RecipeWithLines, at?: "indonesian") => void;
  /** Owners: put it on the menu (Phase 170 PR C). */
  onPlan?: (recipe: RecipeWithLines) => void;
}) {
  useBackToClose(recipe !== null, onClose);
  return (
    <Sheet open={recipe !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        {recipe && <RecipeBody key={recipe.id} recipe={recipe} lang={lang} owner={owner} onEdit={onEdit} onPlan={onPlan} />}
      </SheetContent>
    </Sheet>
  );
}

/**
 * The recipe itself. Also shown inside a planned dish (Phase 170 PR C):
 * `servings` starts the stepper at the dish's servings, `title` replaces the
 * recipe's name (the dish's), `before` sits under the title (the kitchen
 * notes and the dish's note) and `footer` at the bottom (Sudah dimasak).
 */
export function RecipeBody({
  recipe,
  lang,
  owner,
  onEdit,
  onPlan,
  servings: startServings,
  title,
  before,
  footer,
}: {
  recipe: RecipeWithLines;
  lang: RecipeLang;
  owner: boolean;
  onEdit?: (recipe: RecipeWithLines, at?: "indonesian") => void;
  onPlan?: (recipe: RecipeWithLines) => void;
  servings?: number;
  title?: string;
  before?: ReactNode;
  /** A node, or a function of the servings on the stepper (cooking uses them; Codex, PR #101). */
  footer?: ReactNode | ((servings: number) => ReactNode);
}) {
  const { inventoryItems } = useHousehold();
  const id = lang === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  const [servings, setServings] = useState(startServings ?? recipe.servings);
  // Owners of an English recipe can look at it as the cook does.
  const english = recipe.written_in === "en";
  const [asStaff, setAsStaff] = useState(!owner);
  const forStaff = !owner || asStaff;
  // Staff (and the owner's preview) only ever read Indonesian steps (Codex P1, PR #98).
  const text = forStaff ? staffText(recipe) : { name: recipe.name, steps: recipe.steps, stepsMissing: false };
  // What the cook reads is always Indonesian, whatever the owner's language.
  const readLang: RecipeLang = forStaff ? "id" : lang;
  const steps = splitSteps(text.steps);
  const missing = owner && missingIndonesian(recipe, inventoryItems);
  const big = !owner || asStaff;

  return (
    <div className="flex flex-col">
      <SheetHeader>
        <SheetTitle className={cn(big ? "text-2xl" : "text-xl")}>{title ?? text.name}</SheetTitle>
        <SheetDescription className="sr-only">{tr("Recipe", "Resep")}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {before}
        {owner && english && (
          <SegmentedControl
            ariaLabel={tr("Language", "Bahasa")}
            size="sm"
            segments={[
              { value: "en", label: "English" },
              { value: "id", label: tr("For staff", "Untuk staf") },
            ]}
            value={asStaff ? "id" : "en"}
            onChange={(v) => setAsStaff(v === "id")}
          />
        )}

        {missing && <IndonesianVersionNote onAdd={onEdit ? () => onEdit(recipe, "indonesian") : undefined} />}

        <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2">
          <span className={cn("font-medium text-gray-900", big ? "text-lg" : "text-base")}>
            {readLang === "id" ? "Untuk" : "For"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="size-11 rounded-xl"
              onClick={() => setServings((s) => Math.max(RECIPE_LIMITS.minServings, s - 1))}
              disabled={servings <= RECIPE_LIMITS.minServings}
              aria-label={readLang === "id" ? "Kurangi porsi" : "Fewer servings"}
            >
              <Minus />
            </Button>
            <span className={cn("min-w-24 text-center font-semibold tabular-nums", big ? "text-xl" : "text-lg")} aria-live="polite">
              {servingsLabel(servings, readLang)}
            </span>
            <Button
              type="button"
              variant="outline"
              className="size-11 rounded-xl"
              onClick={() => setServings((s) => Math.min(RECIPE_LIMITS.maxServings, s + 1))}
              disabled={servings >= RECIPE_LIMITS.maxServings}
              aria-label={readLang === "id" ? "Tambah porsi" : "More servings"}
            >
              <Plus />
            </Button>
          </div>
        </div>

        <section className="flex flex-col gap-2" aria-labelledby="recipe-ingredients">
          <h3 id="recipe-ingredients" className={cn("font-semibold text-gray-900", big ? "text-lg" : "text-base")}>
            {readLang === "id" ? "Bahan" : "Ingredients"}
          </h3>
          {recipe.ingredients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{readLang === "id" ? "Belum ada bahan." : "No ingredients yet."}</p>
          ) : (
            <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
              {recipe.ingredients.map((line) => {
                const amount =
                  line.amount === null ? null : scaleAmount(line.amount, line.unit, recipe.servings, servings);
                return (
                  <li key={line.id} className={cn("flex items-baseline gap-3 px-3", big ? "min-h-14 py-3" : "min-h-12 py-2.5")}>
                    <span
                      className={cn(
                        "shrink-0 tabular-nums",
                        big ? "w-32" : "w-24",
                        amount === null ? "text-muted-foreground" : "font-semibold text-gray-900",
                        big ? "text-lg" : "text-sm"
                      )}
                    >
                      {amountLabel(amount, line.unit, readLang)}
                    </span>
                    <span className={cn("min-w-0 flex-1 text-gray-900", big ? "text-lg" : "text-sm")}>
                      {lineName(line, inventoryItems, forStaff, recipe.written_in)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {text.stepsMissing && (
          <section className="flex flex-col gap-2" aria-labelledby="recipe-steps">
            <h3 id="recipe-steps" className={cn("font-semibold text-gray-900", big ? "text-lg" : "text-base")}>
              Cara membuat
            </h3>
            <p className={cn("text-muted-foreground", big ? "text-lg" : "text-sm")}>{STAFF_STEPS_MISSING}</p>
          </section>
        )}

        {steps.length > 0 && (
          <section className="flex flex-col gap-2" aria-labelledby="recipe-steps">
            <h3 id="recipe-steps" className={cn("font-semibold text-gray-900", big ? "text-lg" : "text-base")}>
              {readLang === "id" ? "Cara membuat" : "Steps"}
            </h3>
            <ol className="flex flex-col gap-3">
              {steps.map((step, index) => (
                <li key={index} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground tabular-nums",
                      big ? "size-8 text-base" : "size-7 text-sm"
                    )}
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <p className={cn("min-w-0 flex-1 text-gray-900", big ? "text-lg leading-snug" : "text-sm leading-relaxed")}>
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}

        {owner && onPlan && (
          <Button className="min-h-12 rounded-xl text-base" onClick={() => onPlan(recipe)}>
            <CalendarPlus /> {tr("Plan this", "Masukkan ke menu")}
          </Button>
        )}
        {owner && onEdit && (
          <Button variant="outline" className="min-h-12 rounded-xl text-base" onClick={() => onEdit(recipe)}>
            <Pencil /> {tr("Edit recipe", "Ubah resep")}
          </Button>
        )}
        {typeof footer === "function" ? footer(servings) : footer}
      </div>
    </div>
  );
}

/**
 * Owners only (mounted only on owner screens, so useT is safe): a gentle,
 * non-blocking note on an English recipe still missing its Indonesian
 * version. The Indonesian fields stay optional (no new required fields).
 */
function IndonesianVersionNote({ onAdd }: { onAdd?: () => void }) {
  const t = useT();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <Languages className="mt-0.5 size-5 shrink-0 text-amber-700" strokeWidth={1.75} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-sm text-amber-900">
          {t(
            "Add the Indonesian version so your staff can cook from it.",
            "Tambahkan versi Bahasa Indonesia supaya staf bisa memasak dari resep ini."
          )}
        </p>
        {onAdd && (
          <Button variant="outline" className="min-h-11 self-start rounded-xl bg-card" onClick={onAdd}>
            <Languages /> {t("Add Indonesian version", "Tambah versi Bahasa Indonesia")}
          </Button>
        )}
      </div>
    </div>
  );
}
