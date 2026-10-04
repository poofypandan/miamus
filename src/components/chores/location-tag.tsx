import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A chore's room (Phase 135): a pin and the name, in the chore's amber. Sub-
 * text rather than another badge — a card's badge row is already the time,
 * the assignee and the repeat, and the room is read with the title ("Lap
 * meja", in the Master Lounge), not beside them.
 *
 * Callers render nothing for a chore without a room, so an untagged chore
 * keeps exactly the layout it had.
 */
export function LocationTag({
  name,
  muted = false,
  className,
}: {
  name: string;
  /** A finished chore's quieter grey. */
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 text-xs font-medium",
        muted ? "text-muted-foreground" : "text-amber-800",
        className
      )}
    >
      <MapPin className="size-3 shrink-0" />
      <span className="truncate">{name}</span>
    </span>
  );
}
