"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, RefreshCw, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useRecipes } from "@/hooks/use-recipes";
import { ingredientsUnderFood } from "@/lib/features";
import { isLowStock, stockItemName } from "@/lib/inventory";
import { isActiveAlert } from "@/lib/inventory-status";
import { amountLine, isTracked } from "@/lib/kitchen-units";
import { friendlyAmount, menuShortfall, shortfallLine, toBuyPatch, type CookReadiness } from "@/lib/menu";
import type { MenuDish } from "@/types/database";

/**
 * Add missing to Shopping (owners, Phase 170 PR C, D10; mockup screen 5).
 * The dishes from `from` to `to` that aren't cooked yet, added up against
 * what's at home, then a review. Nothing is added without it. A tick always
 * means "put it on the shopping list", and the sections go from "will be
 * added" to "won't be added" (owner, 2026-11-12):
 *
 *   1. To buy: tracked items short of what the week needs, ticked, with the
 *      shortfall ("Need 1.5 kg · have 1 kg · buy 500 g"), stored as
 *      to_buy_amount so To buy and the WhatsApp text read "Chicken 500 g";
 *   2. Not in your Ingredients: names Miamus has no item for, ticked
 *      (untick what's at home); added as notes;
 *   3. In your Ingredients: items she keeps but the amounts can't count,
 *      unticked (tick any that are running out);
 *   4. Enough for this week: tracked items with enough, never added.
 *
 * With Food at home off the items sit under Shopping → Supplies at home, so
 * 2 and 3 name that instead.
 */
export function AddMissingSheet({
  open,
  dishes,
  from,
  to,
  readiness,
  onRetry,
  onClose,
}: {
  open: boolean;
  dishes: readonly MenuDish[];
  from: string;
  to: string;
  /**
   * The week, the recipes and the items from the server (shortfallReadiness).
   * The review is a snapshot, so it's taken only once they're all in (Codex,
   * PR #101); until then the sheet says Loading…, or Try again on failure.
   */
  readiness: CookReadiness;
  onRetry: () => void;
  onClose: () => void;
}) {
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl">
        {open &&
          (readiness === "ready" ? (
            <Review dishes={dishes} from={from} to={to} onDone={onClose} />
          ) : (
            <Waiting failed={readiness === "failed"} onRetry={onRetry} />
          ))}
      </SheetContent>
    </Sheet>
  );
}

function Waiting({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col">
      <SheetHeader>
        <SheetTitle className="text-xl">{t("Add missing to Shopping", "Tambahkan yang kurang ke Belanja")}</SheetTitle>
        <SheetDescription className="sr-only">{t("Add missing to Shopping", "Tambahkan yang kurang ke Belanja")}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col items-center gap-3 px-4 pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {failed ? (
          <>
            <p className="text-center text-sm text-muted-foreground">
              {t("Couldn't load the week's recipes and stock.", "Resep dan stok minggu ini belum bisa dimuat.")}
            </p>
            <Button variant="outline" className="min-h-11 rounded-xl" onClick={onRetry}>
              <RefreshCw /> {t("Try again", "Coba lagi")}
            </Button>
          </>
        ) : (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" /> {t("Loading…", "Memuat…")}
          </p>
        )}
      </div>
    </div>
  );
}

function Tick({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={on}
      aria-label={label}
      className="flex size-12 shrink-0 items-center justify-center disabled:opacity-40"
    >
      {on ? (
        <CheckCircle2 className="size-6 text-primary" strokeWidth={1.75} />
      ) : (
        <Circle className="size-6 text-muted-foreground" strokeWidth={1.75} />
      )}
    </button>
  );
}

