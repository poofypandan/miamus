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
  /** The smallest text left inside the crop, CSS px, and where it comes from (null: no text in the crop). */
  minText: number | null;
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
  /* C1.6 (trailer-reset 20, fixes 3, 4, 6, 7): whole controls only, no red, no dates or photo time stamps. */
  /** Kakak's sheet, listening: the stop button and its grey ring alone, no text (kakak-voice.tsx). */
  stop: { src: "en/k0-listen-full.png", rect: { x: 147, y: 156, w: 96, h: 92 }, minText: null, minTextFrom: "no text" },
  /** Kakak's card: "CHORE" and its first two rows, What and Who (no When row, so no date). */
  cardTop: { src: "en/k0-card.png", rect: { x: 26, y: 284, w: 260, h: 74 }, minText: 12, minTextFrom: '"CHORE" and the row labels, text-xs' },
  /** Kakak's card: the whole "Looks right" button (kakak-sheet.tsx). */
  looksRightWhole: { src: "en/k0-card.png", rect: { x: 14, y: 770, w: 362, h: 51 }, minText: 16, minTextFrom: '"Looks right", text-base', press: { x: 17, y: 772.5, w: 356, h: 45.5, r: 10 } },
  /** The app's "Saved" toast after "Looks right": its tick and line; the Undo button is left out of the shot whole. */
  savedLine: { src: "en/k0-saved.png", rect: { x: 22, y: 712, w: 228, h: 46 }, minText: 13, minTextFrom: "sonner toast title, 13px" },
  /** Sari's task sheet: the whole "Ambil Foto Sebelum" button, nothing else (finish-chore-sheet.tsx, PhotoPicker). */
  photoBefore: { src: "staff/sheet.png", rect: { x: 27, y: 444, w: 336, h: 57 }, minText: 14, minTextFrom: '"Ambil Foto Sebelum", Button text-sm', press: { x: 29.5, y: 446.6, w: 331, h: 51.5, r: 10 } },
  /** Staff: the "Pel teras" selesai toast's tick and line only (the toast's empty right half left out). */
  sariSelesai: { src: "staff/done.png", rect: { x: 22, y: 779, w: 168, h: 46 }, minText: 13, minTextFrom: "sonner toast title, 13px" },
  /** Today: the status card inside its own border; the bubble takes the card's tint, so there is no box in a box. */
  statusIn: { src: "en/status.png", rect: { x: 21.5, y: 174, w: 239, h: 68 }, minText: 13, minTextFrom: '"33 of 41 done · nothing late", text-[13px]' },
  /** Kakak's sheet, idle: the mic and "Tap and talk", trimmed above the next control's edge. */
  micIn: { src: "en/k0-open.png", rect: { x: 110, y: 155, w: 170, h: 124 }, minText: 14, minTextFrom: '"Tap and talk", text-sm', press: { x: 159, y: 166, w: 72, h: 72, r: 36 } },
  /* A3 (after #152 and #153, main 23f6060): the app's new cards, captured whole controls only, never Kakak's avatar. */
  /**
   * Kakak's short card (#152): the What, Who and When rows, inside the card's own border. "CHORE" (text-xs, 12 px)
   * is left out: at Fable's one scale, 2.72×, it would be 32.6 px, under the floor; the border would be a box in a box.
   */
  cardRows2: { src: "en/k0-card.png", rect: { x: 19, y: 502, w: 353, h: 120 }, minText: 14, minTextFrom: '"What", "Who", "When", text-sm' },
  /** Kakak's short card: the whole "Looks right" button under it (#152). */
  looksBtn: { src: "en/k0-card.png", rect: { x: 14, y: 642, w: 362, h: 52 }, minText: 16, minTextFrom: '"Looks right", text-base', press: { x: 17, y: 645, w: 356, h: 46, r: 12 } },
  /** Sari's task card on her list (#153): "Pel teras", "09.00" and the Sebelum place whole (Sesudah left out whole). */
  sariCard: { src: "staff/list.png", rect: { x: 22, y: 295, w: 172, h: 197 }, minText: 12, minTextFrom: '"Ketuk untuk foto", text-xs', press: { x: 29, y: 364.5, w: 162, h: 121.5, r: 12 } },
  /** Sari's task card with both photos in: its whole "Selesai" button (#153), not the photos (they carry time stamps). */
  selesai: { src: "staff/card-after.png", rect: { x: 27, y: 490, w: 336, h: 54 }, minText: 16, minTextFrom: '"Selesai", Button text-base', press: { x: 29, y: 494, w: 332, h: 48, r: 12 } },
} satisfies Record<string, Crop>;
export type CropId = keyof typeof CROPS;

