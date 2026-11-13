"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, CookingPot, Loader2, Minus, Plus, Refrigerator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { FoodFormSheet } from "@/components/kitchen/food-form-sheet";
import { readActiveStaffId } from "@/components/auth/staff-login-gate";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useRecipes } from "@/hooks/use-recipes";
import { CookingRuleError } from "@/lib/cooked-uses";
import { MenuAlreadyCookedError } from "@/lib/data/types";
import { clean, friendlyAmount } from "@/lib/kitchen-units";
import {
  cookLines,
  cookReadiness,
  dishServings,
  dishTitle,
  recipeOf,
  usesFrom,
  type CookReadiness,
  type CountedLine,
  type UncountedLine,
} from "@/lib/menu";
import { cookDish, uncookDish } from "@/lib/menu-store";
import { loadRecipes } from "@/lib/recipes-store";
import { amountLabel, type RecipeLang } from "@/lib/recipes";
import type { InventoryUnit, MenuDish } from "@/types/database";
import { cn } from "@/lib/utils";

/** How long the cooked toast (and its Undo) stays. */
const COOKED_TOAST_MS = 8000;

/** One tap of minus or plus on the confirm sheet: finer than the shopping stepper. */
function cookStep(unit: InventoryUnit): number {
  if (unit === "g" || unit === "ml") return 50;
  if (unit === "kg" || unit === "L") return 0.1;
  return 1;
}

interface Pending {
  dish: MenuDish;
  title: string;
  lines: (CountedLine & { on: boolean })[];
  uncounted: UncountedLine[];
}

/**
 * Sudah dimasak (Phase 170 PR C; plan, Cooking and the staff flow, mockup
 * screens 8–9). Shared by the staff's Menu hari ini (Bahasa Indonesia) and
 * the owner's Menu (their language).
 *
 *   1. A dish with a recipe whose lines come off stock opens "Bahan yang
 *      dipakai": each tracked line ticked with its amount (minus/plus,
 *      untick), and "Tidak dihitung" for the rest. A dish with nothing to
 *      take off is marked cooked in one tap.
 *   2. "Pakai bahan ini" calls cook_menu_dish; the toast says "Rendang sudah
 *      dimasak · Batalkan" (uncook_menu_dish puts back exactly that).
 *   3. "Ada sisa?" offers the usual Add food sheet, filled in (the expiry is
 *      the person's choice), while Food at home is on.
 *
 * A retry after a weak signal never takes things off twice: the server
 * refuses a dish already cooked. No prices anywhere.
 */
