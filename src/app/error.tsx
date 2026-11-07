"use client";

import { useEffect } from "react";
import { ErrorScreen } from "@/components/shared/error-screen";

/** A screen that crashes shows this, in the viewer's language (Phase 157). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorScreen reset={reset} />;
}
