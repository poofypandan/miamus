import type { MetadataRoute } from "next";

/**
 * The PWA manifest (Phase 107; was public/manifest.json). A route rather than
 * a static file so the icon list points at the sizes app/icon.tsx generates —
 * there is no PNG on disk to keep in step with the logo any more.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Miamus - Household Management",
    short_name: "Miamus",
    description: "Household management for owners and their staff",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches viewport.themeColor in layout.tsx and the page background.
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/maskable-icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
