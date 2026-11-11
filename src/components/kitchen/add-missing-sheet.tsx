"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Circle, Loader2, ShoppingBasket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useRecipes } from "@/hooks/use-recipes";
import { STOCK_STATUS_LABELS, isLowStock, stockItemName, stockStatus } from "@/lib/inventory";
import { isActiveAlert } from "@/lib/inventory-status";
import { friendlyAmount, menuShortfall, shortfallLine, toBuyPatch } from "@/lib/menu";
import type { MenuDish } from "@/types/database";
import { cn } from "@/lib/utils";

/**
 * Add missing to Shopping (owners, Phase 170 PR C, D10; mockup screen 5).
 * The dishes from `from` to `to` that aren't cooked yet, added up against
 * what's at home, then a review. Nothing is added without it:
 *
 *   - To buy: tracked items short of what the week needs, ticked, with the
 *     shortfall ("Need 1.5 kg · have 1 kg · buy 500 g"), stored as
 *     to_buy_amount so To buy and the WhatsApp text read "Chicken 500 g";
 *   - Enough: shown, never added;
 *   - Check these: linked items that aren't tracked; tick to put on the list;
 *   - Not on your list: free-name ingredients; tick to add them as notes.
 */
export function AddMissingSheet({
  open,
  dishes,
  from,
  to,
  onClose,
}: {
  open: boolean;
  dishes: readonly MenuDish[];
  from: string;
  to: string;
  onClose: () => void;
}) {
  useBackToClose(open, onClose);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-2xl">
        {open && <Review dishes={dishes} from={from} to={to} onDone={onClose} />}
      </SheetContent>
    </Sheet>
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
  // Worked out once when the sheet opens, so the list doesn't move under a finger.
  const [result] = useState(() => menuShortfall(dishes, recipes, inventoryItems, from, to));
  const noted = useMemo(
    () => new Set(inventoryAlerts.filter(isActiveAlert).map((a) => (a.note ?? "").trim().toLowerCase())),
    [inventoryAlerts]
  );
  const [buy, setBuy] = useState<Set<string>>(() => new Set(result.toBuy.map((l) => l.item.id)));
  const [check, setCheck] = useState<Set<string>>(() => new Set());
  const [names, setNames] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);

  const toggle = (set: Set<string>, key: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    apply(next);
  };
  const count = buy.size + check.size + names.size;
  const empty =
    result.toBuy.length === 0 && result.enough.length === 0 && result.check.length === 0 && result.unlisted.length === 0;

  async function add() {
    if (count === 0) return;
    setSaving(true);
    let failed = 0;
    for (const line of result.toBuy.filter((l) => buy.has(l.item.id))) {
      await markToBuy(line.item.id, toBuyPatch(line)).catch(() => (failed += 1));
    }
    for (const item of result.check.filter((i) => check.has(i.id))) {
      await markToBuy(item.id, { stock_status: item.track_amount && item.quantity <= 0 ? "out" : "low", to_buy_amount: null }).catch(
        () => (failed += 1)
      );
    }
    for (const name of result.unlisted.filter((n) => names.has(n))) {
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
  const list = "flex flex-col divide-y overflow-hidden rounded-xl border bg-card";
  const row = "flex min-h-14 items-center gap-1 pr-3";

  return (
    <div className="flex flex-col">
      <SheetHeader>
        <SheetTitle className="text-xl">{t("Add missing to Shopping", "Tambahkan yang kurang ke Belanja")}</SheetTitle>
        <SheetDescription>
          {t("For the dishes not cooked yet this week.", "Untuk masakan minggu ini yang belum dimasak.")}
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
            {(result.toBuy.length > 0 || result.enough.length > 0) && (
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
                  {result.enough.map(({ item, need, have }) => (
                    <div key={item.id} className={cn(row, "pl-12")}>
                      <span className="flex min-w-0 flex-1 flex-col py-2">
                        <span className="truncate text-sm text-gray-700">{stockItemName(item)}</span>
                        <span className="text-xs text-muted-foreground">
                          {t(
                            `Enough · need ${friendlyAmount(need, item.unit, lang)} · have ${friendlyAmount(have, item.unit, lang)}`,
                            `Cukup · perlu ${friendlyAmount(need, item.unit, lang)} · ada ${friendlyAmount(have, item.unit, lang)}`
                          )}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {result.check.length > 0 && (
              <section className={section} aria-labelledby="missing-check">
                <h3 id="missing-check" className={heading}>
                  {t("Check these", "Cek dulu")}
                </h3>
                <div className={list}>
                  {result.check.map((item) => {
                    const listed = isLowStock(item);
                    return (
                      <div key={item.id} className={row}>
                        <Tick
                          on={check.has(item.id)}
                          label={stockItemName(item)}
                          disabled={listed}
                          onClick={() => toggle(check, item.id, setCheck)}
                        />
                        <span className="flex min-w-0 flex-1 flex-col py-2">
                          <span className="truncate text-sm font-medium">{stockItemName(item)}</span>
                          <span className="text-xs text-muted-foreground">
                            {listed ? t("Already on the list", "Sudah di daftar") : STOCK_STATUS_LABELS[lang][stockStatus(item)]}
                          </span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {result.unlisted.length > 0 && (
              <section className={section} aria-labelledby="missing-unlisted">
                <h3 id="missing-unlisted" className={heading}>
                  {t("Not on your list", "Belum ada di daftar")}
                </h3>
                <div className={list}>
                  {result.unlisted.map((name) => {
                    const listed = noted.has(name.toLowerCase());
                    return (
                      <div key={name} className={row}>
                        <Tick on={names.has(name)} label={name} disabled={listed} onClick={() => toggle(names, name, setNames)} />
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
