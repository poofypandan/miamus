import type { MetadataRoute } from "next";
import { LAUNCH_BACKGROUND } from "@/components/brand/brand-mark";

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
    description: "Shared household management for everyone under one roof",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches viewport.themeColor in layout.tsx and the page background.
    // Also the colour Android paints its splash in when the installed app
    // opens, so the launch stage (LaunchStage, loading-screens.tsx) is this
    // same paper and the hand-over from the phone's splash to ours is
    // invisible (warm paper since 21 Nov, white before; LAUNCH_BACKGROUND).
    background_color: LAUNCH_BACKGROUND,
    theme_color: LAUNCH_BACKGROUND,
    icons: [
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      // Android builds the home-screen icon AND the launch splash from this
      // one: the splash is it cut to a 160dp circle. The app's first frame
      // redraws exactly that circle and settles from it (MiamusMark's
      // `opening`), so change this tile and that frame has to follow.
      { src: "/maskable-icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
