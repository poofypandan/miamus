/**
 * The app in the film: one real captured component per bubble, cropped from the app's own screens
 * (capture/, the e2e stub and the demo household, 390 × 844 CSS px at 3×), shown at 3.2 to 3.6× with a tail
 * to the phone that shows it (trailer-reset 11, section 4). Nothing is redrawn: the pixels are the app's.
 *
 * Each crop names the smallest text inside it, in the app's own CSS px (from the component's Tailwind
 * classes). The readability check multiplies that by the bubble's scale and fails the build under 38 px.
 */
import React from "react";
import { Img, staticFile } from "remotion";
import { Bubble, PAPER, PressRing } from "./kit";

type Rect = { x: number; y: number; w: number; h: number };
export interface Crop {
  /** Under public/shots/. */
  src: string;
  /** In CSS px of the 390 × 844 screen. */
  rect: Rect;
  /** The smallest text left inside the crop, CSS px, and where it comes from. */
  minText: number;
  minTextFrom: string;
  /** A control that is pressed in this shot, CSS px of the screen. */
  press?: Rect & { r: number };
}

export const CROPS = {
  /** Kakak's sheet, idle: the round mic button and "Tap and talk" (kakak-voice.tsx). */
  mic: { src: "en/k0-open.png", rect: { x: 110, y: 155, w: 170, h: 133 }, minText: 14, minTextFrom: '"Tap and talk", text-sm', press: { x: 159, y: 166, w: 72, h: 72, r: 36 } },
  /** Kakak's sheet, listening: the stop button and its one line (kakak-voice.tsx). */
  listening: { src: "en/k0-listen-full.png", rect: { x: 62, y: 152, w: 266, h: 128 }, minText: 14, minTextFrom: '"Listening… tap Stop when you\'re done", text-sm' },
  /** Kakak's card: the five summary rows (kakak-sheet.tsx). */
  cardRows: { src: "en/k0-card.png", rect: { x: 26, y: 284, w: 260, h: 144 }, minText: 12, minTextFrom: '"CHORE" and the row labels, text-xs' },
  /** Kakak's card: the "Looks right" button, pressed (kakak-sheet.tsx). */
  looksRight: { src: "en/k0-card.png", rect: { x: 64, y: 766, w: 262, h: 58 }, minText: 16, minTextFrom: '"Looks right", text-base', press: { x: 64, y: 772, w: 262, h: 46, r: 10 } },
  /** Today: the status card (today-status.tsx). */
  status: { src: "en/status.png", rect: { x: 17, y: 170, w: 248, h: 76 }, minText: 13, minTextFrom: '"33 of 41 done · nothing late", text-[13px]' },
  /** Staff, Sari's task sheet: its title and the first photo step with its button, pressed (finish-chore-sheet.tsx). */
  sariBefore: { src: "staff/sheet.png", rect: { x: 10, y: 286, w: 284, h: 218 }, minText: 13, minTextFrom: "step hint, text-[13px]", press: { x: 30, y: 447, w: 252, h: 50, r: 10 } },
  /** Staff, Sari's task sheet with both photos: the after photo and "Selesaikan", pressed. */
  sariDone: { src: "staff/photo-after.png", rect: { x: 14, y: 500, w: 258, h: 260 }, minText: 13, minTextFrom: '"Diambil 09.24", text-[13px]', press: { x: 17, y: 705, w: 255, h: 50, r: 10 } },
  /** Staff, Sari's task sheet: the title block only (finish-chore-sheet.tsx). */
  sariTitle: { src: "staff/sheet.png", rect: { x: 10, y: 286, w: 190, h: 52 }, minText: 14, minTextFrom: '"Bersih-bersih · 09.00", sheet description, text-sm' },
  /** Staff, the toast after Selesaikan. */
  sariToast: { src: "staff/done.png", rect: { x: 17, y: 778, w: 233, h: 47 }, minText: 13, minTextFrom: "toast, 13px" },
} satisfies Record<string, Crop>;
export type CropId = keyof typeof CROPS;

/** One component in a warm-white bubble from a phone. x, y: the bubble's top-left on the frame. */
export function AppBubble({ id, x, y, scale, to, pressed = false, pad = 18 }: { id: CropId; x: number; y: number; scale: number; to?: { x: number; y: number }; pressed?: boolean; pad?: number }) {
  const c: Crop = CROPS[id];
  const w = c.rect.w * scale + pad * 2;
  const h = c.rect.h * scale + pad * 2;
  const p = c.press;
  return (
    <>
      <Bubble x={x} y={y} w={w} h={h} r={52} fill={PAPER} to={to} tailW={40}>
        <div data-raster-text={c.minText * scale} data-raster-what={`${id}: ${c.minTextFrom}`} style={{ position: "absolute", left: pad, top: pad, width: c.rect.w * scale, height: c.rect.h * scale, overflow: "hidden", borderRadius: 34 }}>
          <Img src={staticFile(`shots/${c.src}`)} style={{ position: "absolute", left: -c.rect.x * scale, top: -c.rect.y * scale, width: 390 * scale, height: 844 * scale, maxWidth: "none" }} />
        </div>
      </Bubble>
      {pressed && p && (
        <div style={{ position: "absolute", left: x + pad, top: y + pad, width: c.rect.w * scale, height: c.rect.h * scale, overflow: "visible" }}>
          <PressRing x={(p.x - c.rect.x) * scale} y={(p.y - c.rect.y) * scale} w={p.w * scale} h={p.h * scale} r={p.r * scale} />
        </div>
      )}
    </>
  );
}
