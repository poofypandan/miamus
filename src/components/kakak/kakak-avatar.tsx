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

/**
 * A soft heart where the M dipped, as big as the house allows (owner,
 * 2026-11-11: "should the heart be bigger?"): 39% more area than the first
 * drawing, raised under the roof where the house is widest, and kept 16
 * units clear of the roof and the walls so it never merges with them at
 * 20 px.
 */
export const KAKAK_HEART =
  "M256 322.4C232.4 304.7 182.8 271.7 182.8 230.4C182.8 204.4 201.7 185.6 224.1 185.6C239.5 185.6 250.1 195 256 206.8C261.9 195 272.5 185.6 287.9 185.6C310.3 185.6 329.2 204.4 329.2 230.4C329.2 271.7 279.6 304.7 256 322.4Z";

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
