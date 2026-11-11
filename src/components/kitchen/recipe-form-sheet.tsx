"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { Languages, Link2, Loader2, Minus, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { stockItemName } from "@/lib/inventory";
import { isIngredient } from "@/lib/kitchen-units";
import {
  RECIPE_LIMITS,
  RECIPE_UNITS,
  draftFrom,
  emptyDraft,
  lineForItem,
  lineForName,
  payloadFrom,
  recipeUnitHint,
  recipeUnitLabel,
  type DraftLine,
  type RecipeDraft,
  type RecipeLang,
  type RecipeWithLines,
} from "@/lib/recipes";
import { deleteRecipe, saveRecipe } from "@/lib/recipes-store";
import { cn } from "@/lib/utils";
import type { InventoryItem, RecipeUnit } from "@/types/database";

/**
 * New recipe / Edit recipe (Phase 170 PR B; owners only: the database
 * refuses staff phones, migrations/151).
 *
 * Only the name is required (no new required fields). Ingredients come from
 * the household's list as you type (linked, so later the menu and cooking
 * can use them), or as a free name when the house doesn't stock it ("Daun
 * jeruk"). An amount is optional: none means to taste. Steps are one text
 * block, a step per line.
 *
 * Written in English or Bahasa Indonesia, the owner's language to start.
 * Staff read Indonesian only, so an English recipe gets an optional "For
 * staff, in Bahasa Indonesia" part: the name, the steps and each free-name
 * ingredient. Linked ingredients read as the item does on the shopping
 * list, so they need nothing.
 */
