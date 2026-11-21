"use client";

import { useCallback, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Apple,
  Archive,
  Banana,
  Beef,
  Bean,
  Cake,
  Carrot,
  Citrus,
  CloudUpload,
  Coffee,
  Cookie,
  CookingPot,
  Croissant,
  Drumstick,
  Egg,
  Fish,
  Leaf,
  Milk,
  Package,
  Plus,
  Refrigerator,
  Shrimp,
  Snowflake,
  Soup,
  TriangleAlert,
  Utensils,
  Wheat,
  Amphora,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { FilterPill } from "@/components/shared/filter-pill";
import { SyncedImg } from "@/components/shared/synced-img";
import { FoodDetailSheet } from "@/components/kitchen/food-detail-sheet";
import { FoodFormSheet } from "@/components/kitchen/food-form-sheet";
import { ContainersToReturn } from "@/components/kitchen/food-view";
import { StockStatusSheet } from "@/components/shopping/stock-status-sheet";
import { TrackAmountSheet } from "@/components/shopping/track-amount-sheet";
import { InventoryItemForm } from "@/components/inventory/inventory-item-form";
import { useHousehold } from "@/context/household-context";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import { foodName, type FoodLocale } from "@/lib/food";
import { replaceInPlace } from "@/lib/in-place-navigation";
import { amountLine, isIngredient, isTracked } from "@/lib/kitchen-units";
import {
  SHELF_FILTERS,
  SHELF_FILTER_LABELS,
  SHELF_LABELS,
  buildShelves,
  shelfFilterFrom,
  shelfSymbol,
  shelfThings,
  tileState,
  type ShelfFilter,
  type ShelfKey,
  type ShelfSymbol,
  type ShelfThing,
  type TileState,
} from "@/lib/kitchen-shelves";
import { photoSrc } from "@/lib/photos";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { FoodItem, InventoryItem } from "@/types/database";

const SHELF_ICONS: Record<Exclude<ShelfKey, "soon">, LucideIcon> = {
  fridge: Refrigerator,
  freezer: Snowflake,
  counter: Utensils,
  pantry: Archive,
};

const SYMBOLS: Record<ShelfSymbol, LucideIcon> = {
  egg: Egg,
  milk: Milk,
  drumstick: Drumstick,
  beef: Beef,
  fish: Fish,
  shrimp: Shrimp,
  wheat: Wheat,
  bread: Croissant,
  cake: Cake,
  cookie: Cookie,
  carrot: Carrot,
  leaf: Leaf,
  apple: Apple,
  citrus: Citrus,
  banana: Banana,
  coffee: Coffee,
  bean: Bean,
  jar: Amphora,
  bowl: Soup,
  package: Package,
};

/**
 * Kitchen → Food as an inventory, for owners (21 Nov; Fable's
 * 08-kitchen-inventory.md, section 2, and kitchen-inventory.html): the
 * kitchen's places as shelves, a tile a thing, food and ingredients on the
 * same shelves, "Use soon" first. Three small pills sort it at once:
 * Everything, Use soon, To buy (`?shelf=`, so the pill and the shelves can't
 * disagree after a remount).
 *
 * A tap opens the thing with the sheets the app already has: food's Eaten,
 * Given away, Thrown out; an ingredient's Enough, Running low, Out and Add
 * to the shopping list. Nothing is scored, counted or collected. Amber is
 * rationed (lib/kitchen-shelves tileState) and always comes with a word.
 *
 * Owner-facing, in the owner's language. Ingredients join the shelves while
 * Kitchen amounts and Food at home are both on (`ingredients`), as they
 * joined the Food view before; otherwise the shelves hold food only.
 */
export function KitchenShelves({ locale, ingredients: withIngredients }: { locale: FoodLocale; ingredients: boolean }) {
  const tr = (en: string, ind: string) => (locale === "id" ? ind : en);
  const { foodItems, inventoryItems, loading, pendingIds } = useHousehold();
  const today = formatDateLocal(useToday());
  const { allProfiles } = useStaffProfiles();
  const lookup = useStaffNameLookup(allProfiles, "");
  const staffName = (staffId: string | null) => (staffId ? lookup(staffId) || null : null);

  const searchParams = useSearchParams();
  const pathname = usePathname();
  const rawFilter = shelfFilterFrom(searchParams.get("shelf"));
  // To buy is about ingredients; with none on the shelves it isn't offered.
  const filter: ShelfFilter = !withIngredients && rawFilter === "buy" ? "all" : rawFilter;
  const setFilter = useCallback(
    (next: ShelfFilter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("shelf");
      else params.set("shelf", next);
      const query = params.toString();
      replaceInPlace(query ? `${pathname}?${query}` : pathname);
    },
    [searchParams, pathname]
  );

  const ingredientItems = useMemo(
    () => (withIngredients ? inventoryItems.filter(isIngredient) : []),
    [withIngredients, inventoryItems]
  );
  const things = useMemo(() => shelfThings(foodItems, ingredientItems), [foodItems, ingredientItems]);
  const shelves = useMemo(() => buildShelves(things, today, filter), [things, today, filter]);

  // The sheets, looked up live so each shows the thing as it is now.
  const [foodId, setFoodId] = useState<string | null>(null);
  const openFood = useMemo(
    () => foodItems.find((f) => f.id === foodId && f.outcome === null) ?? null,
    [foodItems, foodId]
  );
  const [addingFood, setAddingFood] = useState(false);
  const [editingFood, setEditingFood] = useState<FoodItem | null>(null);
  const [ingredientId, setIngredientId] = useState<string | null>(null);
  const openIngredient = useMemo(
    () => ingredientItems.find((i) => i.id === ingredientId) ?? null,
    [ingredientItems, ingredientId]
  );
  const [tracking, setTracking] = useState<InventoryItem | null>(null);
  const [editingIngredient, setEditingIngredient] = useState<InventoryItem | "new" | null>(null);
  // The item the form shows, kept while it closes so its title doesn't flip.
  const [formIngredient, setFormIngredient] = useState<InventoryItem | null>(null);
  function editIngredient(next: InventoryItem | "new") {
    setFormIngredient(next === "new" ? null : next);
    setEditingIngredient(next);
  }
  // "Open it" from the add forms (Phase 176, 5d): straight to the
  // ingredient's own sheet.
  function showIngredient(id: string) {
    setEditingIngredient(null);
    setTracking(null);
    setAddingFood(false);
    setEditingFood(null);
    setIngredientId(id);
  }

  if (loading && things.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Adding by hand, until the one "+" at the top right (07, rule 3). */}
      <div className="flex gap-2">
        <Button variant="outline" className="min-h-11 flex-1 rounded-xl" onClick={() => setAddingFood(true)}>
          <Plus /> {tr("Add food", "Tambah makanan")}
        </Button>
        {withIngredients && (
          <Button variant="outline" className="min-h-11 flex-1 rounded-xl" onClick={() => editIngredient("new")}>
            <Plus /> {tr("Add ingredient", "Tambah bahan masakan")}
          </Button>
        )}
      </div>

      <ContainersToReturn locale={locale} />

      {things.length === 0 ? (
        <EmptyState
          icon={CookingPot}
          title={tr("Nothing in the kitchen yet", "Dapur masih kosong")}
          description={
            withIngredients
              ? tr(
                  "Add the food that comes into the house, and the eggs, rice and oil your kitchen keeps. Each gets its place on a shelf.",
                  "Tambahkan makanan yang masuk ke rumah, juga telur, beras, dan minyak yang selalu ada. Masing-masing punya tempat di raknya."
                )
              : tr(
                  "When food comes into the house — a gift, leftovers, a cake — add it here so nobody forgets to eat it.",
                  "Kalau ada makanan masuk — hadiah, sisa masakan, kue — tambahkan di sini supaya tidak lupa dimakan."
                )
          }
        />
      ) : (
        <section aria-label={tr("The kitchen", "Isi dapur")} className="flex flex-col gap-4">
          <div role="group" aria-label={tr("Show", "Tampilkan")} className="flex gap-2">
            {SHELF_FILTERS.filter((f) => withIngredients || f !== "buy").map((value) => (
              <FilterPill
                key={value}
                label={SHELF_FILTER_LABELS[locale][value]}
                active={filter === value}
                onClick={() => setFilter(value)}
              />
            ))}
          </div>
          {shelves.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              {filter === "soon"
                ? tr("Nothing needs using soon.", "Tidak ada yang perlu segera dipakai.")
                : tr("Nothing is running low.", "Tidak ada yang hampir habis.")}
            </p>
          ) : (
            shelves.map((shelf) => (
              <Shelf
                key={shelf.key}
                shelf={shelf.key}
                things={shelf.things}
                today={today}
                locale={locale}
                pendingIds={pendingIds}
                onOpen={(thing) => (thing.kind === "food" ? setFoodId(thing.id) : setIngredientId(thing.id))}
              />
            ))
          )}
        </section>
      )}

      <FoodDetailSheet
        item={openFood}
        locale={locale}
        staffName={staffName}
        canDelete
        onClose={() => setFoodId(null)}
        onEdit={(item) => {
          setFoodId(null);
          setEditingFood(item);
        }}
      />
      <FoodFormSheet
        open={addingFood || editingFood !== null}
        item={editingFood}
        locale={locale}
        onClose={() => {
          setAddingFood(false);
          setEditingFood(null);
        }}
        onOpenIngredient={withIngredients ? showIngredient : undefined}
      />
      {withIngredients && (
        <>
          <StockStatusSheet
            item={openIngredient}
            lang={locale}
            places
            onClose={() => setIngredientId(null)}
            onEdit={(item) => {
              // Straight from one sheet to the next: useBackToClose holds the
              // editor's history entry until the sheet's own has gone.
              setIngredientId(null);
              editIngredient(item);
            }}
            onTrack={(item) => {
              setIngredientId(null);
              setTracking(item);
            }}
          />
          <TrackAmountSheet item={tracking} onClose={() => setTracking(null)} />
          <InventoryItemForm
            open={editingIngredient !== null}
            onOpenChange={(open) => !open && setEditingIngredient(null)}
            item={formIngredient}
            defaultScope="home"
            ingredient
            onOpenExisting={(existing) => showIngredient(existing.id)}
          />
        </>
      )}
    </div>
  );
}

