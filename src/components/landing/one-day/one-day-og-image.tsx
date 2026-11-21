import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND_INK, M_POINTS, ROOF_POINTS, TILE_RADIUS } from "@/components/brand/brand-mark";
import type { OwnerLocale } from "@/lib/owner-locale";
import { ONE_DAY_COPY } from "./one-day-copy";

/**
 * The link preview (1200 × 630) for the One day page: the morning sky, the
 * mark, the headline with its one italic word, "Miamus". No app picture
 * (Fable's visual gate, should 4).
 *
 * Static: drawn once at build time, so the fonts are read from node_modules
 * (@fontsource, devDependencies) there and never fetched from anywhere.
 */
export const OG_SIZE = { width: 1200, height: 630 };

async function font(path: string) {
  return readFile(join(process.cwd(), "node_modules", path));
}

/**
 * "A day at home, without the " -> ["A day at home,", "without the"]: the
 * headline's first row ends at its comma; the rest leads into the italic word.
 */
export function splitAtComma(before: string): [string, string] {
  const i = before.indexOf(",");
  if (i < 0) return [before.trim(), ""];
  return [before.slice(0, i + 1).trim(), before.slice(i + 1).trim()];
}

export async function oneDayOgImage(locale: OwnerLocale) {
  const [before, word, after] = ONE_DAY_COPY[locale].hero.headline;
  const [first, rest] = splitAtComma(before);
  const [sans, serif] = await Promise.all([
    font("@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-600-normal.woff"),
    font("@fontsource/fraunces/files/fraunces-latin-500-italic.woff"),
  ]);
  const tile = 96;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "linear-gradient(180deg, #bfc6e6 0%, #d9cfe0 55%, #efd3d2 100%)",
          color: "#1f1a17",
          fontFamily: "Jakarta",
        }}
      >
        <div
          style={{
            width: tile,
            height: tile,
            display: "flex",
            borderRadius: tile * TILE_RADIUS,
            background: BRAND_INK,
          }}
        >
          <svg width={tile} height={tile} viewBox="0 0 512 512">
            <g fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round">
              <polyline points={ROOF_POINTS} />
              <polyline points={M_POINTS} />
            </g>
          </svg>
        </div>
        {/* Two rows, broken by hand at the comma: the renderer treats the
            italic word as its own block, so it can't balance the lines. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 44,
            fontSize: 84,
            lineHeight: 1.06,
            letterSpacing: "-0.04em",
          }}
        >
          <span>{first}</span>
          <div style={{ display: "flex" }}>
            {rest && <span style={{ marginRight: 22 }}>{rest}</span>}
            <span style={{ fontFamily: "Fraunces", fontStyle: "italic", letterSpacing: "-0.01em" }}>{word}</span>
            <span style={{ marginLeft: -6 }}>{after}</span>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 36, fontSize: 32, color: "#3f3733" }}>Miamus</div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts: [
        { name: "Jakarta", data: sans, weight: 600, style: "normal" },
        { name: "Fraunces", data: serif, weight: 500, style: "italic" },
      ],
    }
  );
}
