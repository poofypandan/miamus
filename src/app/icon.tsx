import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/brand/brand-mark";

/**
 * Every favicon and PWA icon, generated from the one drawing in BrandMark
 * (Phase 107). Served at /icon/<id>; Next links the favicon sizes into <head>
 * itself, and app/manifest.ts lists the install sizes.
 */
const VARIANTS = {
  "32": { size: 32, rounded: true, scale: 1 },
  "192": { size: 192, rounded: true, scale: 1 },
  "512": { size: 512, rounded: true, scale: 1 },
} as const;
// The maskable icon is NOT a variant here: everything this file generates is
// linked into <head> as a favicon, and a square-cornered tile has no business
// in a browser tab. It lives at app/maskable-icon, reached only by the manifest.

type VariantId = keyof typeof VARIANTS;

export function generateImageMetadata() {
  return (Object.keys(VARIANTS) as VariantId[]).map((id) => ({
    id,
    size: { width: VARIANTS[id].size, height: VARIANTS[id].size },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }: { id: Promise<string> | string }) {
  const variant = VARIANTS[(await id) as VariantId] ?? VARIANTS["512"];
  return new ImageResponse(<BrandMark {...variant} />, {
    width: variant.size,
    height: variant.size,
  });
}
