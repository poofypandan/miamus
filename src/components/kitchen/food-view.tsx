"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Archive, Circle, CookingPot, Plus, Refrigerator, Snowflake, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { FoodDetailSheet } from "@/components/kitchen/food-detail-sheet";
import { FoodFormSheet } from "@/components/kitchen/food-form-sheet";
import { useHousehold } from "@/context/household-context";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { useToday } from "@/hooks/use-today";
import {
  FOOD_GROUP_LABELS,
  FOOD_PLACE_LABELS,
  containerLabel,
  containerToReturn,
  daysLeft,
  expiryLabel,
  groupFood,
  type FoodGroup,
  type FoodLocale,
} from "@/lib/food";
import { photoSrc } from "@/lib/photos";
import { formatDateLocal } from "@/lib/scheduleEngine";
import { cn } from "@/lib/utils";
import type { FoodItem, FoodPlace } from "@/types/database";

const PLACE_ICONS: Record<FoodPlace, typeof Refrigerator> = {
  fridge: Refrigerator,
  freezer: Snowflake,
  pantry: Archive,
  counter: Utensils,
};

const GROUPS: FoodGroup[] = ["today", "week", "later"];

/**
 * Food at home, by hand (Phase 156; mockup 1). One main action — Add food —
 * then containers to return (only when there are any), then the food in
 * three groups, soonest first. Red only for food past its date.
 *
 * Shared by the owner's Kitchen tab and the staff's Dapur: staff screens
 * pass "id" and canDelete={false}.
 */
export function FoodView({ locale, canDelete }: { locale: FoodLocale; canDelete: boolean }) {
  const id = locale === "id";
  const tr = (en: string, ind: string) => (id ? ind : en);
  const { foodItems, loading, returnFoodContainer } = useHousehold();
  const today = formatDateLocal(useToday());
  const { allProfiles } = useStaffProfiles();
  const lookup = useStaffNameLookup(allProfiles, "");
  const staffName = (staffId: string | null) => (staffId ? lookup(staffId) || null : null);

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<FoodItem | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Looked up live, so the sheet shows the food as it is now.
  const open = useMemo(() => foodItems.find((f) => f.id === openId && f.outcome === null) ?? null, [foodItems, openId]);

  const groups = useMemo(() => groupFood(foodItems, today), [foodItems, today]);
  const containers = useMemo(
    () =>
      foodItems
        .filter(containerToReturn)
        .sort((a, b) => (a.finished_at ?? "").localeCompare(b.finished_at ?? "")),
    [foodItems]
  );
  const listed = groups.today.length + groups.week.length + groups.later.length;

  async function returned(item: FoodItem) {
    try {
      await returnFoodContainer(item.id);
      toast.success(tr("Container returned", "Wadah sudah dikembalikan"));
    } catch (err) {
      console.error(err);
      toast.error(tr("Couldn't save. Try again.", "Gagal menyimpan. Coba lagi."));
    }
  }

  if (loading && foodItems.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Button className="min-h-12 w-full rounded-xl text-base" onClick={() => setAdding(true)}>
        <Plus /> {tr("Add food", "Tambah makanan")}
      </Button>

      {containers.length > 0 && (
        <section className="flex flex-col gap-2" aria-labelledby="food-containers">
          <h2 id="food-containers" className="text-sm font-semibold text-gray-900">
            {tr("Containers to return", "Wadah yang perlu dikembalikan")}
          </h2>
          <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
            {containers.map((item) => (
              <div key={item.id} className="flex min-h-14 items-center gap-1 pr-3">
                <button
                  type="button"
                  onClick={() => returned(item)}
                  aria-label={tr(`Container returned: ${item.name}`, `Wadah sudah dikembalikan: ${item.name}`)}
                  className="flex size-12 shrink-0 items-center justify-center text-muted-foreground active:text-gray-900"
                >
                  <Circle className="size-5" />
                </button>
                <span className="flex min-w-0 flex-1 flex-col py-2">
                  <span className="truncate text-sm font-medium">{containerLabel(item.from_whom, locale)}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.name}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {listed === 0 ? (
        <EmptyState
          icon={CookingPot}
          title={tr("No food listed", "Belum ada makanan")}
          description={tr(
            "When food comes into the house — a gift, leftovers, a cake — add it here so nobody forgets to eat it.",
            "Kalau ada makanan masuk — hadiah, sisa masakan, kue — tambahkan di sini supaya tidak lupa dimakan."
          )}
        />
      ) : (
        GROUPS.filter((g) => groups[g].length > 0).map((group) => (
          <section key={group} className="flex flex-col gap-2" aria-labelledby={`food-${group}`}>
            <h2 id={`food-${group}`} className="text-sm font-semibold text-gray-900">
              {FOOD_GROUP_LABELS[locale][group]}
            </h2>
            <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
              {groups[group].map((item) => (
                <FoodRow key={item.id} item={item} today={today} locale={locale} onPress={() => setOpenId(item.id)} />
              ))}
            </div>
          </section>
        ))
      )}

      <FoodDetailSheet
        item={open}
        locale={locale}
        staffName={staffName}
        canDelete={canDelete}
        onClose={() => setOpenId(null)}
        onEdit={(item) => {
          setOpenId(null);
          // One overlay after the other, as on the Shopping list (Codex
          // review, PR #9): closing the sheet pops its history entry
          // asynchronously, and opening the editor in the same moment would
          // let that pop close the editor.
          let opened = false;
          const openEditor = () => {
            if (opened) return;
            opened = true;
            window.removeEventListener("popstate", openEditor);
            setEditing(item);
          };
          window.addEventListener("popstate", openEditor, { once: true });
          window.setTimeout(openEditor, 400);
        }}
      />
      <FoodFormSheet
        open={adding || editing !== null}
        item={editing}
        locale={locale}
        onClose={() => {
          setAdding(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function FoodRow({
  item,
  today,
  locale,
  onPress,
}: {
  item: FoodItem;
  today: string;
  locale: FoodLocale;
  onPress: () => void;
}) {
  const days = daysLeft(item, today);
  const past = days !== null && days < 0;
  const Icon = PLACE_ICONS[item.kept_in];
  const detail = [
    FOOD_PLACE_LABELS[locale][item.kept_in],
    item.from_whom ? (locale === "id" ? `dari ${item.from_whom}` : `from ${item.from_whom}`) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex min-h-16 w-full items-center gap-3 px-3 py-2 text-left active:bg-muted"
    >
      {item.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoSrc(item.photo_url, 160)} alt="" className="size-11 shrink-0 rounded-lg bg-muted object-cover" />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-5" strokeWidth={1.75} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{item.name}</span>
        <span className={cn("truncate text-xs", past ? "font-medium text-red-700" : "text-muted-foreground")}>
          {past ? expiryLabel(days, locale) : detail}
        </span>
      </span>
      {!past && <span className="shrink-0 text-xs text-muted-foreground">{expiryLabel(days, locale)}</span>}
    </button>
  );
}