export function useCookFlow(
  lang: RecipeLang,
  forStaff: boolean
): {
  /** Sudah dimasak, for the servings on screen (the dish's stepper; Codex, PR #101). */
  start: (dish: MenuDish, servings?: number | null) => void;
  /** Whether a dish may be cooked yet: its recipe and the items loaded from the server. */
  readiness: (dish: MenuDish) => CookReadiness;
  /** Read the recipes and the household's lists again (the "Coba lagi" button). */
  retry: () => void;
  /** Undo: puts back what cooking took and says if an item couldn't be. */
  undo: (dish: MenuDish, title: string) => Promise<void>;
  busyId: string | null;
  sheets: ReactNode;
} {
  const id = lang === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  const { inventoryItems, applyInventoryRows, listsFresh, syncFailed, refresh } = useHousehold();
  const { recipes, fresh: recipesFresh, errored: recipesErrored } = useRecipes();
  const { flags } = useHouseholdFeatures();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [leftover, setLeftover] = useState<string | null>(null);
  const [foodName, setFoodName] = useState<string | null>(null);

  function readiness(dish: MenuDish): CookReadiness {
    return cookReadiness(dish, { recipes, recipesFresh, recipesErrored, listsFresh, listsFailed: syncFailed });
  }

  function retry() {
    void loadRecipes(true);
    void refresh({ silent: true }).catch(() => undefined);
  }

  async function undo(dish: MenuDish, title: string) {
    try {
      const { items, skipped } = await uncookDish(dish.id);
      applyInventoryRows(items);
      if (skipped.length > 0) {
        // An owner changed an item's unit to one that doesn't convert: that
        // item is left as it is rather than given a wrong number.
        const names = skipped
          .map((use) => inventoryItems.find((i) => i.id === use.item_id)?.name)
          .filter(Boolean)
          .join(", ");
        toast.warning(
          tr(
            `Not cooked — ${title}. ${names || "One item"} wasn't put back: its unit changed. Set its amount by hand.`,
            `Dibatalkan — ${title}. ${names || "Satu bahan"} tidak dikembalikan karena satuannya berubah. Ubah jumlahnya sendiri.`
          )
        );
        return;
      }
      toast.success(tr(`Not cooked — ${title}`, `Dibatalkan — ${title}`));
    } catch (err) {
      if (err instanceof CookingRuleError && err.code === "too_late") {
        // Audit D1: a staff phone may Undo only shortly after cooking.
        toast.error(
          tr(
            "Too late to undo. The owner can mark it not cooked.",
            "Sudah terlalu lama untuk dibatalkan. Minta pemilik rumah menandainya belum dimasak."
          )
        );
        return;
      }
      console.error(err);
      toast.error(tr("Couldn't undo. Try again.", "Gagal membatalkan. Coba lagi."));
    }
  }

  async function finish(dish: MenuDish, title: string, uses: ReturnType<typeof usesFrom>) {
    setBusyId(dish.id);
    try {
      const { items } = await cookDish(dish.id, uses, readActiveStaffId());
      applyInventoryRows(items);
      setPending(null);
      toast.success(tr(`${title} cooked`, `${title} sudah dimasak`), {
        duration: COOKED_TOAST_MS,
        action: { label: tr("Undo", "Batalkan"), onClick: () => void undo(dish, title) },
      });
      if (flags.food) setLeftover(title);
    } catch (err) {
      if (err instanceof MenuAlreadyCookedError) {
        setPending(null);
        toast.success(tr(`${title} is already cooked`, `${title} sudah dimasak`));
      } else {
        console.error(err);
        toast.error(tr("Not saved yet. Try again.", "Belum tersimpan. Coba lagi."));
      }
    } finally {
      setBusyId(null);
    }
  }

  function start(dish: MenuDish, servings?: number | null) {
    // Never mark a dish cooked before what it takes off is known (Codex, PR #101).
    const state = readiness(dish);
    if (state !== "ready") {
      toast(state === "loading" ? tr("Loading…", "Sedang memuat…") : tr("Couldn't load. Try again.", "Belum bisa dimuat. Coba lagi."));
      if (state === "failed") retry();
      return;
    }
    const recipe = recipeOf(dish, recipes);
    const title = dishTitle(dish, recipe, forStaff);
    const { counted, uncounted } = cookLines(recipe, servings ?? dishServings(dish, recipe), inventoryItems, forStaff);
    if (counted.length === 0) {
      void finish(dish, title, []);
      return;
    }
    setPending({ dish, title, lines: counted.map((line) => ({ ...line, on: true })), uncounted });
  }

  function change(itemId: string, next: Partial<{ amount: number; on: boolean }>) {
    setPending((p) => (p ? { ...p, lines: p.lines.map((l) => (l.itemId === itemId ? { ...l, ...next } : l)) } : p));
  }

  const sheets = (
    <>
      <ConfirmSheet
        pending={pending}
        lang={lang}
        busy={pending !== null && busyId === pending.dish.id}
        onChange={change}
        onClose={() => setPending(null)}
        onUse={() => pending && void finish(pending.dish, pending.title, usesFrom(pending.lines))}
      />
      <LeftoversSheet
        title={leftover}
        lang={lang}
        onSave={() => {
          setFoodName(leftover);
          setLeftover(null);
        }}
        onClose={() => setLeftover(null)}
      />
      <FoodFormSheet
        open={foodName !== null}
        item={null}
        locale={lang}
        prefill={foodName ? { name: foodName, source: "home" } : undefined}
        onClose={() => setFoodName(null)}
      />
    </>
  );

  return { start, readiness, retry, undo, busyId, sheets };
}

