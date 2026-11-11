"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ClipboardCopy, Loader2, MessageCircle, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { usePurchase } from "@/components/shopping/bought-sheet";
import { StockItemsPanel } from "@/components/shopping/stock-items-panel";
import { ToBuyRow } from "@/components/shopping/to-buy-row";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useHouseholdProfile } from "@/hooks/use-household-profile";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { amountsOn, ingredientsUnderFood } from "@/lib/features";
import { amountLine, isIngredient, isTracked, toBuyAmountLabel } from "@/lib/kitchen-units";
import {
  STOCK_STATUS_LABELS,
  alertSubject,
  buildShoppingList,
  compareForList,
  isLowStock,
  stockItemName,
  stockStatus,
} from "@/lib/inventory";
import { isActiveAlert } from "@/lib/inventory-status";
import { DATE_LOCALE } from "@/lib/owner-locale";
import type { InventoryAlert } from "@/types/database";

/**
 * The owner's Shopping tab (Phase 154; it replaced Inventory). For both
 * owners: either can check the list, mark things, jot something down.
 *
 *   To buy      a quick-add line, then everything someone marked running low
 *               or out and every note about anything else. Tick = bought.
 *   Everything  every item, Pets then Home. Tap to say how much is left, or
 *               to edit it.
 *
 * No counts, thresholds or stock checks: those went stale and made the tab
 * feel like work (docs/phase-153-review.md, section 4). Owner-facing, in the
 * owner's language.
 */
