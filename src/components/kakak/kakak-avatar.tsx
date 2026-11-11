import { cn } from "@/lib/utils";
import { ROOF_POINTS } from "@/components/brand/brand-mark";

/**
 * Kakak's small round mark (owner, 2026-11-11): the Miamus house with a
 * heart inside, no face. The roof and the two walls are the logo's own
 * strokes; the heart takes the place of the M's dip, so she reads as the
 * home's caring older sister rather than a person. One gentle warm colour,
 * the `kakak` tokens in globals.css (clay rose on a warm blush, lighter rose
 * on a warm dark), and nothing else.
 */

/** The logo's two walls without the M's V between them (512 box). */
export const KAKAK_WALLS = "M152 400V262M360 262V400";

/** A soft heart where the M dipped: lobes level with the wall tops. */
export const KAKAK_HEART =
  "M256 374C236 359 194 331 194 296C194 274 210 258 229 258C242 258 251 266 256 276C261 266 270 258 283 258C302 258 318 274 318 296C318 331 276 359 256 374Z";

/** The drawing, cropped to the house so it fills the circle evenly. */
export const KAKAK_VIEWBOX = "92 84 328 336";

export function KakakAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-kakak-line bg-kakak-tint text-kakak",
        className
      )}
    >
      <svg viewBox={KAKAK_VIEWBOX} className="size-[64%]" fill="none">
        <polyline
          points={ROOF_POINTS}
          stroke="currentColor"
          strokeWidth={40}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d={KAKAK_WALLS} stroke="currentColor" strokeWidth={40} strokeLinecap="round" />
        <path d={KAKAK_HEART} fill="currentColor" />
      </svg>
    </span>
  );
}