export function RecipeFormSheet({
  open,
  recipe,
  focus,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** The recipe being edited; null for a new one. */
  recipe: RecipeWithLines | null;
  /** Open at the Indonesian version (from the recipe's note). */
  focus?: "indonesian";
  onClose: () => void;
  onSaved?: (saved: RecipeWithLines | null) => void;
}) {
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl">
        {open && (
          <RecipeForm key={recipe?.id ?? "new"} recipe={recipe} focus={focus} onDone={onClose} onSaved={onSaved} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function RecipeForm({
  recipe,
  focus,
  onDone,
  onSaved,
}: {
  recipe: RecipeWithLines | null;
  focus?: "indonesian";
  onDone: () => void;
  onSaved?: (saved: RecipeWithLines | null) => void;
}) {
  const lang = useOwnerLocale();
  const t = useT();
  const { inventoryItems } = useHousehold();
  const [draft, setDraft] = useState<RecipeDraft>(() => (recipe ? draftFrom(recipe, lang) : emptyDraft(lang)));
  const [saving, setSaving] = useState(false);
  const [badLine, setBadLine] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const indonesianRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focus === "indonesian") indonesianRef.current?.scrollIntoView({ block: "start" });
  }, [focus]);

  const set = (patch: Partial<RecipeDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));
  const removeLine = (key: string) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.key !== key) }));
  const addLine = (line: DraftLine) => setDraft((d) => ({ ...d, lines: [...d.lines, line] }));

  const english = draft.written_in === "en";
  const freeLines = draft.lines.filter((l) => !l.item_id && l.name.trim());
  const canSave = draft.name.trim().length > 0 && !saving;

  async function save(event: FormEvent) {
    event.preventDefault();
    const result = payloadFrom(draft);
    if (!result.ok) {
      if (result.problem === "amount") {
        setBadLine(result.lineKey ?? null);
        toast.error(t("Check the amount: a number, like 2 or 1.5.", "Periksa jumlahnya: angka, misalnya 2 atau 1,5."));
      }
      return;
    }
    setSaving(true);
    try {
      const saved = await saveRecipe(result.payload);
      toast.success(t(`Saved — ${saved.name}`, `Tersimpan — ${saved.name}`));
      onSaved?.(saved);
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!recipe) return;
    setSaving(true);
    try {
      await deleteRecipe(recipe.id);
      toast.success(t(`Deleted — ${recipe.name}`, `Dihapus — ${recipe.name}`));
      onSaved?.(null);
      onDone();
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't delete. Try again.", "Gagal menghapus. Coba lagi."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save}>
      <SheetHeader>
        <SheetTitle>{recipe ? t("Edit recipe", "Ubah resep") : t("New recipe", "Resep baru")}</SheetTitle>
        <SheetDescription>
          {t(
            "Staff who cook will read this recipe. Write it the way they'll understand it.",
            "Staf yang memasak akan membaca resep ini. Tulis dengan bahasa yang mereka pahami."
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recipe-name">{t("Name", "Nama")}</Label>
          <Input
            id="recipe-name"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            maxLength={RECIPE_LIMITS.name}
            placeholder={t("Chicken soto", "Soto ayam")}
            className="min-h-11 rounded-xl"
            autoComplete="off"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{t("Written in", "Ditulis dalam")}</legend>
          <div className="flex gap-1.5">
            {(["en", "id"] as RecipeLang[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => set({ written_in: value })}
                aria-pressed={draft.written_in === value}
                className={cn(
                  "min-h-11 flex-1 rounded-xl border px-3 text-sm",
                  draft.written_in === value ? "border-primary bg-primary text-primary-foreground" : "bg-card text-gray-900"
                )}
              >
                {value === "en" ? "English" : "Bahasa Indonesia"}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-3">
          <Label>{t("Servings", "Porsi")}</Label>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="size-11 rounded-xl"
              onClick={() => set({ servings: Math.max(RECIPE_LIMITS.minServings, draft.servings - 1) })}
              aria-label={t("Fewer servings", "Kurangi porsi")}
            >
              <Minus />
            </Button>
            <span className="w-8 text-center text-lg font-semibold tabular-nums">{draft.servings}</span>
            <Button
              type="button"
              variant="outline"
              className="size-11 rounded-xl"
              onClick={() => set({ servings: Math.min(RECIPE_LIMITS.maxServings, draft.servings + 1) })}
              aria-label={t("More servings", "Tambah porsi")}
            >
              <Plus />
            </Button>
          </div>
        </div>

        <section className="flex flex-col gap-2" aria-labelledby="recipe-form-ingredients">
          <h3 id="recipe-form-ingredients" className="text-sm font-medium">
            {t("Ingredients", "Bahan")}
          </h3>
          {draft.lines.length > 0 && (
            <ul className="flex flex-col gap-2">
              {draft.lines.map((line) => (
                <LineEditor
                  key={line.key}
                  line={line}
                  lang={lang}
                  bad={badLine === line.key}
                  item={line.item_id ? (inventoryItems.find((i) => i.id === line.item_id) ?? null) : null}
                  onChange={(patch) => {
                    if (badLine === line.key) setBadLine(null);
                    setLine(line.key, patch);
                  }}
                  onRemove={() => removeLine(line.key)}
                />
              ))}
            </ul>
          )}
          <IngredientPicker items={inventoryItems} taken={draft.lines} onPick={addLine} />
          <p className="text-xs text-muted-foreground">
            {t(
              "Pick from your list, or type a name. No amount means to taste.",
              "Pilih dari daftar, atau ketik namanya. Tanpa jumlah berarti secukupnya."
            )}
          </p>
        </section>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="recipe-steps">
            {t("Steps", "Cara membuat")}{" "}
            <span className="font-normal text-muted-foreground">{t("(optional)", "(opsional)")}</span>
          </Label>
          <Textarea
            id="recipe-steps"
            value={draft.steps}
            onChange={(e) => set({ steps: e.target.value })}
            maxLength={RECIPE_LIMITS.steps}
            rows={5}
            placeholder={t("One step per line", "Satu langkah per baris")}
            className="rounded-xl text-base"
          />
          <p className="text-xs text-muted-foreground">
            {t("One short step per line. They're numbered for you.", "Satu langkah pendek per baris. Nomornya otomatis.")}
          </p>
        </div>

        {english && (
          <div ref={indonesianRef} className="flex scroll-mt-4 flex-col gap-3 rounded-xl border bg-muted/40 p-3">
            <div className="flex items-start gap-2">
              <Languages className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">
                  {t("For staff, in Bahasa Indonesia", "Untuk staf, dalam Bahasa Indonesia")}{" "}
                  <span className="font-normal text-muted-foreground">{t("(optional)", "(opsional)")}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(
                    "Staff phones show only Bahasa Indonesia: without Indonesian steps, staff see the ingredients but no steps. A blank name shows as you wrote it.",
                    "HP staf hanya menampilkan Bahasa Indonesia: tanpa cara membuat dalam Bahasa Indonesia, staf melihat bahannya saja. Nama yang dikosongkan tampil seperti yang Anda tulis."
                  )}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recipe-name-id">{t("Name", "Nama")}</Label>
              <Input
                id="recipe-name-id"
                value={draft.name_id}
                onChange={(e) => set({ name_id: e.target.value })}
                maxLength={RECIPE_LIMITS.name}
                placeholder={draft.name.trim() || "Soto ayam"}
                className="min-h-11 rounded-xl bg-card"
                autoComplete="off"
                lang="id"
              />
            </div>
            {freeLines.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t("Ingredients", "Bahan")}</span>
                {freeLines.map((line) => (
                  <div key={line.key} className="flex items-center gap-2">
                    <span className="w-28 shrink-0 truncate text-sm text-muted-foreground">{line.name}</span>
                    <Input
                      value={line.name_id}
                      onChange={(e) => setLine(line.key, { name_id: e.target.value })}
                      maxLength={RECIPE_LIMITS.lineName}
                      aria-label={t(`${line.name} in Bahasa Indonesia`, `${line.name} dalam Bahasa Indonesia`)}
                      className="min-h-11 flex-1 rounded-xl bg-card"
                      autoComplete="off"
                      lang="id"
                    />
                  </div>
                ))}
              </div>
            )}
            {draft.steps.trim() && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recipe-steps-id">{t("Steps", "Cara membuat")}</Label>
                <Textarea
                  id="recipe-steps-id"
                  value={draft.steps_id}
                  onChange={(e) => set({ steps_id: e.target.value })}
                  maxLength={RECIPE_LIMITS.steps}
                  rows={5}
                  className="rounded-xl bg-card text-base"
                  lang="id"
                />
              </div>
            )}
          </div>
        )}

        <Button type="submit" className="min-h-12 rounded-xl text-base" disabled={!canSave}>
          {saving && <Loader2 className="animate-spin" />}
          {t("Save", "Simpan")}
        </Button>

        {recipe &&
          (confirmingDelete ? (
            <div className="flex items-center justify-center gap-2">
              <Button type="button" variant="destructive" className="min-h-11 rounded-xl" onClick={remove} disabled={saving}>
                {t("Yes, delete", "Ya, hapus")}
              </Button>
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => setConfirmingDelete(false)} disabled={saving}>
                {t("Keep it", "Jangan")}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="min-h-11 text-sm text-muted-foreground underline-offset-4 active:underline"
            >
              {t("Delete recipe", "Hapus resep")}
            </button>
          ))}
      </div>
    </form>
  );
}

