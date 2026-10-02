"use client";

import { useState } from "react";
import { Minus, Package, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { useHousehold } from "@/context/household-context";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS_EN,
  CATEGORY_LABELS_ID,
  formatQuantity,
  isLowStock,
  isOutOfStock,
  stepFor,
  stockItemName,
} from "@/lib/inventory";
import { photoSrc } from "@/lib/photos";
import { cn } from "@/lib/utils";
import type { InventoryItem } from "@/types/database";

// The card is shared by the English owner dashboard and the Indonesian staff
// view (Phase 46 language boundary): one layout, two dictionaries.
const COPY = {
  en: {
    out: "Out of stock",
    low: "Low",
    min: "min",
    less: (name: string) => `Use one ${name}`,
    more: (name: string) => `Add one ${name}`,
    photo: (name: string) => `View photo of ${name}`,
    edit: (name: string) => `Edit ${name}`,
    labels: CATEGORY_LABELS_EN,
  },
  id: {
    out: "Habis",
    low: "Menipis",
    min: "min",
    less: (name: string) => `Kurangi ${name}`,
    more: (name: string) => `Tambah ${name}`,
    photo: (name: string) => `Lihat foto ${name}`,
    edit: (name: string) => `Ubah ${name}`,
    labels: CATEGORY_LABELS_ID,
  },
} as const;

/**
 * One item on the shelf, with the stepper on the card itself (Phase 110).
 *
 * Taking a bottle of floor cleaner off the shelf is a "-" here and nothing
 * else — no form, no save button. The count moves on the tap; the context
 * batches the taps to the server (see adjustInventoryQuantity).
 *
 * Tinted amber when low and red when empty: the same two warnings, in the
 * same order, that the list sorts by.
 */
export function InventoryItemCard({
  item,
  lang,
  onEdit,
}: {
  item: InventoryItem;
  lang: "en" | "id";
  /** Present for the owner only. Staff count; they do not edit. */
  onEdit?: () => void;
}) {
  const { adjustInventoryQuantity } = useHousehold();
  const [photoOpen, setPhotoOpen] = useState(false);
  const t = COPY[lang];
  const name = stockItemName(item);
  const out = isOutOfStock(item);
  const low = isLowStock(item);
  const step = stepFor(item.unit);
  const CategoryIcon = CATEGORY_ICONS[item.category];

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border bg-card p-3",
        out ? "border-red-200 bg-red-50/70" : low && "border-amber-200 bg-amber-50/70"
      )}
    >
      <div className="flex items-center gap-3">
        {item.photo_url ? (
          <button
            type="button"
            onClick={() => setPhotoOpen(true)}
            aria-label={t.photo(name)}
            className="shrink-0 rounded-lg"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoSrc(item.photo_url, 160)}
              alt=""
              loading="lazy"
              className="size-12 rounded-lg object-cover ring-1 ring-border"
            />
          </button>
        ) : (
          <span
            className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
            aria-hidden
          >
            <Package className="size-5" />
          </span>
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <Badge variant="secondary" className="h-5 w-fit gap-1 px-1.5 text-[10px]">
            <CategoryIcon className="size-3" />
            {t.labels[item.category]}
          </Badge>
        </div>

        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-label={t.edit(name)}
            className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-transform active:scale-95"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p
          className={cn(
            "text-xs",
            out ? "font-semibold text-red-700" : low ? "font-semibold text-amber-800" : "text-muted-foreground"
          )}
        >
          {out ? t.out : low ? t.low : null}
          {(out || low) && " · "}
          {t.min} {formatQuantity(item.min_threshold)} {item.unit}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          <StepButton
            label={t.less(name)}
            disabled={item.quantity <= 0}
            onClick={() => adjustInventoryQuantity(item.id, -step)}
          >
            <Minus className="size-4" />
          </StepButton>
          {/* aria-live so a screen reader hears the new count after each tap. */}
          <span
            aria-live="polite"
            className="min-w-16 text-center text-sm font-semibold tabular-nums"
          >
            {formatQuantity(item.quantity)}{" "}
            <span className="font-normal text-muted-foreground">{item.unit}</span>
          </span>
          <StepButton label={t.more(name)} onClick={() => adjustInventoryQuantity(item.id, step)}>
            <Plus className="size-4" />
          </StepButton>
        </div>
      </div>

      {item.photo_url && (
        <PhotoLightbox
          open={photoOpen}
          onClose={() => setPhotoOpen(false)}
          items={[{ src: item.photo_url, alt: name, title: name, description: t.labels[item.category] }]}
        />
      )}
    </div>
  );
}

// 44px: the minimum touch target, on a control people hit repeatedly and
// quickly. The press feedback is a scale — a transform, so it composites on
// the GPU rather than repainting the card (Phase 110 performance pass).
function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-lg border bg-background transition-transform active:scale-90 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
