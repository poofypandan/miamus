import { Dog } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPetMeta } from "@/lib/pets";
import type { TaskEntity } from "@/types/database";

// Small, non-interactive avatar for unified/all-pets views — distinct from
// PetsRow's avatar, which carries its own gesture/active-ring concerns.
export function MiniPetAvatar({ pet, className }: { pet: TaskEntity; className?: string }) {
  const meta = getPetMeta(pet);

  if (meta.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={meta.avatar_url}
        alt={pet.name}
        className={cn(
          "size-8 shrink-0 rounded-full border border-gray-200 object-cover",
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-gray-400",
        className
      )}
    >
      <Dog className="size-4" />
    </div>
  );
}