function LineEditor({
  line,
  item,
  lang,
  bad,
  onChange,
  onRemove,
}: {
  line: DraftLine;
  item: InventoryItem | null;
  lang: RecipeLang;
  bad: boolean;
  onChange: (patch: Partial<DraftLine>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const name = item ? stockItemName(item) : line.name;
  return (
    <li className="flex flex-col gap-2 rounded-xl border bg-card p-2.5">
      <div className="flex items-center gap-2">
        {line.item_id && (
          <Link2 className="size-4 shrink-0 text-muted-foreground" aria-label={t("From your list", "Dari daftar")} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{name}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={t(`Remove ${name}`, `Hapus ${name}`)}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground active:bg-muted"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={line.amount}
          onChange={(e) => onChange({ amount: e.target.value })}
          inputMode="decimal"
          placeholder={lang === "id" ? "secukupnya" : "to taste"}
          aria-label={t(`Amount of ${name}`, `Jumlah ${name}`)}
          aria-invalid={bad || undefined}
          className={cn("min-h-11 flex-1 rounded-xl", bad && "border-red-500")}
        />
        <select
          value={line.unit ?? ""}
          onChange={(e) => onChange({ unit: (e.target.value || null) as RecipeUnit | null })}
          aria-label={t(`Unit for ${name}`, `Satuan ${name}`)}
          className="min-h-11 w-32 shrink-0 rounded-xl border bg-card px-2 text-sm"
        >
          <option value="">{t("no unit", "tanpa satuan")}</option>
          {RECIPE_UNITS.map((unit) => {
            const hint = recipeUnitHint(unit, lang);
            const label = recipeUnitLabel(unit, lang);
            return (
              <option key={unit} value={unit}>
                {hint && hint !== label ? `${label} (${hint})` : label}
              </option>
            );
          })}
        </select>
      </div>
    </li>
  );
}

/**
 * Search the household's list as you type; ingredients (fresh food,
 * pantry) first. Enter or "Add" keeps a free name when nothing matches.
 */
function IngredientPicker({
  items,
  taken,
  onPick,
}: {
  items: readonly InventoryItem[];
  taken: readonly DraftLine[];
  onPick: (line: DraftLine) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    const used = new Set(taken.map((l) => l.item_id).filter(Boolean));
    return items
      .filter((item) => !used.has(item.id) && stockItemName(item).toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(isIngredient(b)) - Number(isIngredient(a)) ||
          Number(stockItemName(b).toLowerCase().startsWith(q)) - Number(stockItemName(a).toLowerCase().startsWith(q)) ||
          stockItemName(a).localeCompare(stockItemName(b))
      )
      .slice(0, 6);
  }, [items, taken, q]);
  const exact = matches.find((item) => stockItemName(item).toLowerCase() === q);

  function pick(item: InventoryItem) {
    onPick(lineForItem(item));
    setQuery("");
  }
  function addFree() {
    if (!q) return;
    if (exact) return pick(exact);
    onPick(lineForName(query));
    setQuery("");
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      addFree();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={RECIPE_LIMITS.lineName}
          placeholder={t("Add an ingredient", "Tambah bahan")}
          aria-label={t("Add an ingredient", "Tambah bahan")}
          className="min-h-11 rounded-xl pl-9"
          autoComplete="off"
          enterKeyHint="done"
        />
      </div>
      {q && (
        <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => pick(item)}
              className="flex min-h-11 items-center gap-2 px-3 text-left text-sm active:bg-muted"
            >
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{stockItemName(item)}</span>
            </button>
          ))}
          {!exact && (
            <button
              type="button"
              onClick={addFree}
              className="flex min-h-11 items-center gap-2 px-3 text-left text-sm font-medium text-primary active:bg-muted"
            >
              <Plus className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(`Add "${query.trim()}"`, `Tambah "${query.trim()}"`)}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
