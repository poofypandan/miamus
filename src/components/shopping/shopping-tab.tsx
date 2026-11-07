"use client";

import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Circle, ClipboardCopy, Loader2, MessageCircle, Package, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { InventoryItemForm } from "@/components/inventory/inventory-item-form";
import { ItemList } from "@/components/shopping/item-list";
import { StockStatusSheet } from "@/components/shopping/stock-status-sheet";
import { useHousehold } from "@/context/household-context";
import { useOwnerLocale, useT } from "@/context/owner-locale-context";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
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
import { cn } from "@/lib/utils";
import type { InventoryAlert, InventoryItem } from "@/types/database";

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
    setInventoryStatus,
    resolveInventoryAlert,
    flagLowStock,
  } = useHousehold();
  const locale = useOwnerLocale();
  const t = useT();
  const { allProfiles } = useStaffProfiles();
  const staffName = useStaffNameLookup(allProfiles, t("Someone", "Seseorang"));
  const [choosing, setChoosing] = useState<InventoryItem | null>(null);
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);
  // The item the form shows, kept while it closes so the title doesn't flip
  // to "Add item" during the fade-out.
  const [formItem, setFormItem] = useState<InventoryItem | null>(null);
  function edit(next: InventoryItem | "new") {
    setFormItem(next === "new" ? null : next);
    setEditing(next);
  }
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

  async function bought(item: InventoryItem) {
    const before = stockStatus(item);
    try {
      await setInventoryStatus(item.id, "ok");
      toast.success(t(`Bought — ${stockItemName(item)}`, `Sudah dibeli — ${stockItemName(item)}`), {
        action: {
          label: t("Undo", "Batalkan"),
          onClick: () => void setInventoryStatus(item.id, before).catch(() => undefined),
        },
      });
    } catch (err) {
      console.error(err);
      toast.error(t("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    }
  }

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
                return (
                  <Row
                    key={item.id}
                    title={stockItemName(item)}
                    detail={[STOCK_STATUS_LABELS[locale][status], by, when].filter(Boolean).join(" · ")}
                    out={status === "out"}
                    tickLabel={t(`Bought ${stockItemName(item)}`, `${stockItemName(item)} sudah dibeli`)}
                    onTick={() => bought(item)}
                  />
                );
              })}
              {notes.map(({ alert, petName: pet }) => {
                const subject = alertSubject(alert, pet, locale);
                const by = alert.staff_id ? staffName(alert.staff_id) : null;
                return (
                  <Row
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

      <section className="flex flex-col gap-2" aria-labelledby="everything-title">
        <div className="flex items-center justify-between gap-2">
          <h2 id="everything-title" className="text-sm font-semibold text-gray-900">
            {t("Supplies at home", "Stok di rumah")}
          </h2>
          <Button variant="ghost" size="sm" className="-mr-2 min-h-10" onClick={() => edit("new")}>
            <Plus /> {t("Add item", "Tambah barang")}
          </Button>
        </div>
        {inventoryItems.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t("Nothing on the list yet", "Belum ada barang")}
            description={t(
              "Add the things your home keeps — dog food, pee pads, cleaning supplies — and your staff can say when they run low.",
              "Tambahkan barang yang selalu ada di rumah — makanan anjing, pee pad, sabun — supaya staf bisa memberi tahu kalau hampir habis."
            )}
          />
        ) : (
          <ItemList items={inventoryItems} lang={locale} onPress={setChoosing} />
        )}
      </section>

      <StockStatusSheet
        item={choosing}
        lang={locale}
        onClose={() => setChoosing(null)}
        onEdit={(item) => {
          setChoosing(null);
          // One overlay after the other (Codex review, PR #9): closing the
          // sheet pops its history entry asynchronously (useBackToClose).
          // Opening the editor in the same moment pushed the editor's entry
          // first, and that late pop then closed the editor as if Back had
          // been pressed. So the editor opens once the pop has landed — or
          // after a moment, if the sheet had no entry left to pop.
          let opened = false;
          const openEditor = () => {
            if (opened) return;
            opened = true;
            window.removeEventListener("popstate", openEditor);
            edit(item);
          };
          window.addEventListener("popstate", openEditor, { once: true });
          window.setTimeout(openEditor, 400);
        }}
      />
      <InventoryItemForm
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        item={formItem}
        defaultScope="pet"
      />
    </div>
  );
}

/** One thing to buy: a round tick on the left, like a checklist. */
function Row({
  title,
  detail,
  out = false,
  tickLabel,
  onTick,
}: {
  title: string;
  detail: string;
  out?: boolean;
  tickLabel: string;
  onTick: () => void;
}) {
  return (
    <div className="flex min-h-[56px] items-center gap-3 pr-3">
      <button
        type="button"
        onClick={onTick}
        aria-label={tickLabel}
        className="flex size-12 shrink-0 items-center justify-center text-muted-foreground active:text-gray-900"
      >
        <Circle className="size-5" />
      </button>
      <span className="flex min-w-0 flex-1 flex-col py-2">
        <span className="truncate text-sm font-medium">{title}</span>
        {detail && (
          <span className={cn("truncate text-xs", out ? "text-red-700" : "text-muted-foreground")}>
            {detail}
          </span>
        )}
      </span>
    </div>
  );
}
