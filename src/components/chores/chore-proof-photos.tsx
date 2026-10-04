"use client";

import { useState } from "react";
import { PhotoLightbox } from "@/components/dashboard/photo-lightbox";
import { photoSrc, photoTakenAt } from "@/lib/photos";
import { formatDuration, formatTime12h } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { HouseholdTask } from "@/types/database";

const COPY = {
  en: {
    before: "Before",
    after: "After",
    open: (label: string) => `View ${label} photo`,
    span: (duration: string) => `${duration} between photos`,
  },
  id: {
    before: "Sebelum",
    after: "Sesudah",
    open: (label: string) => `Lihat foto ${label}`,
    span: (duration: string) => `${duration} antara foto`,
  },
} as const;

/**
 * "10:45 AM", or "Sat 10:45 AM" when the two shots fall on different days —
 * a chore carried over from yesterday (Phase 126) can be started one day and
 * finished the next, and a bare time would read as the same morning.
 */
function stamp(at: Date, withDay: boolean, locale: "en" | "id"): string {
  const time = formatTime12h(at);
  if (!withDay) return time;
  const day = at.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", { weekday: "short" });
  return `${day} ${time}`;
}

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
 * Each half carries the time it was taken, and the lightbox the span between
 * the two (Phase 126) — read from the photos themselves, see photoTakenAt.
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
  const present = candidates.filter((shot): shot is { url: string; label: string } => !!shot.url);
  if (present.length === 0) return null;

  // When each was taken, from the photo's own storage key (photoTakenAt):
  // the before shot marks the start of the work, the after shot its end, and
  // the gap between them is what a chore actually took (Phase 126).
  const times = present.map((shot) => photoTakenAt(shot.url));
  const crossesDays =
    times.length === 2 && !!times[0] && !!times[1] && times[0].toDateString() !== times[1].toDateString();
  const shots = present.map((shot, i) => ({
    ...shot,
    time: times[i] ? stamp(times[i], crossesDays, locale) : null,
  }));
  const span =
    times.length === 2 && times[0] && times[1]
      ? formatDuration(times[1].getTime() - times[0].getTime(), locale)
      : null;

  return (
    <>
      <div
        className={cn(
          "grid aspect-[2/1] w-full grid-rows-1 gap-px overflow-hidden rounded-lg bg-border ring-1 ring-border",
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
                // Pinned to the cell, cropped from the centre (Phase 128). As
                // `size-full` alone, the image's height was a percentage of a
                // grid cell's stretched height, which Safari does not always
                // resolve — the photo then laid out at its natural portrait
                // height and the frame's overflow-hidden cut off the bottom,
                // leaving the ceiling where the work should be. Absolutely
                // positioned, its box is the cell whatever the engine, and
                // object-center makes the crop's anchor explicit.
                className="absolute inset-0 size-full object-cover object-center"
              />
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white tabular-nums">
                {shot.label}
                {shot.time && <span className="font-normal text-white/85"> · {shot.time}</span>}
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
            description: (
              <span className="tabular-nums">
                {shot.label}
                {shot.time && ` · ${shot.time}`}
              </span>
            ),
            // The whole job in one line, on both slides: when it started,
            // when it ended, how long that was.
            footer:
              span && shots.length === 2 ? (
                <p className="text-sm text-muted-foreground tabular-nums">
                  {shots[0].time} → {shots[1].time} · {t.span(span)}
                </p>
              ) : null,
          }))}
        />
      )}
    </>
  );
}
