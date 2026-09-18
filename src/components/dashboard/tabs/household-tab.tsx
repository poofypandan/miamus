"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Package, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRibbon } from "@/components/date-ribbon";
import { ChorePanel } from "@/components/dashboard/chore-panel";
import { InventoryTab } from "@/components/dashboard/inventory-tab";
import { useHousehold } from "@/context/household-context";
import { useRequireOwner } from "@/hooks/use-require-owner";
import type { InventoryItem, ItemType } from "@/types/database";

// Owner-facing, so entirely English per the Phase 46 language boundary.
const CATEGORY_LABELS: Record<ItemType, string> = {
  food: "Food",
  medicine: "Medicine",
  treats: "Treats",
  shampoo: "Shampoo",
  pee_pad: "Pee Pad",
  other: "Other",
};

// What the owner can file a product under. Mirrors the staff low-stock picker
// plus medicine, which is a real thing to stock even though staff report it as
// a routine rather than as inventory.
const CATEGORY_ORDER: ItemType[] = ["food", "medicine", "shampoo", "pee_pad", "other"];

export function HouseholdTab() {
  const { inventoryItems, loading, addInventoryItem, selectedDate, setSelectedDate } =
    useHousehold();
  const isOwner = useRequireOwner();

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ItemType>("food");
  const [saving, setSaving] = useState(false);

  // Grouped so a long catalogue stays scannable by aisle rather than being one
  // flat alphabetical run.
  const grouped = useMemo(() => {
    const byCategory = new Map<InventoryItem["category"], InventoryItem[]>();
    for (const item of inventoryItems) {
      const list = byCategory.get(item.category) ?? [];
      list.push(item);
      byCategory.set(item.category, list);
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
      category: c,
      items: byCategory.get(c)!,
    }));
  }, [inventoryItems]);

  if (!isOwner) return null;

  async function handleAdd() {
    if (!name.trim()) {
      toast.error("Give the item a name");
      return;
    }
    setSaving(true);
    try {
      await addInventoryItem({ name: name.trim(), category });
      toast.success(`Added ${name.trim()}`);
      setName("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add item — has the Phase 60 migration been run?");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The Household module replaces the whole pets canvas — ribbon included
          (see dashboard/page.tsx) — so chores need their own copy to be
          browsable by day at all. It drives the same global `selectedDate`, so
          picking a date here and then switching back to Pets lands on the same
          day. */}
      <DateRibbon value={selectedDate} onChange={setSelectedDate} />

      <ChorePanel />

      <InventoryTab />

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold text-gray-900">Master Inventory</h2>

        <Card className="py-4">
          <CardContent className="flex flex-col gap-3 px-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Item name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Royal Canin Mini Adult"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Category</Label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORY_ORDER.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant={category === c ? "default" : "outline"}
                    className="min-h-[44px]"
                    onClick={() => setCategory(c)}
                  >
                    {CATEGORY_LABELS[c]}
                  </Button>
                ))}
              </div>
            </div>

            <Button onClick={handleAdd} disabled={saving} className="min-h-[48px]">
              {saving ? <Loader2 className="animate-spin" /> : <Plus />} Add Item
            </Button>
          </CardContent>
        </Card>

        {grouped.length === 0 ? (
          <p className="pt-4 text-center text-sm text-muted-foreground">
            No items yet. Add what this household buys so staff can pick from the list when
            reporting low stock.
          </p>
        ) : (
          grouped.map((group) => (
            <section key={group.category} className="flex flex-col gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <Package className="size-3.5" />
                {CATEGORY_LABELS[group.category]}
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                  {group.items.length}
                </Badge>
              </h3>
              {group.items.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function ItemRow({ item }: { item: InventoryItem }) {
  const { removeInventoryItem } = useHousehold();
  const [busy, setBusy] = useState(false);

  async function handleRemove() {
    setBusy(true);
    try {
      await removeInventoryItem(item.id);
      toast.success(`Removed ${item.name}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove item");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
      <button
        type="button"
        onClick={handleRemove}
        disabled={busy}
        aria-label={`Remove ${item.name}`}
        className="flex min-h-[36px] shrink-0 items-center rounded-lg px-2 text-muted-foreground active:bg-muted"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </button>
    </div>
  );
}
