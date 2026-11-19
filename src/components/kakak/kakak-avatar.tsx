import { cn } from "@/lib/utils";
import { ROOF_POINTS } from "@/components/brand/brand-mark";

/**
 * Kakak's mark, the "warm seal" (owner, 20 Nov 2026; treatment 2 of the
 * Kakak identity proposal): the Miamus roof with a heart under it, drawn in
 * the light on a solid disc of her terracotta, with no border. The whole disc
 * is the mark, so she reads at 20 px as a terracotta dot with a roof and a
 * heart. The roof is the logo's own stroke; the logo's two walls are gone
 * (they read as legs), and the heart is fuller, with a rounded tip.
 *
 * Only her tokens: the disc is `kakak` and the drawing `kakak-tint`, which
 * keeps it light on terracotta here and dark on the lighter rose of the dark
 * tokens.
 *
 * The roof never moves; the heart is alive (globals.css, "Kakak's heart"):
 * `beat` makes it beat slowly while she thinks, follow a gentle beat while a
 * reply is read aloud, or settle once when something is saved. None of it
 * runs under reduced motion.
 */

/**
 * The heart, in the logo's 512 box: under the roof where the M's dip was,
 * with full lobes and a soft rounded tip, so its lower edge is a curve and
 * not a point.
 */
export const KAKAK_HEART =
  "M256 249.8C244.5 221.6 225.3 204 204.2 204C177.3 204 160 226.9 160 258.6C160 302.6 206.1 337.8 242.6 371.2Q256 383.5 269.4 371.2C305.9 337.8 352 302.6 352 258.6C352 226.9 334.7 204 307.8 204C286.7 204 267.5 221.6 256 249.8Z";

/** The drawing's own square, the roof's top to the heart's tip, so it sits evenly in the circle. */
export const KAKAK_VIEWBOX = "92 78 328 328";

/** What her heart is doing: thinking, speaking (reading a reply aloud), or a saved settle. */
export type KakakBeat = "think" | "speak" | "settle";

/** How long a settle is shown for: its 420 ms (globals.css) and a little room. Then the heart is still again. */
export const KAKAK_SETTLE_MS = 600;

export function KakakAvatar({ className, beat }: { className?: string; beat?: KakakBeat | null }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-kakak text-kakak-tint", className)}
    >
      <svg viewBox={KAKAK_VIEWBOX} className="size-[60%]" fill="none">
        <polyline
          points={ROOF_POINTS}
          stroke="currentColor"
          strokeWidth={40}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={KAKAK_HEART} fill="currentColor" className="kakak-heart" data-beat={beat ?? undefined} />
      </svg>
    </span>
  );
}
