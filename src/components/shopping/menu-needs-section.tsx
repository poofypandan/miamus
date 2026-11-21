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
 *   - Something already Running low or Out keeps its own words and says it
 *     is on the shopping list.
 *
 * Owners add (one tap, or "Add all for Rendang"), with Undo. Staff read it
 * in Bahasa Indonesia, to know what to buy at the market. No prices.
 */
export function MenuNeedsSection({ lang, owner }: { lang: RecipeLang; owner: boolean }) {
  const { inventoryItems, addInventoryItem, setInventoryStatus, removeInventoryItem, markToBuy } = useHousehold();
  const flags = useHouseholdFeatures();
  const amounts = amountsOn(flags);
  const enabled = recipesOn();
  const today = formatDateLocal(useToday());
  const { dishes: thisWeek } = useMenuWeek(today, { enabled });
  const { dishes: nextWeek } = useMenuWeek(addDays(today, 7), { enabled });
  const { recipes } = useRecipes({ enabled });
  const [busy, setBusy] = useState<string | null>(null);
  const tr = (en: string, id: string) => (lang === "id" ? id : en);

  const needs = useMemo(
    () =>
      menuNeeds({
        dishes: [...thisWeek, ...nextWeek.filter((d) => !thisWeek.some((t) => t.id === d.id))],
        recipes,
        items: inventoryItems,
        today,
        amounts,
        forStaff: !owner,
      }),
    [thisWeek, nextWeek, recipes, inventoryItems, today, amounts, owner]
  );
  const allFor = useMemo(
    () => dishesWithAddable(needs).filter((dish) => needs.filter((n) => canAddNeed(n) && n.dishes.some((d) => d.dishId === dish.dishId)).length >= 2),
    [needs]
  );

  if (!enabled || needs.length === 0) return null;

  /** One need onto the shopping list; returns how to take it back off. */
  async function addOne(need: MenuNeed): Promise<() => Promise<unknown>> {
    if (need.kind === "not_there") {
      const added = await addInventoryItem({
        scope: "home",
        name: (need.saveName ?? need.name).slice(0, 60),
        category: "pantry",
        photo_url: null,
        quantity: 0,
        unit: "pcs",
        min_threshold: 0,
        audit_frequency_days: 30,
      });
      await setInventoryStatus(added.id, "out");
      return () => removeInventoryItem(added.id);
    }
    const item = need.item!;
    const before = { stock_status: item.stock_status ?? "ok", to_buy_amount: item.to_buy_amount ?? null };
    await markToBuy(item.id, need.buy !== null ? toBuyPatch({ item, buy: need.buy }) : { stock_status: "low", to_buy_amount: null });
    return () => markToBuy(item.id, before);
  }

  async function add(targets: MenuNeed[], key: string, label: string) {
    if (busy) return;
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
            busy={busy !== null}
            adding={busy === need.key}
            onAdd={() => void add([need], need.key, tr(`Added to the shopping list — ${need.name}`, `Ditambahkan ke daftar belanja — ${need.name}`))}
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
            disabled={busy !== null}
            onClick={() =>
              void add(forDish(dish), `all:${dish.dishId}`, tr(`Added what ${dish.title} needs`, `Ditambahkan yang perlu untuk ${dish.title}`))
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
        : `${STOCK_STATUS_LABELS[lang][need.kind]} · ${tr("on the shopping list", "ada di daftar belanja")}`;
  return (
    <li
      className={cn(
        "flex min-h-[60px] items-center gap-3 rounded-2xl px-3 py-2",
        ghost ? "border border-dashed border-gray-300 bg-transparent" : "bg-card shadow-card"
      )}
      data-kind={need.kind}
    >
      {ghost && <CircleDashed className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-sm font-medium", ghost ? "text-gray-700" : "text-gray-900")}>{need.name}</span>
        <span
          className={cn(
            "text-xs",
            need.kind === "out" ? "text-red-700" : need.kind === "low" ? "text-amber-800" : "text-muted-foreground"
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
