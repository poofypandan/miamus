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
  wrap = false,
  className,
}: {
  name: string;
  /** A finished chore's quieter grey. */
  muted?: boolean;
  /**
   * Wrap a long name instead of cutting it off (audit B1): on a chore card,
   * "LT2 · GB2 Bathroom · Wastafel" is where to go, and every word counts.
   */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 gap-1 text-xs font-medium",
        wrap ? "items-start" : "items-center",
        muted ? "text-muted-foreground" : "text-gray-700",
        className
      )}
    >
      <MapPin className={cn("size-3 shrink-0", wrap && "mt-[0.2em]")} />
      <span className={wrap ? "min-w-0 break-words" : "truncate"}>{name}</span>
    </span>
  );
}
