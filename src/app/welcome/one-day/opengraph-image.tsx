import { OG_SIZE, oneDayOgImage } from "@/components/landing/one-day/one-day-og-image";

// The One day page's link preview (the morning sky, the mark, the headline).
export const alt = "Miamus";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return oneDayOgImage("en");
}
