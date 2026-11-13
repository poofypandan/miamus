/**
 * Neutral "photos" for the demo household: drawn here, not photographed and
 * not stock. Soft illustrations of clean rooms, a clean terrace and a
 * dripping tap, with no faces, no house number and nothing from a real home.
 * Served in place of /api/photo (the app's photo proxy) during the capture.
 */
import type { Page } from "@playwright/test";
import sharp from "sharp";

const W = 1080;
const H = 810;

function tiles(color: string, line: string, horizon: number) {
  // A floor of square tiles in one-point perspective.
  const cx = W / 2;
  const parts: string[] = [];
  for (let i = -12; i <= 12; i++) {
    const xb = cx + i * 150;
    parts.push(`<line x1="${cx + i * 18}" y1="${horizon}" x2="${xb}" y2="${H}" stroke="${line}" stroke-width="3"/>`);
  }
  let y = horizon;
  let step = 10;
  while (y < H) {
    y += step;
    step *= 1.32;
    parts.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${W}" y2="${y.toFixed(1)}" stroke="${line}" stroke-width="3"/>`);
  }
  return `<rect x="0" y="${horizon}" width="${W}" height="${H - horizon}" fill="${color}"/>${parts.join("")}`;
}

function plant(x: number, y: number, s = 1) {
  return `<g transform="translate(${x},${y}) scale(${s})">
    <path d="M-60,0 L60,0 L45,120 L-45,120 Z" fill="#c8b8a6"/>
    <path d="M0,0 C-10,-80 -90,-120 -110,-170 C-50,-150 -15,-90 0,0 Z" fill="#6f8f6a"/>
    <path d="M0,0 C10,-90 70,-150 120,-180 C90,-120 30,-70 0,0 Z" fill="#7f9e78"/>
    <path d="M0,0 C-5,-100 10,-170 20,-230 C40,-160 25,-80 0,0 Z" fill="#5f7f5b"/>
  </g>`;
}

