"use client";

import { useEffect, useState } from "react";
import { KakakAvatar } from "@/components/kakak/kakak-avatar";
import { useT } from "@/context/owner-locale-context";

/**
 * While Kakak reads (plan, screen 3): her bubble with three soft dots, a
 * line that moves on as the seconds pass so a longer wait never looks
 * stuck, and the outline of the card she is about to show. Typically 2–6
 * seconds; the last line only shows past 12.
 */
export function KakakThinking() {
  const t = useT();
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - started), 500);
    return () => window.clearInterval(timer);
  }, []);

  const line =
    elapsed < 2500
      ? t("One moment…", "Sebentar…")
      : elapsed < 6000
        ? t("Checking it against your household…", "Kakak mencocokkan dengan data rumah Anda…")
        : elapsed < 12000
          ? t("Putting it together…", "Kakak sedang menyiapkan…")
          : t("Taking a little longer than usual…", "Sedikit lebih lama dari biasanya…");

  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <div className="flex items-start gap-2">
        <KakakAvatar className="size-7" />
        <div className="flex items-center gap-2 rounded-2xl rounded-tl-md border bg-card px-3 py-2 text-sm text-muted-foreground">
          <span className="flex gap-1" aria-hidden="true">
            {[0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="size-1.5 rounded-full bg-slate-400 motion-safe:animate-bounce"
                style={{ animationDelay: `${dot * 150}ms` }}
              />
            ))}
          </span>
          {line}
        </div>
      </div>
      {/* The card's outline, so the answer lands where the eye already is. */}
      <div aria-hidden="true" className="ml-9 flex flex-col gap-2 rounded-xl border border-dashed px-4 py-3 motion-safe:animate-pulse">
        <span className="h-2.5 w-16 rounded-full bg-muted" />
        <span className="h-3 w-3/4 rounded-full bg-muted" />
        <span className="h-3 w-1/2 rounded-full bg-muted" />
      </div>
    </div>
  );
}