function Shelf({
  shelf,
  things,
  today,
  locale,
  pendingIds,
  onOpen,
}: {
  shelf: ShelfKey;
  things: ShelfThing[];
  today: string;
  locale: FoodLocale;
  pendingIds: ReadonlySet<string>;
  onOpen: (thing: ShelfThing) => void;
}) {
  const soon = shelf === "soon";
  const Icon = soon ? TriangleAlert : SHELF_ICONS[shelf];
  return (
    <section
      aria-label={SHELF_LABELS[locale][shelf]}
      data-shelf={shelf}
      className="rounded-2xl bg-card px-3 pt-3 pb-3.5 shadow-card">
      <h2
        className={cn(
          "flex items-center gap-1.5 px-1 text-xs font-semibold tracking-[0.06em] uppercase",
          soon ? "text-amber-800" : "text-muted-foreground"
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {SHELF_LABELS[locale][shelf]}
      </h2>
      <ul className="mt-2.5 grid grid-cols-4 gap-x-2 gap-y-3">
        {things.map((thing) => (
          <li key={`${thing.kind}-${thing.id}`} className="min-w-0">
            <Tile
              thing={thing}
              state={withAmount(thing, tileState(thing, today, locale), locale)}
              locale={locale}
              waiting={pendingIds.has(thing.id)}
              onOpen={() => onOpen(thing)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A tracked ingredient (Kitchen amounts, Track amount on) shows what is left,
 * "4.5 kg left", where nothing more pressing has a word: the household turned
 * the amount on, so it is the word they look for (08: amounts only where
 * turned on).
 */
function withAmount(thing: ShelfThing, state: TileState, locale: FoodLocale): TileState {
  if (thing.kind !== "ingredient" || !isTracked(thing.item)) return state;
  if (state.tone !== "none" && state.tone !== "quiet") return state;
  return { tone: "quiet", word: amountLine(thing.item, locale).text };
}

function Tile({
  thing,
  state,
  locale,
  waiting,
  onOpen,
}: {
  thing: ShelfThing;
  state: TileState;
  locale: FoodLocale;
  /** Added on this phone, not sent yet (Phase 161). */
  waiting: boolean;
  onOpen: () => void;
}) {
  const name = thing.kind === "food" ? foodName(thing.item, locale) : thing.name;
  const amber = state.tone === "urgent" || state.tone === "check";
  const out = state.tone === "out";
  const marked = amber || state.tone === "low";
  const Symbol = SYMBOLS[shelfSymbol(thing)];
  const photo = thing.item.photo_url;
  // One button whose spoken name carries its state ("Tempe, Low").
  const spoken = [name, state.word, waiting ? (locale === "id" ? "Menunggu dikirim" : "Waiting to send") : null]
    .filter(Boolean)
    .join(", ");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={spoken}
      className="flex w-full flex-col items-center gap-1 rounded-2xl text-center active:opacity-70"
    >
      <span
        aria-hidden
        className={cn(
          "relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-2xl",
          out
            ? "border border-zinc-300 bg-transparent text-zinc-400"
            : amber
              ? "bg-amber-100 text-amber-800"
              : "bg-zinc-100 text-gray-600"
        )}
      >
        {photo && !out ? (
          thing.kind === "food" ? (
            <SyncedImg url={photo} size={160} className="size-full object-cover" loading="lazy" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc(photo, 160)} alt="" loading="lazy" className="size-full object-cover" />
          )
        ) : (
          <Symbol className="size-7" strokeWidth={1.5} />
        )}
        {waiting && (
          <CloudUpload className="absolute top-1 right-1 size-3.5 rounded-full bg-card p-0.5 text-amber-700" />
        )}
      </span>
      <span
        aria-hidden
        className={cn(
          "line-clamp-2 w-full text-xs leading-4 font-semibold break-words",
          out ? "text-muted-foreground" : "text-gray-900"
        )}
      >
        {name}
      </span>
      {state.word && (
        <span
          aria-hidden
          className={cn(
            "-mt-0.5 flex max-w-full items-center justify-center gap-0.5 text-[11px] leading-4",
            amber || state.tone === "soon" || state.tone === "low" ? "font-medium text-amber-800" : "text-muted-foreground"
          )}
        >
          {marked && <TriangleAlert className="size-3 shrink-0" />}
          <span className="truncate">{state.word}</span>
        </span>
      )}
    </button>
  );
}
