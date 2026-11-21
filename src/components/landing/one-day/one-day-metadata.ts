import type { Metadata } from "next";
import type { OwnerLocale } from "@/lib/owner-locale";
import { LANDING_HREF } from "../landing-copy";
import { ONE_DAY_COPY, ONE_DAY_PREVIEW_HREF } from "./one-day-copy";

/**
 * Title, description, language alternates and link preview for the One day
 * page. On the preview routes it is noindex, and canonical points at the live
 * page, so a preview never competes with /welcome in search.
 */
export function oneDayMetadata(locale: OwnerLocale, { preview }: { preview: boolean }): Metadata {
  const t = ONE_DAY_COPY[locale];
  const hrefs = preview ? ONE_DAY_PREVIEW_HREF : LANDING_HREF;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    robots: preview ? { index: false, follow: false } : undefined,
    alternates: {
      canonical: LANDING_HREF[locale],
      languages: { en: hrefs.en, id: hrefs.id, "x-default": hrefs.en },
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