const SCENES: Record<string, string> = {
  terrace: `
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef3f6"/><stop offset="1" stop-color="#f7f4ee"/></linearGradient>
    <linearGradient id="light" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <rect x="0" y="0" width="${W}" height="380" fill="#efe9df"/>
    <rect x="80" y="60" width="300" height="260" rx="6" fill="#dfe8ec"/><rect x="80" y="60" width="300" height="260" rx="6" fill="none" stroke="#cfc6b8" stroke-width="10"/>
    <line x1="230" y1="60" x2="230" y2="320" stroke="#cfc6b8" stroke-width="8"/>
    <rect x="700" y="40" width="190" height="340" rx="6" fill="#d8cdbd"/><circle cx="865" cy="215" r="8" fill="#a8998a"/>
    ${tiles("#e6dccd", "#d5c9b7", 380)}
    <rect x="0" y="380" width="${W}" height="${H - 380}" fill="url(#light)"/>
    ${plant(560, 470, 1.15)}${plant(980, 520, 0.9)}`,
  "terrace-before": "",
  "room-1": `
    <rect width="${W}" height="${H}" fill="#f2eee8"/>
    <rect x="90" y="90" width="360" height="300" rx="8" fill="#e3eaee"/>
    ${tiles("#e9e2d8", "#ddd3c6", 470)}
    <rect x="520" y="300" width="460" height="200" rx="40" fill="#cfd6cf"/><rect x="540" y="250" width="420" height="110" rx="40" fill="#dbe1da"/>
    ${plant(200, 520, 0.9)}`,
  "room-2": `
    <rect width="${W}" height="${H}" fill="#f4f1ec"/>
    <rect x="620" y="80" width="340" height="320" rx="8" fill="#e5ecef"/>
    ${tiles("#ebe5dc", "#ded6ca", 480)}
    <rect x="90" y="330" width="520" height="190" rx="18" fill="#ffffff"/><rect x="90" y="300" width="520" height="60" rx="18" fill="#e7e2da"/>
    <rect x="120" y="250" width="150" height="80" rx="26" fill="#d9e0e4"/>`,
  "room-3": `
    <rect width="${W}" height="${H}" fill="#eef1ef"/>
    <rect x="0" y="0" width="${W}" height="420" fill="#f3f1ec"/>
    <rect x="120" y="160" width="840" height="260" rx="10" fill="#e4dfd6"/>
    <rect x="160" y="200" width="240" height="40" rx="8" fill="#d2ccc2"/><rect x="440" y="200" width="240" height="40" rx="8" fill="#d2ccc2"/>
    ${tiles("#e8e4dc", "#dbd5ca", 460)}
    ${plant(900, 520, 0.8)}`,
  "room-4": `
    <rect width="${W}" height="${H}" fill="#f5f2ed"/>
    <rect x="380" y="70" width="320" height="300" rx="8" fill="#e2e9ed"/>
    ${tiles("#ece6dd", "#e0d8cc", 440)}
    <rect x="120" y="420" width="840" height="260" rx="24" fill="#d7dccf" opacity=".5"/>`,
  bowl: `
    <rect width="${W}" height="${H}" fill="#f1ede6"/>
    ${tiles("#e7e0d5", "#dad1c4", 300)}
    <ellipse cx="540" cy="560" rx="300" ry="80" fill="#cfc4b4" opacity=".6"/>
    <path d="M260,430 L820,430 L760,560 Q540,600 320,560 Z" fill="#8fa3b0"/>
    <ellipse cx="540" cy="430" rx="280" ry="70" fill="#a9bac4"/>
    <ellipse cx="540" cy="432" rx="230" ry="52" fill="#b98f5e"/>
    ${[[470, 420], [520, 405], [580, 425], [620, 412], [500, 445], [560, 450], [440, 438], [650, 440]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="14" fill="#9c7447"/>`).join("")}`,
  "repair-tap": `
    <rect width="${W}" height="${H}" fill="#eef1f2"/>
    <rect x="0" y="520" width="${W}" height="290" fill="#e2e6e8"/>
    <ellipse cx="540" cy="620" rx="330" ry="90" fill="#ffffff"/><ellipse cx="540" cy="625" rx="270" ry="62" fill="#e9eef0"/>
    <rect x="500" y="250" width="80" height="220" rx="20" fill="#b9c1c6"/>
    <path d="M500,270 L380,270 Q350,270 350,300 L350,360 L400,360 L400,320 L500,320 Z" fill="#c9d0d4"/>
    <rect x="560" y="210" width="120" height="40" rx="16" fill="#aeb6bb"/>
    <path d="M375,385 Q360,410 375,425 Q390,410 375,385 Z" fill="#9cc3d6"/>
    <path d="M375,450 Q362,472 375,485 Q388,472 375,450 Z" fill="#9cc3d6" opacity=".8"/>`,
};

// The same terrace before it was mopped: a few fallen leaves and a dull floor.
SCENES["terrace-before"] = SCENES.terrace.replace("url(#light)", "#d9cdbb").concat(
  [[180, 560, 20], [330, 690, -35], [620, 610, 60], [760, 720, 10], [880, 600, -60], [430, 520, 80], [240, 760, 40]]
    .map(([x, y, r]) => `<ellipse cx="${x}" cy="${y}" rx="26" ry="11" transform="rotate(${r} ${x} ${y})" fill="#b59a6a" opacity=".85"/>`)
    .join("")
);

const cache = new Map<string, Buffer>();
export async function photo(name: string): Promise<Buffer> {
  const key = SCENES[name] ? name : "room-1";
  if (!cache.has(key)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${SCENES[key]}</svg>`;
    cache.set(key, await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer());
  }
  return cache.get(key)!;
}

/** Answer the app's photo proxy with the drawings above, by file name. */
export async function servePhotos(page: Page) {
  await page.route("**/api/photo?**", async (route) => {
    const p = new URL(route.request().url()).searchParams.get("p") ?? "";
    const name = p.split("/").pop()?.replace(/\.\w+$/, "") ?? "";
    route.fulfill({ status: 200, contentType: "image/jpeg", body: await photo(name) });
  });
}
