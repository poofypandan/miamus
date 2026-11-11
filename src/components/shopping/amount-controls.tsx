"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useHousehold } from "@/context/household-context";
import { amountInputValue, amountLine, amountStep, formatAmount, parseAmount, unitLabel } from "@/lib/kitchen-units";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/types/database";

/**
 * A tracked item's amount in its sheet (Phase 170 PR A): the amount left,
 * minus and plus (step 100 for g and ml, 0.5 for kg and L, 1 otherwise), and
 * Set amount to type it. For owners and staff alike (D3); staff screens pass
 * "id". Never asks anyone to count (D2): an old amount just reads in grey.
 */
export function AmountControls({ item, lang }: { item: InventoryItem; lang: "en" | "id" }) {
  const { adjustInventoryQuantity, setInventoryAmount } = useHousehold();
  const id = lang === "id";
  const step = amountStep(item.unit);
  const line = amountLine(item, lang);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const typed = parseAmount(text);

  function startEditing() {
    setText(amountInputValue(item.quantity, lang));
    setEditing(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (typed === null) return;
    setSaving(true);
    try {
      await setInventoryAmount(item.id, typed);
      setEditing(false);
    } catch (err) {
      console.error(err);
      toast.error(id ? "Gagal menyimpan. Coba lagi." : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className="size-12 shrink-0 rounded-xl"
          onClick={() => adjustInventoryQuantity(item.id, -step)}
          disabled={item.quantity <= 0}
          aria-label={id ? `Kurangi ${formatAmount(step, item.unit, lang)}` : `Take off ${formatAmount(step, item.unit, lang)}`}
        >
          <Minus />
        </Button>
        <p className="min-w-0 flex-1 text-center" aria-live="polite">
          <span className={cn("block text-lg font-semibold", line.stale ? "text-muted-foreground" : "text-gray-900")}>
            {line.text}
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          className="size-12 shrink-0 rounded-xl"
          onClick={() => adjustInventoryQuantity(item.id, step)}
          aria-label={id ? `Tambah ${formatAmount(step, item.unit, lang)}` : `Add ${formatAmount(step, item.unit, lang)}`}
        >
          <Plus />
        </Button>
      </div>
      {editing ? (
        <form onSubmit={save} className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="decimal"
            enterKeyHint="done"
            autoFocus
            aria-label={id ? "Jumlah sekarang" : "Amount now"}
            className="min-h-11 flex-1 rounded-xl"
          />
          <span className="text-sm text-muted-foreground">{unitLabel(item.unit, lang)}</span>
          <Button type="submit" className="min-h-11 rounded-xl" disabled={typed === null || saving}>
            {saving && <Loader2 className="animate-spin" />}
            {id ? "Simpan" : "Save"}
          </Button>
        </form>
      ) : (
        <Button type="button" variant="ghost" className="min-h-10 rounded-xl" onClick={startEditing}>
          {id ? "Ubah jumlah" : "Set amount"}
        </Button>
      )}
    </div>
  );
}
