"use client";

import type { ReactNode } from "react";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PinPad } from "@/components/auth/pin-pad";

/**
 * A whole staff PIN screen around the shared PinPad: the person's name, what
 * to do, the dots and keypad, an optional line (tries left, locked) and
 * Kembali (Phase 151). Used by the house-code sign-in. Staff-facing, so its
 * own words are Bahasa Indonesia. Ignoring keys while `busy` is the
 * caller's job: PinPad has no disabled state.
 */
export function StaffPinScreen({
  title,
  subtitle,
  pin,
  shake,
  busy = false,
  busyLabel = "Memeriksa…",
  notice,
  onDigit,
  onBackspace,
  onBack,
}: {
  title: string;
  subtitle: string;
  pin: string;
  shake: boolean;
  busy?: boolean;
  busyLabel?: string;
  /** A line under the keypad's dots, e.g. how many tries are left. */
  notice?: ReactNode;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onBack: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
      <div className="flex flex-col gap-1 text-center">
        <h1 className="text-2xl font-semibold text-gray-900">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <PinPad pin={pin} shake={shake} onDigit={onDigit} onBackspace={onBackspace} />

      {notice && <p className="text-center text-sm text-destructive">{notice}</p>}

      <Button variant="ghost" className="min-h-[48px]" onClick={onBack} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <ChevronLeft />}
        {busy ? busyLabel : "Kembali"}
      </Button>
    </div>
  );
}
