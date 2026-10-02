"use client";

import { useState } from "react";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { photoSrc } from "@/lib/photos";
import { cn } from "@/lib/utils";
import type { HouseholdTask } from "@/types/database";

const COPY = {
  en: { before: "Before", after: "After", open: (label: string) => `View ${label} photo` },
  id: { before: "Sebelum", after: "Sesudah", open: (label: string) => `Lihat foto ${label}` },
} as const;

/**
 * A finished chore's proof as one picture (Phase 113): before on the left,
 * after on the right, each half the width, labelled on the image itself.
 *
 * Side by side rather than stacked, so the comparison is the thing you see
 * and a finished chore costs one image's height in the list, not two. With
 * only one shot it fills the frame alone.
 *
 * Falls back to `photo_url` for the after slot, which is every chore finished
 * before before/after existed (Phase 100) — its single proof photo is still
 * the evidence.
 *
 * `interactive` makes each half open the lightbox. Off inside a card that is
 * itself a button (the staff list), where a nested button would be invalid
 * HTML; tapping that card opens the chore instead.
 */
export function ChoreProofPhotos({
  row,
  locale,
  interactive,
}: {
  row: HouseholdTask;
  locale: "en" | "id";
  interactive: boolean;
}) {
  const t = COPY[locale];
  const [lightbox, setLightbox] = useState<number | null>(null);

  const candidates: { url: string | null | undefined; label: string }[] = [
    { url: row.before_photo_url, label: t.before },
    { url: row.after_photo_url ?? row.photo_url, label: t.after },
  ];
  const shots = candidates.filter((shot): shot is { url: string; label: string } => !!shot.url);
  if (shots.length === 0) return null;

  return (
    <>
      <div
        className={cn(
          "grid aspect-[2/1] w-full gap-px overflow-hidden rounded-lg bg-border ring-1 ring-border",
          shots.length === 2 ? "grid-cols-2" : "grid-cols-1"
        )}
      >
        {shots.map((shot, index) => {
          const image = (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoSrc(shot.url, 640)}
                alt={`${shot.label}: ${row.title}`}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                {shot.label}
              </span>
            </>
          );
          return interactive ? (
            <button
              key={shot.label}
              type="button"
              onClick={() => setLightbox(index)}
              aria-label={t.open(shot.label)}
              className="relative block size-full"
            >
              {image}
            </button>
          ) : (
            <span key={shot.label} className="relative block size-full">
              {image}
            </span>
          );
        })}
      </div>

      {interactive && (
        <PhotoLightbox
          open={lightbox !== null}
          onClose={() => setLightbox(null)}
          initialIndex={lightbox ?? 0}
          items={shots.map((shot) => ({
            src: shot.url,
            alt: `${shot.label}: ${row.title}`,
            title: row.title,
            description: <span>{shot.label}</span>,
          }))}
        />
      )}
    </>
  );
}
