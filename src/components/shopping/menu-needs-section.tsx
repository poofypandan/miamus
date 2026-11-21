"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CircleDashed, Loader2, Plus, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useMenuWeek } from "@/hooks/use-menu";
import { useRecipes } from "@/hooks/use-recipes";
import { useToday } from "@/hooks/use-today";
import { amountsOn, recipesOn } from "@/lib/features";
import { STOCK_STATUS_LABELS } from "@/lib/inventory";
import { isActiveAlert } from "@/lib/inventory-status";
import { friendlyAmount } from "@/lib/kitchen-units";
import { addDays, toBuyPatch } from "@/lib/menu";
import { canAddNeed, dishesWithAddable, menuNeeds, neededForLine, type MenuNeed, type MenuNeedDish } from "@/lib/menu-needs";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { RecipeLang } from "@/lib/recipes";

/**
 * For the menu (the owner's wish list, step 1, 21 Nov): what the dishes
 * planned for the coming week still need, worked out by lib/menu-needs.ts.
 * Nothing here is stored until someone adds it.
 *
 *   - A thing with no item is an outlined tile with a dashed edge and the
 *     words "Not on your list", never the colour alone. Add makes it a real
 *     item, marked Out, so it is on To buy, and Bought turns it into stock.
 *   - A counted item that is short is a plain tile; Add puts it on To buy
 *     with what to buy, as Add missing to Shopping does.
 *   - Something already Running low or Out keeps its own words: on a staff
 *     phone here; on an owner's, on its To buy row ("Needed for …").
 *
 * Owners add (one tap, or "Add all for Rendang"), with Undo. Staff read it
 * in Bahasa Indonesia, to know what to buy at the market. No prices.
 */
/**
 * What the coming menu needs, as this phone reads it (lib/menu-needs.ts):
 * the section's tiles, and on an owner's phone the "Needed for" line on the
 * To buy rows too.
 */
export function useMenuNeeds(owner: boolean): { needs: MenuNeed[]; today: string; fresh: boolean } {
  const { inventoryItems, inventoryAlerts, listsFresh } = useHousehold();
  const amounts = amountsOn(useHouseholdFeatures());
  const notes = useMemo(() => inventoryAlerts.filter(isActiveAlert).flatMap((alert) => (alert.note ? [alert.note] : [])), [inventoryAlerts]);
  const enabled = recipesOn();
  const today = formatDateLocal(useToday());
  const { dishes: thisWeek, weekLoaded: thisLoaded } = useMenuWeek(today, { enabled });
  const { dishes: nextWeek, weekLoaded: nextLoaded } = useMenuWeek(addDays(today, 7), { enabled });
  const { recipes, fresh: recipesFresh } = useRecipes({ enabled });
  const needs = useMemo(
    () =>
      enabled
        ? menuNeeds({
            dishes: [...thisWeek, ...nextWeek.filter((d) => !thisWeek.some((t) => t.id === d.id))],
            recipes,
            items: inventoryItems,
            today,
            amounts,
            forStaff: !owner,
            notes,
          })
        : [],
    [enabled, thisWeek, nextWeek, recipes, inventoryItems, today, amounts, owner, notes]
  );
  // Read from the server in this session, not only the phone's copy: a
  // cached absence is never proof, and a dish cooked or removed on another
  // phone mustn't be added for (Codex, PR #195). Add waits for the lists,
  // the recipes and both menu weeks, as Add missing to Shopping does.
  return { needs, today, fresh: listsFresh && recipesFresh && thisLoaded && nextLoaded };
}

