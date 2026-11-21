import { cn } from "@/lib/utils";
import { ROOF_POINTS } from "@/components/brand/brand-mark";

/**
 * Kakak's mark D, the light seal (chosen by the owners on 20 Nov, "We love
 * logo D"; spec in docs/private/landing/kakak-mark-d/): the Miamus roof with
 * a full heart under it, both in her terracotta, on a warm-white disc lifted
 * on a soft shadow. No walls, no outline, no solid terracotta disc. The roof
 * is the logo's own stroke; the heart is about a fifth wider than the warm
 * seal's, with a rounded tip.
 *
 * The disc is the same colour as the surfaces it sits on, so its shadow is
 * part of the mark: the deeper one from 36 px (`large`), the small one below.
 *
 * The roof never moves; the heart is alive (globals.css, "Kakak's heart"):
 * `beat` makes it beat slowly while she thinks, follow a gentle beat while a
 * reply is read aloud, or settle once when something is saved. None of it
 * runs under reduced motion.
 */

/** The heart, in the logo's 512 box: a box 232 wide and 200 tall at (140, 206), the tip rounded. */
export const KAKAK_HEART =
  "M256 258C242.1 226 218.9 206 193.4 206C160.9 206 140 232 140 268C140 318 195.7 358 239.8 396Q256 410 272.2 396C316.3 358 372 318 372 268C372 232 351.1 206 318.6 206C293.1 206 269.9 226 256 258Z";

/** The drawing's own box, the roof's top to the heart's tip; 66 % of the disc's width. */
export const KAKAK_VIEWBOX = "88 78 336 340";

/** What her heart is doing: thinking, speaking (reading a reply aloud), or a saved settle. */
export type KakakBeat = "think" | "speak" | "settle";

/** How long a settle is shown for: its 420 ms (globals.css) and a little room. Then the heart is still again. */
export const KAKAK_SETTLE_MS = 600;

export function KakakAvatar({
  className,
  beat,
  large = false,
}: {
  className?: string;
  beat?: KakakBeat | null;
  /** 36 px or larger: the deeper of her two shadows (mark D). */
  large?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-kakak-disc text-kakak",
        large ? "shadow-kakak" : "shadow-kakak-sm",
        className
      )}
    >
      <svg viewBox={KAKAK_VIEWBOX} className="size-[66%]" fill="none">
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
