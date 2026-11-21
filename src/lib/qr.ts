import qrcode from "qrcode-generator";

/**
 * A QR code drawn on the phone (staff onboarding, step 3): the owner shows
 * it, the new staff member scans it with her camera. No outside service
 * ever sees the link, which carries the house and claim codes.
 *
 * One SVG path, one unit per module, with the quiet zone the standard asks
 * for (four modules) around it.
 */
export function qrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, "M");
  qr.addData(text, "Byte");
  qr.make();
  const count = qr.getModuleCount();
  const margin = 4;
  const parts: string[] = [];
  for (let row = 0; row < count; row += 1) {
    for (let col = 0; col < count; col += 1) {
      if (qr.isDark(row, col)) parts.push(`M${col + margin} ${row + margin}h1v1h-1z`);
    }
  }
  return { size: count + margin * 2, path: parts.join("") };
}
