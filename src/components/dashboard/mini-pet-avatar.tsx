import { Dog } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPetMeta } from "@/lib/pets";
import type { TaskEntity } from "@/types/database";
import { photoSrc } from "@/lib/photos";

// Small avatar used throughout the Unified Overview and drill-down triggers.
// NOTE: To revert avatar scaling, change w-12 h-12 back to the original size
// (e.g., w-8 h-8) and remove negative margins in clusters.
export function MiniPetAvatar({ pet, className }: { pet: TaskEntity; className?: string }) {
  const meta = getPetMeta(pet);

  if (meta.avatar_url) {
    return (
      // No background behind the image — a transparent PNG (a cutout logo,
      // a pet photo with no fill) should show the page's own background
      // through it, not a colored circle.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoSrc(meta.avatar_url, 160)}
        loading="lazy"
        decoding="async"
        alt={pet.name}
        // Squircle by default since Phase 59. Square so rows of pets line up.
        //
        // Contained, not cropped (Phase 95): the whole photo shows, which is
        // what was asked for after avatars appeared zoomed into a patch of
        // fur. The cost is visible — a portrait inside a 48px square is a
        // narrow strip between two bars — and the real fix is either a taller
        // avatar box (3:4) or avatar photos framed as square portraits.
        className={cn(
          "size-12 aspect-square shrink-0 rounded-xl border border-gray-200 bg-muted object-contain",
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex size-12 aspect-square shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-100 text-gray-400",
        className
      )}
    >
      <Dog className="size-6" />
    </div>
  );
}