function Review({ dishes, from, to, onDone }: { dishes: readonly MenuDish[]; from: string; to: string; onDone: () => void }) {
  const t = useT();
  const lang = useOwnerLocale();
  const { inventoryItems, inventoryAlerts, markToBuy, flagLowStock } = useHousehold();
  const { recipes } = useRecipes();
  const { flags } = useHouseholdFeatures();
  const underFood = ingredientsUnderFood(flags);
  // Worked out once when the sheet opens, so the list doesn't move under a finger.
  const [result] = useState(() => menuShortfall(dishes, recipes, inventoryItems, from, to));
  const noted = useMemo(
    () => new Set(inventoryAlerts.filter(isActiveAlert).map((a) => (a.note ?? "").trim().toLowerCase())),
    [inventoryAlerts]
  );
  const [buy, setBuy] = useState<Set<string>>(() => new Set(result.toBuy.map((l) => l.item.id)));
  const [check, setCheck] = useState<Set<string>>(() => new Set());
  // Names Miamus has no item for start ticked: untick what's at home.
  const [names, setNames] = useState<Set<string>>(
    () => new Set(result.unlisted.filter((name) => !noted.has(name.toLowerCase())))
  );
  const [saving, setSaving] = useState(false);

  const toggle = (set: Set<string>, key: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };
  // Only what will really be added: never a row already on the list.
  const buyLines = result.toBuy.filter((l) => buy.has(l.item.id));
  const checkItems = result.check.filter((i) => check.has(i.id) && !isLowStock(i));
  const pickedNames = result.unlisted.filter((n) => names.has(n) && !noted.has(n.toLowerCase()));
  const count = buyLines.length + checkItems.length + pickedNames.length;
  const empty =
    result.toBuy.length === 0 && result.enough.length === 0 && result.check.length === 0 && result.unlisted.length === 0;

  async function add() {
    if (count === 0) return;
    setSaving(true);
    let failed = 0;
    for (const line of buyLines) {
      await markToBuy(line.item.id, toBuyPatch(line)).catch(() => (failed += 1));
    }
    for (const item of checkItems) {
      await markToBuy(item.id, { stock_status: item.track_amount && item.quantity <= 0 ? "out" : "low", to_buy_amount: null }).catch(
        () => (failed += 1)
      );
    }
    for (const name of pickedNames) {
      await flagLowStock({ pet_id: null, item_type: "other", note: name.slice(0, 120) }).catch(() => (failed += 1));
    }
    setSaving(false);
    if (failed > 0) {
      toast.error(t("Some weren't added. Try again.", "Sebagian belum ditambahkan. Coba lagi."));
      return;
    }
    toast.success(t(`Added ${count} to Shopping`, `${count} ditambahkan ke Belanja`));
    onDone();
  }

  const section = "flex flex-col gap-1.5";
  const heading = "text-sm font-semibold text-gray-900";
  const hint = "text-xs text-muted-foreground";
  const list = "flex flex-col divide-y overflow-hidden rounded-xl border bg-card";
  const row = "flex min-h-14 items-center gap-1 pr-3";

  return (
    <div className="flex flex-col">
      <SheetHeader>
        <SheetTitle className="text-xl">{t("Add missing to Shopping", "Tambahkan yang kurang ke Belanja")}</SheetTitle>
        <SheetDescription>
          {t(
            "For the dishes not cooked yet this week. Ticked items go on the shopping list.",
            "Untuk masakan minggu ini yang belum dimasak. Yang dicentang masuk daftar belanja."
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        {empty ? (
          <p className="rounded-xl border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
            {t(
              "Nothing to add: no planned dish with a recipe is left this week.",
              "Tidak ada yang perlu ditambahkan: tidak ada masakan dengan resep yang tersisa minggu ini."
            )}
          </p>
        ) : (
          <>
            {result.toBuy.length > 0 && (
              <section className={section} aria-labelledby="missing-to-buy">
                <h3 id="missing-to-buy" className={heading}>
                  {t("To buy", "Perlu dibeli")}
                </h3>
                <div className={list}>
                  {result.toBuy.map((line) => (
                    <div key={line.item.id} className={row}>
                      <Tick
                        on={buy.has(line.item.id)}
                        label={stockItemName(line.item)}
                        onClick={() => toggle(buy, line.item.id, setBuy)}
                      />
                      <span className="flex min-w-0 flex-1 flex-col py-2">
                        <span className="truncate text-sm font-medium">{stockItemName(line.item)}</span>
                        <span className="text-xs text-muted-foreground">
                          {shortfallLine(line.need, line.have, line.buy, line.item.unit, lang)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {result.unlisted.length > 0 && (
              <section className={section} aria-labelledby="missing-unlisted">
                <div className="flex flex-col gap-0.5">
                  <h3 id="missing-unlisted" className={heading}>
                    {underFood
                      ? t("Not in your Ingredients", "Belum ada di Bahan masakan")
                      : t("Not in your supplies", "Belum ada di Stok di rumah")}
                  </h3>
                  <p className={hint}>
                    {t(
                      "Miamus doesn't know if you have these. Untick what's at home.",
                      "Miamus belum tahu apakah ini ada di rumah. Hapus centang yang sudah ada."
                    )}
                  </p>
                </div>
                <div className={list}>
                  {result.unlisted.map((name) => {
                    const listed = noted.has(name.toLowerCase());
                    return (
                      <div key={name} className={row}>
                        <Tick
                          on={names.has(name) && !listed}
                          label={name}
                          disabled={listed}
                          onClick={() => toggle(names, name, setNames)}
                        />
                        <span className="flex min-w-0 flex-1 flex-col py-2">
                          <span className="truncate text-sm font-medium">{name}</span>
                          {listed && <span className="text-xs text-muted-foreground">{t("Already on the list", "Sudah di daftar")}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {result.check.length > 0 && (
              <section className={section} aria-labelledby="missing-check">
                <div className="flex flex-col gap-0.5">
                  <h3 id="missing-check" className={heading}>
                    {underFood ? t("In your Ingredients", "Ada di Bahan masakan") : t("In your supplies", "Ada di Stok di rumah")}
                  </h3>
                  <p className={hint}>
                    {t("Marked as enough. Tick any that are running out.", "Tercatat masih ada. Centang yang ternyata hampir habis.")}
                  </p>
                </div>
                <div className={list}>
                  {result.check.map((item) => {
                    const listed = isLowStock(item);
                    // A tracked item lands here when its recipe unit doesn't convert: show what's left.
                    const sub = listed
                      ? t("Already on the list", "Sudah di daftar")
                      : isTracked(item)
                        ? amountLine(item, lang).text
                        : null;
                    return (
                      <div key={item.id} className={row}>
                        <Tick
                          on={check.has(item.id) && !listed}
                          label={stockItemName(item)}
                          disabled={listed}
                          onClick={() => toggle(check, item.id, setCheck)}
                        />
                        <span className="flex min-w-0 flex-1 flex-col py-2">
                          <span className="truncate text-sm font-medium">{stockItemName(item)}</span>
                          {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {result.enough.length > 0 && (
              <section className={section} aria-labelledby="missing-enough">
                <h3 id="missing-enough" className={heading}>
                  {t("Enough for this week", "Cukup untuk minggu ini")}
                </h3>
                <div className={list}>
                  {result.enough.map(({ item, need, have }) => (
                    <div key={item.id} className="flex min-h-14 items-center px-3">
                      <span className="flex min-w-0 flex-1 flex-col py-2">
                        <span className="truncate text-sm text-gray-700">{stockItemName(item)}</span>
                        <span className="text-xs text-muted-foreground">
                          {t(
                            `need ${friendlyAmount(need, item.unit, lang)} · have ${friendlyAmount(have, item.unit, lang)}`,
                            `perlu ${friendlyAmount(need, item.unit, lang)} · ada ${friendlyAmount(have, item.unit, lang)}`
                          )}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <Button className="min-h-12 rounded-xl text-base" onClick={add} disabled={count === 0 || saving}>
          {saving ? <Loader2 className="animate-spin" /> : <ShoppingBasket />}
          {count > 0 ? t(`Add ${count} to Shopping`, `Tambah ${count} ke Belanja`) : t("Nothing ticked", "Belum ada yang dipilih")}
        </Button>
      </div>
    </div>
  );
}
