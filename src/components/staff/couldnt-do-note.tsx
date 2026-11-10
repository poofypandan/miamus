"use client";

import { useState } from "react";
import { CircleSlash, ShoppingBasket } from "lucide-react";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { useHousehold } from "@/context/household-context";
import { useStaffNameLookup, useStaffProfiles } from "@/hooks/use-staff-profiles";
import { ownerReasonLabel, staffReasonLabel } from "@/lib/couldnt-do";
import { photoSrc } from "@/lib/photos";
import { formatTime } from "@/lib/time";
import type { TaskException } from "@/types/database";

/**
 * What someone said about a task that couldn't be done (Phase 165): the
 * reason, who and when, their note in quotes, the photo, and which
 * shopping-list item ran out. Amber, the app's "needs a look" tint.
 *
 * Shared by the staff sheets (locale "id", always) and the owner's sheets
 * (the owner's language). The staff's note is shown as they wrote it.
 */
export function CouldntDoNote({
  exception,
  locale = "id",
  medicine = false,
  petName,
}: {
  exception: TaskException;
  locale?: "en" | "id";
  medicine?: boolean;
  /** Routines: which pet it was about. */
  petName?: string;
}) {
  const id = locale === "id";
  const { inventoryItems } = useHousehold();
  const { allProfiles } = useStaffProfiles();
  const nameOf = useStaffNameLookup(allProfiles, id ? "Seseorang" : "Someone");
  const [viewing, setViewing] = useState(false);
  const who = exception.staff_id ? nameOf(exception.staff_id) : null;
  const when = formatTime(new Date(exception.created_at), locale);
  const reason =
    locale === "id" ? staffReasonLabel(exception.reason, medicine) : ownerReasonLabel(exception.reason, locale, medicine);
  const item = exception.inventory_item_id
    ? (inventoryItems.find((i) => i.id === exception.inventory_item_id)?.name ?? null)
    : null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3" data-testid="couldnt-do-note">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800">
        <CircleSlash className="size-4 shrink-0" aria-hidden />
        {id ? "Tidak bisa dikerjakan" : "Couldn't be done"}: {reason.charAt(0).toLowerCase() + reason.slice(1)}
      </p>
      <p className="text-xs text-gray-700">
        {[petName, who, when].filter(Boolean).join(" · ")}
      </p>
      {(exception.note || exception.photo_url) && (
        <div className="flex items-start gap-2.5">
          {exception.photo_url && (
            <button
              type="button"
              onClick={() => setViewing(true)}
              aria-label={id ? "Lihat foto" : "View photo"}
              className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoSrc(exception.photo_url, 160)} alt="" className="absolute inset-0 size-full object-cover" />
            </button>
          )}
          {exception.note && (
            <div className="min-w-0 flex-1">
              {who && (
                <p className="text-xs text-gray-600">{id ? `Catatan ${who}` : `${who}'s note`}</p>
              )}
              <p className="text-sm break-words whitespace-pre-line text-gray-900">“{exception.note}”</p>
            </div>
          )}
        </div>
      )}
      {item && (
        <p className="flex items-center gap-1.5 text-xs text-gray-700">
          <ShoppingBasket className="size-3.5 shrink-0" aria-hidden />
          {id ? `Yang habis: ${item}` : `Ran out: ${item}`}
        </p>
      )}
      {exception.photo_url && (
        <PhotoLightbox
          open={viewing}
          onClose={() => setViewing(false)}
          items={[
            {
              src: photoSrc(exception.photo_url, 1280),
              alt: reason,
              title: reason,
              description: [who, when].filter(Boolean).join(" · "),
            },
          ]}
        />
      )}
    </div>
  );
}
