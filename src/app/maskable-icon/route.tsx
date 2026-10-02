import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/brand/brand-mark";

// Rendered once at build time; it only changes when the logo does.
export const dynamic = "force-static";

/**
 * The manifest's maskable icon (Phase 107). Full-bleed, with the glyph pulled
 * in to 80% so it survives Android cropping the tile to a circle or squircle.
 * A plain route rather than an icon.tsx variant so it is never linked into
 * <head> as a favicon.
 */
export function GET() {
  return new ImageResponse(<BrandMark size={512} rounded={false} scale={0.8} />, {
    width: 512,
    height: 512,
  });
}