export function MenuNeedsSection({ lang, owner }: { lang: RecipeLang; owner: boolean }) {
  const { addInventoryItem, setInventoryStatus, removeInventoryItem, markToBuy } = useHousehold();
  const { needs: all, today, fresh } = useMenuNeeds(owner);
  const [busy, setBusy] = useState<string | null>(null);
  const tr = (en: string, id: string) => (lang === "id" ? id : en);
  // Fable: an owner already sees Running low and Out under To buy (with
  // "Needed for" there), so here only what Add can do. Staff, with no To
  // buy list of their own, see everything.
  const needs = useMemo(() => (owner ? all.filter(canAddNeed) : all), [all, owner]);
  const allFor = useMemo(
    () => dishesWithAddable(needs).filter((dish) => needs.filter((n) => canAddNeed(n) && n.dishes.some((d) => d.dishId === dish.dishId)).length >= 2),
    [needs]
  );

  if (needs.length === 0) return null;

  /** One need onto the shopping list; returns how to take it back off. */
  async function addOne(need: MenuNeed): Promise<() => Promise<unknown>> {
    if (need.kind === "not_there") {
      const added = await addInventoryItem({
        scope: "home",
        // In full (a recipe line is 80 at most), so it is found again by name (Codex, PR #195).
        name: need.saveName ?? need.name,
        category: "pantry",
        photo_url: null,
        quantity: 0,
        unit: "pcs",
        min_threshold: 0,
        audit_frequency_days: 30,
      });
      try {
        await setInventoryStatus(added.id, "out");
      } catch (err) {
        // Not on To buy after all: take the new item back off, so a failed Add leaves nothing behind.
        await removeInventoryItem(added.id).catch(() => undefined);
        throw err;
      }
      return () => removeInventoryItem(added.id);
    }
    const item = need.item!;
    const before = { stock_status: item.stock_status ?? "ok", to_buy_amount: item.to_buy_amount ?? null };
    await markToBuy(item.id, need.buy !== null ? toBuyPatch({ item, buy: need.buy }) : { stock_status: "low", to_buy_amount: null });
    return () => markToBuy(item.id, before);
  }

  async function add(targets: MenuNeed[], key: string, label: string) {
    if (busy || !fresh) return;
    setBusy(key);
    const undos: (() => Promise<unknown>)[] = [];
    let failed = 0;
    for (const need of targets) {
      try {
        undos.push(await addOne(need));
      } catch (err) {
        console.error("For the menu", err);
        failed += 1;
      }
    }
    setBusy(null);
    if (undos.length === 0) {
      toast.error(tr("Couldn't add it. Try again.", "Gagal menambahkan. Coba lagi."));
      return;
    }
    toast.success(failed ? tr(`${label}; some couldn't be added`, `${label}; sebagian gagal ditambahkan`) : label, {
      duration: 8000,
      action: {
        label: tr("Undo", "Batalkan"),
        onClick: () => {
          void Promise.all(undos.map((undo) => undo().catch(() => false))).then((results) =>
            results.includes(false)
              ? toast.error(tr("Couldn't undo all of it. Check the list.", "Tidak semua bisa dibatalkan. Cek daftarnya."))
              : toast(tr("Undone.", "Dibatalkan."))
          );
        },
      },
    });
  }

  const forDish = (dish: MenuNeedDish) => needs.filter((n) => canAddNeed(n) && n.dishes.some((d) => d.dishId === dish.dishId));

  return (
    <section className="flex flex-col gap-2" aria-labelledby="menu-needs-title" data-testid="menu-needs">
      <h2 id="menu-needs-title" className="text-sm font-semibold text-muted-foreground">
        {tr("For the menu", "Untuk menu")} <span className="text-gray-500">({needs.length})</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {needs.map((need) => (
          <NeedTile
            key={need.key}
            need={need}
            today={today}
            lang={lang}
            owner={owner}
            busy={busy !== null || !fresh}
            adding={busy === need.key}
            onAdd={() => void add([need], need.key, tr(`${need.name} · added to To buy`, `${need.name} · masuk Perlu dibeli`))}
          />
        ))}
      </ul>
      {owner &&
        allFor.map((dish) => (
          <Button
            key={dish.dishId}
            type="button"
            variant="outline"
            className="min-h-11 rounded-xl"
            disabled={busy !== null || !fresh}
            onClick={() =>
              void add(forDish(dish), `all:${dish.dishId}`, tr(`${dish.title}'s ingredients added to To buy`, `Bahan untuk ${dish.title} masuk Perlu dibeli`))
            }
          >
            {busy === `all:${dish.dishId}` ? <Loader2 className="animate-spin" /> : <ShoppingBasket />}
            {tr(`Add all for ${dish.title}`, `Tambah semua untuk ${dish.title}`)}
          </Button>
        ))}
    </section>
  );
}

function NeedTile({
  need,
  today,
  lang,
  owner,
  busy,
  adding,
  onAdd,
}: {
  need: MenuNeed;
  today: string;
  lang: RecipeLang;
  owner: boolean;
  busy: boolean;
  adding: boolean;
  onAdd: () => void;
}) {
  const tr = (en: string, id: string) => (lang === "id" ? id : en);
  const ghost = need.kind === "not_there";
  // What it is, in words: the shade is never the only sign (owner, 21 Nov).
  const state =
    need.kind === "not_there"
      ? tr("Not on your list", "Belum ada di daftar")
      : need.kind === "short"
        ? need.buy !== null && need.item
          ? tr(`Buy ${friendlyAmount(need.buy, need.item.unit, lang)}`, `Beli ${friendlyAmount(need.buy, need.item.unit, lang)}`)
          : tr("Not enough at home", "Kurang di rumah")
        : STOCK_STATUS_LABELS[lang][need.kind];
  return (
    <li
      className={cn(
        "flex min-h-[60px] items-center gap-3 rounded-2xl px-3 py-2",
        ghost ? "border border-dashed border-gray-400 bg-transparent" : "bg-card shadow-card"
      )}
      data-kind={need.kind}
    >
      {ghost && <CircleDashed className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-sm font-medium", ghost ? "text-gray-700" : "text-gray-900")}>{need.name}</span>
        <span
          className={cn(
            "text-xs",
            need.kind === "out" ? "text-red-700" : need.kind === "low" ? "text-amber-700" : "text-muted-foreground"
          )}
        >
          {state}
        </span>
        <span className="text-xs text-muted-foreground">{neededForLine(need, today, lang)}</span>
      </span>
      {owner && canAddNeed(need) && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11 shrink-0 rounded-xl px-3"
          disabled={busy}
          onClick={onAdd}
          aria-label={tr(`Add ${need.name} to the shopping list`, `Tambah ${need.name} ke daftar belanja`)}
        >
          {adding ? <Loader2 className="animate-spin" /> : <Plus />}
          {tr("Add", "Tambah")}
        </Button>
      )}
    </li>
  );
}
