import { Dog } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPetMeta } from "@/lib/pets";
import type { TaskEntity } from "@/types/database";

// Small, non-interactive avatar for unified/all-pets views — distinct from
// PetsRow's avatar, which carries its own gesture/active-ring concerns.
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
        src={meta.avatar_url}
        alt={pet.name}
        className={cn("size-12 shrink-0 rounded-full border border-gray-200 object-cover", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex size-12 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-400",
        className
      )}
    >
      <Dog className="size-6" />
    </div>
  );
}
