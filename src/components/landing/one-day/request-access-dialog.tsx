"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { OwnerLocale } from "@/lib/owner-locale";
import { LandingGoogleButton } from "../landing-actions";
import type { OneDayCopy } from "./one-day-copy";
import s from "./one-day.module.css";

/**
 * The first step of Request access, as a native dialog (focus is held inside
 * and Escape closes it): who is asking (Google), and what the request
 * shares. The Google button is the landing page's own, so the language is
 * remembered for the sign-in screen and onboarding as before.
 */
export function RequestAccessDialog({
  locale,
  copy,
  privacyHref,
  onClose,
}: {
  locale: OwnerLocale;
  copy: OneDayCopy["dialog"];
  privacyHref: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const closed = () => onClose();
    dialog.addEventListener("close", closed);
    return () => dialog.removeEventListener("close", closed);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby="request-access-title"
      lang={locale}
      onClick={(event) => {
        // A tap on the dimmed backdrop closes it.
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <div className={s.dialogIn}>
        <div className={s.dialogTop}>
          <span>Miamus</span>
          <button type="button" className={s.dialogClose} aria-label={copy.close} onClick={() => ref.current?.close()}>
            <X aria-hidden className="size-5" strokeWidth={1.75} />
          </button>
        </div>
        <h2 id="request-access-title" className={s.dialogH}>
          {copy.title}
        </h2>
        <p className={s.dialogBody}>{copy.body}</p>
        <div className={s.dialogGoogle}>
          <LandingGoogleButton locale={locale} label={copy.google} failedText={copy.failed} google />
        </div>
        <p className={s.dialogFine}>
          {copy.consentBefore}
          <Link href={privacyHref}>{copy.privacy}</Link>
          {copy.consentAfter}
        </p>
        <p className={s.dialogFine}>{copy.noGoogle}</p>
        <p className={s.dialogFine}>{copy.joining}</p>
      </div>
    </dialog>
  );
}
