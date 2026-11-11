"use client";

import { useCallback, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useHousehold } from "@/context/household-context";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useHouseholdFeatures } from "@/hooks/use-household-features";
import { amountsOn } from "@/lib/features";
import { stockItemName, stockStatus } from "@/lib/inventory";
import { amountInputValue, clean, formatAmount, isTracked, parseAmount, unitLabel } from "@/lib/kitchen-units";
import type { InventoryItem } from "@/types/database";

/**
 * Bought, from a tick on To buy (Phase 170 PR A, mockup screen 3), for
 * owners and staff. On a tracked item (with Kitchen amounts on) it asks
 * "How much did you buy?", last time's amount pre-filled, and adds it;
 * "Skip amount" ticks it with no number. Untracked items tick as before.
 * The toast's Undo puts the item back exactly (amount, status, pre-fill).
 */
export function usePurchase(lang: "en" | "id"): { buy: (item: InventoryItem) => void; sheet: ReactNode } {
  const { recordPurchase, undoPurchase, inventoryItems } = useHousehold();
  const flags = useHouseholdFeatures();
  const [asking, setAsking] = useState<string | null>(null);
  const id = lang === "id";

  const commit = useCallback(
    async (before: InventoryItem, amount: number | null) => {
      try {
        const after = await recordPurchase(before.id, amount);
        const name = stockItemName(before);
        let text = id ? `Sudah dibeli — ${name}` : `Bought — ${name}`;
        if (isTracked(before) && amount !== null) {
          text =
            stockStatus(after) === "ok"
              ? `${id ? "Sudah dibeli" : "Bought"} · ${name} ${formatAmount(after.quantity, after.unit, lang)}`
              : id
                ? "Sudah dibeli · masih hampir habis"
                : "Bought · still running low";
        }
        toast.success(text, {
          action: {
            label: id ? "Batalkan" : "Undo",
            onClick: () => void undoPurchase(before, amount).catch(() => undefined),
          },
        });
        return true;
      } catch (err) {
        console.error(err);
        toast.error(id ? "Gagal menyimpan. Coba lagi." : "Couldn't save. Try again.");
        return false;
      }
    },
    [id, lang, recordPurchase, undoPurchase]
  );

  const buy = useCallback(
    (item: InventoryItem) => {
      if (amountsOn(flags) && isTracked(item)) setAsking(item.id);
      else void commit(item, null);
    },
    [commit, flags]
  );

  const item = asking ? (inventoryItems.find((i) => i.id === asking) ?? null) : null;
  const sheet = (
    <BoughtSheet
      item={item}
      lang={lang}
      onClose={() => setAsking(null)}
      onBought={async (amount) => {
        if (!item) return;
        if (await commit(item, amount)) setAsking(null);
      }}
    />
  );
  return { buy, sheet };
}

function BoughtSheet({
  item,
  lang,
  onClose,
  onBought,
}: {
  item: InventoryItem | null;
  lang: "en" | "id";
  onClose: () => void;
  onBought: (amount: number | null) => Promise<void>;
}) {
  useBackToClose(item !== null, onClose);
  return (
    <Sheet open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom">
        {item && <BoughtForm key={item.id} item={item} lang={lang} onBought={onBought} />}
      </SheetContent>
    </Sheet>
  );
}

function BoughtForm({
  item,
  lang,
  onBought,
}: {
  item: InventoryItem;
  lang: "en" | "id";
  onBought: (amount: number | null) => Promise<void>;
}) {
  const id = lang === "id";
  const last = item.last_bought_amount ?? null;
  const [text, setText] = useState(last ? amountInputValue(last, lang) : "");
  const [busy, setBusy] = useState<"bought" | "skip" | null>(null);
  const typed = parseAmount(text);
  const valid = typed !== null && typed > 0;
  const name = stockItemName(item);

  async function send(amount: number | null, which: "bought" | "skip") {
    setBusy(which);
    try {
      await onBought(amount);
    } finally {
      setBusy(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) void send(typed, "bought");
  }

  return (
    <form onSubmit={submit}>
      <SheetHeader>
        <SheetTitle>{id ? "Beli berapa?" : "How much did you buy?"}</SheetTitle>
        <SheetDescription>
          {last ? `${name} · ${id ? "biasanya" : "usually"} ${formatAmount(last, item.unit, lang)}` : name}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-3 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="decimal"
            enterKeyHint="done"
            autoFocus
            aria-label={id ? "Jumlah yang dibeli" : "Amount bought"}
            className="min-h-12 flex-1 rounded-xl text-lg"
          />
          <span className="text-sm text-muted-foreground">{unitLabel(item.unit, lang)}</span>
        </div>
        {valid && (
          <p className="text-sm text-muted-foreground">
            {formatAmount(item.quantity, item.unit, lang)} + {formatAmount(typed!, item.unit, lang)} ={" "}
            <span className="font-medium text-gray-900">{formatAmount(clean(item.quantity + typed!), item.unit, lang)}</span>
          </p>
        )}
        <Button type="submit" className="min-h-12 rounded-xl text-base" disabled={!valid || busy !== null}>
          {busy === "bought" && <Loader2 className="animate-spin" />}
          {id ? "Sudah dibeli" : "Bought"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 rounded-xl text-muted-foreground"
          disabled={busy !== null}
          onClick={() => void send(null, "skip")}
        >
          {busy === "skip" && <Loader2 className="animate-spin" />}
          {id ? "Lewati jumlah" : "Skip amount"}
        </Button>
      </div>
    </form>
  );
}
