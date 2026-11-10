import { landingOgImage, OG_SIZE } from "@/components/landing/landing-og-image";

export const alt = "Miamus";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return landingOgImage("en");
}