/** One crop drawn at a scale, with its readability tag (no tag when the crop has no text). */
export function CropImg({ id, scale, x = 0, y = 0, radius = 0 }: { id: CropId; scale: number; x?: number; y?: number; radius?: number }) {
  const c: Crop = CROPS[id];
  return (
    <div
      {...(c.minText != null ? { "data-raster-text": c.minText * scale, "data-raster-what": `${id}: ${c.minTextFrom}` } : {})}
      style={{ position: "absolute", left: x, top: y, width: c.rect.w * scale, height: c.rect.h * scale, overflow: "hidden", borderRadius: radius }}
    >
      <Img src={staticFile(`shots/${c.src}`)} style={{ position: "absolute", left: -c.rect.x * scale, top: -c.rect.y * scale, width: 390 * scale, height: 844 * scale, maxWidth: "none" }} />
    </div>
  );
}

/** One component in a warm-white bubble from a phone. x, y: the bubble's top-left on the frame. */
export function AppBubble({ id, x, y, scale, to, pressed = false, pad = 18, r = 52, inner = 34, fill = PAPER }: { id: CropId; x: number; y: number; scale: number; to?: { x: number; y: number }; pressed?: boolean; pad?: number; r?: number; inner?: number; fill?: string }) {
  const c: Crop = CROPS[id];
  const w = c.rect.w * scale + pad * 2;
  const h = c.rect.h * scale + pad * 2;
  const p = c.press;
  return (
    <>
      <Bubble x={x} y={y} w={w} h={h} r={r} fill={fill} to={to} tailW={40} label={`app: ${id}`}>
        <CropImg id={id} scale={scale} x={pad} y={pad} radius={inner} />
      </Bubble>
      {pressed && p && (
        <div style={{ position: "absolute", left: x + pad, top: y + pad, width: c.rect.w * scale, height: c.rect.h * scale, overflow: "visible" }}>
          <PressRing x={(p.x - c.rect.x) * scale} y={(p.y - c.rect.y) * scale} w={p.w * scale} h={p.h * scale} r={p.r * scale} />
        </div>
      )}
    </>
  );
}

/**
 * Several crops of one component in one bubble, stacked and centred (trailer-reset 20, fix 4: the card and its
 * button stay in one bubble). `gap` is the space between them; each part keeps its own scale and check.
 */
export function AppStack({ parts, x, y, w, to, pad = 22, gap = 30 }: { parts: { id: CropId; scale: number; pressed?: boolean }[]; x: number; y: number; w: number; to?: { x: number; y: number }; pad?: number; gap?: number }) {
  let top = pad;
  const placed = parts.map((pt) => {
    const c: Crop = CROPS[pt.id];
    const pw = c.rect.w * pt.scale;
    const ph = c.rect.h * pt.scale;
    const at = { ...pt, c, x: (w - pw) / 2, y: top, pw, ph };
    top += ph + gap;
    return at;
  });
  const h = top - gap + pad;
  return (
    <>
      <Bubble x={x} y={y} w={w} h={h} r={52} fill={PAPER} to={to} tailW={40} label={`app: ${parts.map((p) => p.id).join("+")}`}>
        {placed.map((pt) => (
          <CropImg key={pt.id} id={pt.id} scale={pt.scale} x={pt.x} y={pt.y} radius={20} />
        ))}
      </Bubble>
      {placed.map((pt) =>
        pt.pressed && pt.c.press ? (
          <div key={`p-${pt.id}`} style={{ position: "absolute", left: x + pt.x, top: y + pt.y, width: pt.pw, height: pt.ph }}>
            <PressRing x={(pt.c.press.x - pt.c.rect.x) * pt.scale} y={(pt.c.press.y - pt.c.rect.y) * pt.scale} w={pt.c.press.w * pt.scale} h={pt.c.press.h * pt.scale} r={pt.c.press.r * pt.scale} />
          </div>
        ) : null
      )}
    </>
  );
}
