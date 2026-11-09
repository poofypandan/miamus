import { ImageResponse } from "next/og";
import { BRAND_INK, M_POINTS, ROOF_POINTS } from "@/components/brand/brand-mark";
import type { OwnerLocale } from "@/lib/owner-locale";
import { LANDING_COPY } from "./landing-copy";

/**
 * The link preview (1200 × 630) for one language of the landing page: the
 * mark, the headline, the brand line. Drawn with next/og like app/icon.tsx.
 */
export const OG_SIZE = { width: 1200, height: 630 };

export function landingOgImage(locale: OwnerLocale) {
  const t = LANDING_COPY[locale];
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
          background: "#ffffff",
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 25,
            background: BRAND_INK,
            display: "flex",
            position: "relative",
          }}
        >
          {[ROOF_POINTS, M_POINTS].map((points) => (
            <svg
              key={points}
              width={112}
              height={112}
              viewBox="0 0 512 512"
              fill="none"
              style={{ position: "absolute", top: 0, left: 0 }}
            >
              <polyline
                points={points}
                stroke="#ffffff"
                strokeWidth={40}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ))}
        </div>
        <div style={{ marginTop: 48, fontSize: 64, fontWeight: 600, lineHeight: 1.12, color: "#111827", letterSpacing: -1.5 }}>
          {t.hero.headline}
        </div>
        <div style={{ marginTop: 24, fontSize: 32, color: "#6b7280" }}>
          {`Miamus · ${t.hero.brandLine}`}
        </div>
      </div>
    ),
    OG_SIZE
  );
}
