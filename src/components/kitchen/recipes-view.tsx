"use client";

import { useMemo, useState } from "react";
import { BookOpen, ChevronRight, Languages, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { RecipeDetailSheet } from "@/components/kitchen/recipe-detail-sheet";
import { RecipeFormSheet } from "@/components/kitchen/recipe-form-sheet";
import { useHousehold } from "@/context/household-context";
import { useRecipes } from "@/hooks/use-recipes";
import { missingIndonesian, servingsLabel, sortRecipes, staffText, type RecipeLang, type RecipeWithLines } from "@/lib/recipes";

/** Past this many recipes, a search line above the list. */
const SEARCH_FROM = 7;

/**
 * Kitchen → Menu (Phase 170 PR B). Until the weekly menu arrives (PR C),
 * the Menu pill opens straight on the recipe box: no empty week, no
 * "coming soon" (plan, Rollout). Shared by the owner's Kitchen (their
 * language; New recipe, Edit) and the staff's Dapur (Bahasa Indonesia,
 * read only: every name in its Indonesian version where there is one).
 */
export function RecipesView({ lang, owner }: { lang: RecipeLang; owner: boolean }) {
  const id = lang === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  const { recipes, loaded, failed } = useRecipes();
  const { inventoryItems } = useHousehold();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ recipe: RecipeWithLines | null; focus?: "indonesian" } | null>(null);

  const shownName = (r: RecipeWithLines) => (owner ? r.name : staffText(r).name);
  const sorted = useMemo(() => sortRecipes(recipes, owner ? (r) => r.name : (r) => staffText(r).name), [recipes, owner]);
  const q = query.trim().toLowerCase();
  const shown = q
    ? sorted.filter((r) => r.name.toLowerCase().includes(q) || (r.name_id ?? "").toLowerCase().includes(q))
    : sorted;
  // Looked up live, so the sheet shows the recipe as just saved.
  const open = useMemo(() => recipes.find((r) => r.id === openId) ?? null, [recipes, openId]);

  if (!loaded && recipes.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-gray-900">
        {tr("Recipes", "Resep")}
        {recipes.length > 0 && <span className="font-normal text-muted-foreground"> · {recipes.length}</span>}
      </h2>

      {owner && (
        <Button className="min-h-12 w-full rounded-xl text-base" onClick={() => setEditing({ recipe: null })}>
          <Plus /> {tr("New recipe", "Resep baru")}
        </Button>
      )}

      {recipes.length >= SEARCH_FROM && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tr("Search recipes", "Cari resep")}
            aria-label={tr("Search recipes", "Cari resep")}
            className="min-h-11 rounded-xl pl-9"
            type="search"
          />
        </div>
      )}

      {recipes.length === 0 ? (
        failed ? (
          <p className="rounded-xl border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
            {tr("Couldn't load recipes. Pull down to try again.", "Resep belum bisa dimuat. Tarik ke bawah untuk mencoba lagi.")}
          </p>
        ) : (
          <EmptyState
            icon={BookOpen}
            title={tr("No recipes yet", "Belum ada resep")}
            description={
              owner
                ? tr(
                    "Write a recipe once, and whoever cooks can open it on their phone, in Bahasa Indonesia.",
                    "Tulis resep sekali, dan yang memasak bisa membukanya di HP, dalam Bahasa Indonesia."
                  )
                : "Resep dari pemilik rumah akan muncul di sini."
            }
          />
        )
      ) : (
        <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
          {shown.map((recipe) => {
            const missing = owner && missingIndonesian(recipe, inventoryItems);
            const count = recipe.ingredients.length;
            const detail = [
              servingsLabel(recipe.servings, lang),
              count > 0 ? (id ? `${count} bahan` : count === 1 ? "1 ingredient" : `${count} ingredients`) : null,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <button
                key={recipe.id}
                type="button"
                onClick={() => setOpenId(recipe.id)}
                className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-muted"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <BookOpen className="size-5" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={owner ? "truncate text-sm font-medium" : "truncate text-base font-medium"}>
                    {shownName(recipe)}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">{detail}</span>
                  {missing && (
                    <span className="flex items-center gap-1 truncate text-xs font-medium text-amber-700">
                      <Languages className="size-3 shrink-0" />
                      {tr("No Indonesian version yet", "Belum ada versi Bahasa Indonesia")}
                    </span>
                  )}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
            );
          })}
          {shown.length === 0 && (
            <p className="px-3 py-5 text-center text-sm text-muted-foreground">
              {tr("No recipe by that name.", "Tidak ada resep dengan nama itu.")}
            </p>
          )}
        </div>
      )}

      <RecipeDetailSheet
        recipe={open}
        lang={lang}
        owner={owner}
        onClose={() => setOpenId(null)}
        onEdit={
          owner
            ? (recipe, at) => {
                setOpenId(null);
                setEditing({ recipe, focus: at });
              }
            : undefined
        }
      />
      {owner && (
        <RecipeFormSheet
          open={editing !== null}
          recipe={editing?.recipe ?? null}
          focus={editing?.focus}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
