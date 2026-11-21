"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { OwnerLocale } from "@/lib/owner-locale";
import type { OneDayCopy } from "./one-day-copy";

// The dialog (and the Supabase client inside its Google button) loads only
// when someone taps Request access, so it costs the first paint nothing.
const RequestAccessDialog = dynamic(() => import("./request-access-dialog").then((m) => m.RequestAccessDialog), {
  ssr: false,
});

/**
 * "Request access": opens the first step of the real flow (sign in with
 * Google, what the request shares). After Google the visitor lands on
 * /onboarding through the middleware, which asks the rest (PR #157 adds the
 * why question there). Nothing is collected on this page.
 */
export function RequestAccessButton({
  locale,
  label,
  className,
  dialog,
  privacyHref,
}: {
  locale: OwnerLocale;
  label: string;
  className?: string;
  dialog: OneDayCopy["dialog"];
  privacyHref: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} aria-haspopup="dialog">
        {label}
      </button>
      {open && (
        <RequestAccessDialog locale={locale} copy={dialog} privacyHref={privacyHref} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
