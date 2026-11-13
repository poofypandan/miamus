import { continueRender, delayRender, staticFile } from "remotion";

/** The frame: 1080 × 1920 at 30 fps (9:16 for Reels, TikTok and Shorts). */
export const W = 1080;
export const H = 1920;
export const FPS = 30;

/**
 * Where words may sit. The platforms draw their own buttons and captions
 * over the top, the right edge and the bottom third (Meta asks ads to keep
 * the top 14% and the bottom 35% clear of text; TikTok and Shorts are close),
 * so everything that must be read stays inside `SAFE`, and captions sit in
 * its lowest band. Pictures run edge to edge.
 */
export const SAFE = { top: 270, bottom: 1290, left: 64, right: 916 };
/** The middle of the safe area: phones, captions and titles centre here. */
export const CX = 490;
/** Captions: their bottom edge. */
export const CAPTION_BOTTOM = 1282;

/** The app's own palette (src/app/globals.css) and Kakak's one warm colour. */
export const C = {
  ink: "#171717",
  inkSoft: "#525252",
  inkMute: "#737373",
  paper: "#ffffff",
  cream: "#fff6e8",
  border: "rgba(23,23,23,0.08)",
  green: "#16a34a",
  greenSoft: "#ecfdf3",
  kakak: "#b65f55",
  kakakTint: "#fbf1ee",
  kakakLine: "#f1ddd7",
};

/** The app's typeface; a child's hand; a soft italic for the one word that matters. */
export const FONT = '"Plus Jakarta Sans", system-ui, sans-serif';
export const HAND = '"Mali", "Plus Jakarta Sans", sans-serif';
export const SERIF = '"Fraunces", Georgia, serif';

const FACES: [string, string, string, string][] = [
  ["Plus Jakarta Sans", "400", "normal", "plus-jakarta-sans-latin-400-normal"],
  ["Plus Jakarta Sans", "500", "normal", "plus-jakarta-sans-latin-500-normal"],
  ["Plus Jakarta Sans", "600", "normal", "plus-jakarta-sans-latin-600-normal"],
  ["Plus Jakarta Sans", "700", "normal", "plus-jakarta-sans-latin-700-normal"],
  ["Mali", "500", "normal", "mali-latin-500-normal"],
  ["Mali", "600", "normal", "mali-latin-600-normal"],
  ["Mali", "700", "normal", "mali-latin-700-normal"],
  ["Fraunces", "400", "italic", "fraunces-latin-400-italic"],
  ["Fraunces", "500", "italic", "fraunces-latin-500-italic"],
  ["Fraunces", "600", "italic", "fraunces-latin-600-italic"],
];

/** Fonts from public/fonts, all under the SIL Open Font License (licences beside them). */
let fontsLoaded = false;
export function loadFonts() {
  if (fontsLoaded || typeof document === "undefined") return;
  fontsLoaded = true;
  const handle = delayRender("fonts");
  Promise.all(
    FACES.map(([family, weight, style, file]) => {
      const face = new FontFace(family, `url(${staticFile(`fonts/${file}.woff2`)}) format("woff2")`, { weight, style });
      return face.load().then((f) => (document.fonts as unknown as { add(face: FontFace): void }).add(f));
    })
  )
    .then(() => continueRender(handle))
    .catch((err) => {
      console.error(err);
      continueRender(handle);
    });
}
