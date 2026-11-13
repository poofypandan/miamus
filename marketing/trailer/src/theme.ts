import { continueRender, delayRender, staticFile } from "remotion";

/** The frame: 1080 × 1920 at 30 fps (storyboard: 9:16 for Shorts, Reels, TikTok). */
export const W = 1080;
export const H = 1920;
export const FPS = 30;

/**
 * Safe area (storyboard, "Captions and layout"): clear of the top 220 px,
 * the bottom 420 px and the right 160 px, where the platforms draw their
 * own buttons and captions. Everything that must be read sits inside it.
 */
export const SAFE = { top: 220, bottom: H - 420, left: 60, right: W - 160 };
/** The middle of the safe area, horizontally: phones and captions centre here. */
export const CX = 500;

/** The app's own palette (src/app/globals.css: neutral, one soft green for "all on track"). */
export const C = {
  ink: "#171717",
  inkSoft: "#525252",
  inkMute: "#737373",
  paper: "#ffffff",
  bg: "#f4f2ee",
  bgDeep: "#ebe7e0",
  evening: "#25272b",
  eveningDeep: "#1c1e21",
  border: "rgba(23,23,23,0.08)",
  green: "#16a34a",
  greenSoft: "#ecfdf3",
  amber: "#b45309",
  kakak: "#c0504d",
};

export const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';

/** The app's typeface (next/font Plus_Jakarta_Sans), from public/fonts (OFL). */
let fontsLoaded = false;
export function loadFonts() {
  if (fontsLoaded || typeof document === "undefined") return;
  fontsLoaded = true;
  const handle = delayRender("fonts");
  const weights = [400, 500, 600, 700];
  Promise.all(
    weights.map((weight) => {
      const face = new FontFace("Plus Jakarta Sans", `url(${staticFile(`fonts/plus-jakarta-sans-latin-${weight}-normal.woff2`)}) format("woff2")`, {
        weight: String(weight),
      });
      return face.load().then((f) => (document.fonts as unknown as { add(face: FontFace): void }).add(f));
    })
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
}
