"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hintAmounts, payloadOfRecipe, type RecipeHint } from "@/lib/recipe-hints";
import { amountLabel, type RecipeLang } from "@/lib/recipes";
import { keepRecipeAmounts, saveRecipe } from "@/lib/recipes-store";

/** How long the Update recipe toast (and its Undo) stays, as cooking's. */
const UPDATED_TOAST_MS = 8000;

/**
 * Recipes that learn (Phase 177, plan 4b), owners only: the last three
 * dishes from a recipe used a different amount of something than the
 * recipe says. One neutral card (not urgent) with every suggested
 * ingredient of the recipe, answered together:
 *
 *   - Update recipe saves the recipe with those amounts (save_recipe, the
 *     whole recipe as it came from the server); Undo saves the old ones;
 *   - Keep recipe remembers them (hints_off): never suggested again.
 *
 * The Scale icon, as Track amount: arithmetic, not Kakak. No prices.
 */
export function RecipeHintCard({ hint, lang }: { hint: RecipeHint; lang: RecipeLang }) {
  const tr = (en: string, ind: string) => (lang === "id" ? ind : en);
  const [busy, setBusy] = useState<"update" | "keep" | null>(null);
  const { recipe } = hint;

  async function update() {
    setBusy("update");
    try {
      await saveRecipe(payloadOfRecipe(recipe, hintAmounts(hint)));
      toast.success(tr(`${recipe.name} updated`, `Resep ${recipe.name} diperbarui`), {
        duration: UPDATED_TOAST_MS,
        action: {
          label: tr("Undo", "Batalkan"),
          onClick: () => {
            void saveRecipe(payloadOfRecipe(recipe)).catch((err) => {
              console.error(err);
              toast.error(tr("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi."));
            });
          },
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(tr("Not saved yet. Try again.", "Belum tersimpan. Coba lagi."));
    } finally {
      setBusy(null);
    }
  }

  async function keep() {
    setBusy("keep");
    try {
      await keepRecipeAmounts(
        recipe,
        hint.lines.map((l) => l.itemId)
      );
      toast.success(tr("Recipe kept. Miamus won't suggest this again.", "Resep tidak diubah. Miamus tidak akan menyarankan ini lagi."));
    } catch (err) {
      console.error(err);
      toast.error(tr("Not saved yet. Try again.", "Belum tersimpan. Coba lagi."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-label={tr(`Suggestion for ${recipe.name}`, `Saran untuk ${recipe.name}`)} className="flex flex-col gap-3 rounded-2xl border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <Scale className="mt-0.5 size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="text-base font-semibold text-gray-900">{recipe.name}</h3>
          <p className="text-sm text-muted-foreground">
            {tr(
              "The last 3 times, this used a different amount than the recipe says.",
              "3 kali terakhir, jumlah yang dipakai berbeda dari resepnya."
            )}
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-1.5 pl-7.5">
        {hint.lines.map((line) => (
          <li key={line.itemId} className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
            <span className="font-medium text-gray-900">{line.name}</span>
            <span className="text-muted-foreground tabular-nums">
              {tr(
                `recipe ${amountLabel(line.recipeAmount, line.unit, lang)} · used about ${amountLabel(line.suggested, line.unit, lang)}`,
                `resep ${amountLabel(line.recipeAmount, line.unit, lang)} · dipakai sekitar ${amountLabel(line.suggested, line.unit, lang)}`
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button className="min-h-11 flex-1 rounded-xl" onClick={() => void update()} disabled={busy !== null}>
          {busy === "update" && <Loader2 className="animate-spin" />}
          {tr("Update recipe", "Perbarui resep")}
        </Button>
        <Button variant="outline" className="min-h-11 flex-1 rounded-xl" onClick={() => void keep()} disabled={busy !== null}>
          {busy === "keep" && <Loader2 className="animate-spin" />}
          {tr("Keep recipe", "Biarkan resep")}
        </Button>
      </div>
    </section>
  );
}
