/**
 * The Miamus mark (Phase 107): a geometric "M" under a pitched roofline.
 *
 * Replaces the paw print, which said "pet app" about a product that now runs
 * a whole household. The roof is a single chevron; the M beneath it is the
 * house's two walls with the letter's V between them, so the mark reads as a
 * letter first and a building second.
 *
 * Written for next/og's ImageResponse (satori), which is why every container
 * is an explicit flex box and the drawing is plain inline SVG — satori has no
 * CSS layout beyond flexbox and renders no external assets. Used by
 * app/icon.tsx and app/apple-icon.tsx, which generate every PNG size the PWA
 * needs from this one drawing.
 */

export const BRAND_INK = "#171717";
export const BRAND_PAPER = "#ffffff";

export function BrandMark({
  size,
  rounded,
  scale = 1,
}: {
  /** Output edge in pixels. */
  size: number;
  /**
   * Round the tile's corners. On for favicons and "any" icons, which are
   * shown as drawn; off where the OS applies its own mask (Apple touch icon,
   * maskable), since a pre-rounded tile would show a ring of corner inside it.
   */
  rounded: boolean;
  /**
   * Shrinks the glyph inside a full tile. Maskable icons pass 0.8 so the mark
   * stays inside the circular safe zone Android may crop to.
   */
  scale?: number;
}) {
  const glyph = Math.round(size * scale);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_INK,
        borderRadius: rounded ? size * 0.1875 : 0,
      }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 512 512" fill="none">
        {/* Roofline */}
        <polyline
          points="112,214 256,104 400,214"
          stroke={BRAND_PAPER}
          strokeWidth={40}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* The M: two walls, and the letter's V meeting between them */}
        <polyline
          points="152,400 152,262 256,354 360,262 360,400"
          stroke={BRAND_PAPER}
          strokeWidth={40}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