function ConfirmSheet({
  pending,
  lang,
  busy,
  onChange,
  onClose,
  onUse,
}: {
  pending: Pending | null;
  lang: RecipeLang;
  busy: boolean;
  onChange: (itemId: string, next: Partial<{ amount: number; on: boolean }>) => void;
  onClose: () => void;
  onUse: () => void;
}) {
  const id = lang === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  useBackToClose(pending !== null, onClose);
  const count = pending?.lines.filter((l) => l.on && l.amount > 0).length ?? 0;
  return (
    <Sheet open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-2xl">
        {pending && (
          <div className="flex flex-col">
            <SheetHeader>
              <SheetTitle className="text-xl">{tr("Ingredients used", "Bahan yang dipakai")}</SheetTitle>
              <SheetDescription>
                {tr(
                  `${pending.title}. These come off what's at home.`,
                  `${pending.title}. Jumlahnya dikurangi dari stok di rumah.`
                )}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
              <ul className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
                {pending.lines.map((line) => {
                  const step = cookStep(line.unit);
                  return (
                    <li key={line.itemId} className="flex min-h-16 items-center gap-2 py-2 pr-2">
                      <button
                        type="button"
                        onClick={() => onChange(line.itemId, { on: !line.on })}
                        aria-pressed={line.on}
                        aria-label={line.on ? tr(`Don't take off ${line.name}`, `Jangan kurangi ${line.name}`) : tr(`Take off ${line.name}`, `Kurangi ${line.name}`)}
                        className="flex size-12 shrink-0 items-center justify-center"
                      >
                        {line.on ? (
                          <CheckCircle2 className="size-6 text-primary" strokeWidth={1.75} />
                        ) : (
                          <Circle className="size-6 text-muted-foreground" strokeWidth={1.75} />
                        )}
                      </button>
                      <span className={cn("flex min-w-0 flex-1 flex-col", !line.on && "opacity-50")}>
                        <span className="truncate text-base font-medium text-gray-900">{line.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {id ? `Sisa ${friendlyAmount(line.have, line.unit, lang)}` : `${friendlyAmount(line.have, line.unit, lang)} left`}
                        </span>
                      </span>
                      <div className={cn("flex shrink-0 items-center gap-1", !line.on && "opacity-50")}>
                        <Button
                          type="button"
                          variant="outline"
                          className="size-10 rounded-xl"
                          disabled={!line.on || line.amount <= step}
                          onClick={() => onChange(line.itemId, { amount: clean(Math.max(step, line.amount - step)) })}
                          aria-label={tr(`Less ${line.name}`, `Kurangi jumlah ${line.name}`)}
                        >
                          <Minus />
                        </Button>
                        <span className="min-w-16 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                          {friendlyAmount(line.amount, line.unit, lang)}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          className="size-10 rounded-xl"
                          disabled={!line.on}
                          onClick={() => onChange(line.itemId, { amount: clean(line.amount + step) })}
                          aria-label={tr(`More ${line.name}`, `Tambah jumlah ${line.name}`)}
                        >
                          <Plus />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {pending.uncounted.length > 0 && (
                <section className="flex flex-col gap-1.5" aria-labelledby="not-counted">
                  <h3 id="not-counted" className="text-sm font-semibold text-gray-900">
                    {tr("Not counted", "Tidak dihitung")}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {pending.uncounted
                      .map((line) => (line.amount === null ? `${line.name} ${amountLabel(null, null, lang)}` : `${amountLabel(line.amount, line.unit, lang)} ${line.name}`))
                      .join(" · ")}
                  </p>
                </section>
              )}

              <Button className="min-h-12 rounded-xl text-base" onClick={onUse} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <CookingPot />}
                {count > 0 ? tr("Use these", "Pakai bahan ini") : tr("Cooked, nothing used", "Sudah dimasak, tanpa bahan")}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function LeftoversSheet({
  title,
  lang,
  onSave,
  onClose,
}: {
  title: string | null;
  lang: RecipeLang;
  onSave: () => void;
  onClose: () => void;
}) {
  const id = lang === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  useBackToClose(title !== null, onClose);
  return (
    <Sheet open={title !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-xl">{tr("Any leftovers?", "Ada sisa?")}</SheetTitle>
          <SheetDescription>{title}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <Button className="min-h-12 rounded-xl text-base" onClick={onSave}>
            <Refrigerator /> {tr("Save to Food", "Simpan ke Makanan")}
          </Button>
          <Button variant="outline" className="min-h-12 rounded-xl text-base" onClick={onClose}>
            {tr("No leftovers", "Tidak ada sisa")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
