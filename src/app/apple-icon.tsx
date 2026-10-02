import { ImageResponse } from "next/og";
import { BrandMark } from "@/components/brand/brand-mark";

// iOS's home-screen size. Square-cornered on purpose: iOS applies its own
// rounding, and a pre-rounded tile would show dark corners inside it.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BrandMark size={180} rounded={false} />, size);
}