export function ShoppingTab() {
  const {
    inventoryItems,
    inventoryAlerts,
    entities,
    loading,
    resolveInventoryAlert,
    flagLowStock,
  } = useHousehold();
  const locale = useOwnerLocale();
  const t = useT();
  const { petsOn } = useHouseholdProfile();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const flags = useHouseholdFeatures();
  const showAmounts = amountsOn(flags);
  // D6: with Kitchen amounts on, fresh food and pantry browse under Food →
  // Ingredients; Shopping keeps the non-food supplies. To buy gathers all.
  const supplies = useMemo(
    () => (ingredientsUnderFood(flags) ? inventoryItems.filter((item) => !isIngredient(item)) : inventoryItems),
    [flags, inventoryItems]
  );
  const purchase = usePurchase(locale);
  const [jot, setJot] = useState("");
  const [jotting, setJotting] = useState(false);

  // Quick add (Phase 154): anyone in the family writes down something to buy
  // that isn't on the list — "eggs", "trash bags" — like a reminder. Filed as
  // a note in their own name (an admin's roster row, Phase 139).
  async function addToList(event: FormEvent) {
    event.preventDefault();
    const text = jot.trim();
    if (!text) return;
    setJotting(true);
    try {
      await flagLowStock({ pet_id: null, item_type: "other", note: text.slice(0, 120) });
      setJot("");
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't add it. Try again.", "Gagal menambahkan. Coba lagi."));
    } finally {
      setJotting(false);
    }
  }

  const petName = useMemo(() => {
    const byId = new Map(entities.map((e) => [e.id, e.name]));
    return (id: string | null) => (id ? (byId.get(id) ?? null) : null);
  }, [entities]);

  const toBuy = useMemo(() => inventoryItems.filter(isLowStock).sort(compareForList), [inventoryItems]);
  const notes = useMemo(
    () =>
      inventoryAlerts
        .filter(isActiveAlert)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((alert) => ({ alert, petName: petName(alert.pet_id) })),
    [inventoryAlerts, petName]
  );
  const count = toBuy.length + notes.length;

  const day = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString(DATE_LOCALE[locale], { day: "numeric", month: "short" }) : null;

  async function noteDone(alert: InventoryAlert, subject: string) {
    try {
      await resolveInventoryAlert(alert.id);
      toast.success(t(`Bought — ${subject}`, `Sudah dibeli — ${subject}`));
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    }
  }

  function shoppingText() {
    return buildShoppingList(inventoryItems, notes, locale);
  }

  async function copyList() {
    const text = shoppingText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("Shopping list copied", "Daftar belanja disalin"));
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't copy", "Gagal menyalin"));
    }
  }

  function sendList() {
    const text = shoppingText();
    if (!text) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  if (loading && inventoryItems.length === 0) {
    return (
      <div className="flex flex-col gap-3 px-4 pb-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      <section className="flex flex-col gap-2" aria-labelledby="to-buy-title">
        <h2 id="to-buy-title" className="text-sm font-semibold text-gray-900">
          {t("To buy", "Perlu dibeli")}
          {count > 0 && <span className="text-gray-400"> ({count})</span>}
        </h2>

        <form onSubmit={addToList} className="flex gap-2">
          <Input
            value={jot}
            onChange={(e) => setJot(e.target.value)}
            placeholder={t("Add something to buy…", "Tambah yang perlu dibeli…")}
            aria-label={t("Add something to buy", "Tambah yang perlu dibeli")}
            maxLength={120}
            enterKeyHint="done"
            className="min-h-11 rounded-xl bg-card"
          />
          {jot.trim() && (
            <Button type="submit" className="min-h-11 rounded-xl" disabled={jotting}>
              {jotting ? <Loader2 className="animate-spin" /> : <Plus />}
              {t("Add", "Tambah")}
            </Button>
          )}
        </form>

        {count === 0 ? (
          <p className="rounded-xl border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
            {t("Nothing to buy right now.", "Tidak ada yang perlu dibeli sekarang.")}
          </p>
        ) : (
          <>
            <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
              {toBuy.map((item) => {
                const by = item.stock_status_by ? staffName(item.stock_status_by) : null;
                const when = day(item.stock_status_at);
                const status = stockStatus(item);
                const amount = showAmounts && isTracked(item) ? amountLine(item, locale).text : null;
                // The menu's shortfall (Phase 170 PR C): "Buy 500 g".
                const buy = toBuyAmountLabel(item, locale);
                return (
                  <ToBuyRow
                    key={item.id}
                    title={stockItemName(item)}
                    detail={[buy ? t(`Buy ${buy}`, `Beli ${buy}`) : null, STOCK_STATUS_LABELS[locale][status], amount, by, when]
                      .filter(Boolean)
                      .join(" · ")}
                    out={status === "out"}
                    tickLabel={t(`Bought ${stockItemName(item)}`, `${stockItemName(item)} sudah dibeli`)}
                    onTick={() => purchase.buy(item)}
                  />
                );
              })}
              {notes.map(({ alert, petName: pet }) => {
                const subject = alertSubject(alert, pet, locale);
                const by = alert.staff_id ? staffName(alert.staff_id) : null;
                return (
                  <ToBuyRow
                    key={alert.id}
                    title={subject}
                    detail={[alert.note !== subject ? alert.note : null, by, day(alert.created_at)]
                      .filter(Boolean)
                      .join(" · ")}
                    tickLabel={t(`Bought ${subject}`, `${subject} sudah dibeli`)}
                    onTick={() => noteDone(alert, subject)}
                  />
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="min-h-11 flex-1 rounded-xl" onClick={sendList}>
                <MessageCircle /> {t("Send on WhatsApp", "Kirim lewat WhatsApp")}
              </Button>
              <Button
                variant="outline"
                className="min-h-11 rounded-xl px-3"
                onClick={copyList}
                aria-label={t("Copy list", "Salin daftar")}
              >
                <ClipboardCopy />
              </Button>
            </div>
          </>
        )}
      </section>

      <StockItemsPanel
        id="everything-title"
        title={t("Supplies at home", "Stok di rumah")}
        items={supplies}
        lang={locale}
        owner
        // No pet shelf to start on in a home without pets (Phase 162).
        defaultScope={petsOn ? "pet" : "home"}
        addLabel={t("Add item", "Tambah barang")}
        empty={
          inventoryItems.length > 0 ? (
            <p className="rounded-xl border border-dashed px-3 py-5 text-center text-sm text-muted-foreground">
              {t("Food items are under Food → Ingredients.", "Bahan masakan ada di Makanan → Bahan masakan.")}
            </p>
          ) : (
            <EmptyState
              icon={Package}
              title={t("Nothing on the list yet", "Belum ada barang")}
              description={
                petsOn
                  ? t(
                      "Add the things your home keeps — dog food, pee pads, cleaning supplies — and your staff can say when they run low.",
                      "Tambahkan barang yang selalu ada di rumah — makanan anjing, pee pad, sabun — supaya staf bisa memberi tahu kalau hampir habis."
                    )
                  : t(
                      "Add the things your home keeps — rice, gallon water, cleaning supplies — and your staff can say when they run low.",
                      "Tambahkan barang yang selalu ada di rumah — beras, galon, sabun — supaya staf bisa memberi tahu kalau hampir habis."
                    )
              }
            />
          )
        }
      />
      {purchase.sheet}
    </div>
  );
}
