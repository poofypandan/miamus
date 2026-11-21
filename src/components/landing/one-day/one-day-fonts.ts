import { Fraunces } from "next/font/google";

/**
 * Fraunces italic, for the one word in each headline and her sentence
 * (01-concept.md: "Plus Jakarta Sans as now, plus Fraunces italic only, one
 * weight"). next/font downloads it at build time and serves it from Miamus's
 * own domain, so a visitor's browser never asks Google for it. Only the One
 * day page imports this module, so only that page preloads it.
 *
 * Plus Jakarta Sans comes from the root layout (--font-sans), as on every
 * other page.
 */
export const fontSerif = Fraunces({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["500"],
  display: "swap",
  variable: "--font-serif",
});
