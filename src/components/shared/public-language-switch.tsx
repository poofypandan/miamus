"use client";

import { SegmentedControl } from "@/components/ui/segmented-control";
import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * EN | ID in the top corner of a public screen (Phase 150), for anyone whose
 * phone language isn't the one they read. Pairs with usePublicLocale.
 */
export function PublicLanguageSwitch({
  locale,
  onChange,
}: {
  locale: OwnerLocale;
  onChange: (next: OwnerLocale) => void;
}) {
  return (
    <div className="absolute top-[calc(1rem+env(safe-area-inset-top))] right-6 w-28">
      <SegmentedControl
        ariaLabel="Language · Bahasa"
        value={locale}
        onChange={onChange}
        segments={[
          { value: "en", label: "EN" },
          { value: "id", label: "ID" },
        ]}
      />
    </div>
  );
}
