import type { OwnerLocale } from "@/lib/owner-locale";
import type { ItemType } from "@/types/database";

/** Low-stock item types, in each language (Phase 149; the staff side's words). */
export const ITEM_TYPE_LABELS: Record<OwnerLocale, Record<ItemType, string>> = {
  en: {
    food: "Food",
    medicine: "Medicine",
    treats: "Treats",
    shampoo: "Shampoo",
    pee_pad: "Pee Pad",
    other: "Other",
  },
  id: {
    food: "Makanan",
    medicine: "Obat",
    treats: "Camilan",
    shampoo: "Sampo",
    pee_pad: "Pee Pad",
    other: "Lainnya",
  },
};
