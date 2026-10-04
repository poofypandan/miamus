import { Camera, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The staff list's one cue that a card is something to tap (Phase 130).
 *
 * The cards are compact on purpose — no full-width "Ambil Foto" button on
 * each — so nothing else says that the photo, and with it the task, is one
 * tap away. Every unfinished card carries this, chores and pet routines
 * alike, as a pill in the row of badges it already has: it adds width, never
 * height. Solid dark rather than another tint, so it reads as an action among
 * labels; red when the task is late, matching the Terlambat frame around it.
 *
 * Staff-facing, so Bahasa Indonesia.
 */
export function TapHint({
  label = "Ketuk untuk foto",
  icon: Icon = Camera,
  urgent = false,
  className,
}: {
  label?: string;
  icon?: LucideIcon;
  urgent?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold text-white",
        urgent ? "bg-red-600" : "bg-zinc-900",
        className
      )}
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </span>
  );
}
