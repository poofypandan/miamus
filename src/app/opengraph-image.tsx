import { landingOgImage, OG_SIZE } from "@/components/landing/landing-og-image";

// The link preview's picture for the app itself ("/", and any page without
// its own): the Indonesian landing picture, as staff and most owners read
// Indonesian (owner, 2026-11-10). /welcome and /selamat-datang have their own.
export const alt = "Miamus";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return landingOgImage("id");
}
