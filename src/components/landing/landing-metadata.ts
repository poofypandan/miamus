import type { Metadata } from "next";
import type { OwnerLocale } from "@/lib/owner-locale";
import { LANDING_COPY, LANDING_HREF } from "./landing-copy";

/**
 * Title, description, language alternates and the link preview for one
 * language of the landing page. The preview image is the route's own
 * opengraph-image.tsx, which Next links by itself.
 */
export function landingMetadata(locale: OwnerLocale): Metadata {
  const t = LANDING_COPY[locale];
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    alternates: {
      canonical: LANDING_HREF[locale],
      languages: { en: LANDING_HREF.en, id: LANDING_HREF.id, "x-default": LANDING_HREF.en },
    },
    openGraph: {
      type: "website",
      siteName: "Miamus",
      title: t.metaTitle,
      description: t.metaDescription,
      url: LANDING_HREF[locale],
      locale: locale === "id" ? "id_ID" : "en_US",
      alternateLocale: locale === "id" ? ["en_US"] : ["id_ID"],
    },
    twitter: { card: "summary_large_image", title: t.metaTitle, description: t.metaDescription },
  };
}
