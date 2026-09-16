"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { useHousehold } from "@/context/household-context";
import { cn } from "@/lib/utils";

// The spin is held this long even when the fetch returns sooner. A refresh that
// finishes in 80ms would otherwise flick the icon and look like nothing
// happened — the point of the button is the reassurance.
const MIN_SPIN_MS = 900;

/**
 * Pulls the latest household data on demand.
 *
 * Calls the provider's own refresh rather than router.refresh(): every screen
 * here is a client component reading React state, so re-running server
 * components would spin the icon and change nothing.
 *
 * `label` carries the language of whichever view it sits in (Phase 46).
 */
export function SyncButton({
  label = "Sync data",
  errorMessage = "Couldn't sync — check the connection",
  className,
}: {
  label?: string;
  errorMessage?: string;
  className?: string;
}) {
  const { refresh } = useHousehold();
  const [spinning, setSpinning] = useState(false);
  // Ref as well as state: two quick taps land in the same tick, and the state
  // update hasn't applied yet on the second.
  const busy = useRef(false);

  async function sync() {
    if (busy.current) return;
    busy.current = true;
    setSpinning(true);
    const startedAt = Date.now();
    try {
      // Silent, so the page updates in place instead of collapsing to skeletons
      // — the spinning icon is the feedback.
      await refresh({ silent: true });
    } catch (err) {
      console.error(err);
      toast.error(errorMessage);
    } finally {
      const elapsed = Date.now() - startedAt;
      setTimeout(
        () => {
          busy.current = false;
          setSpinning(false);
        },
        Math.max(0, MIN_SPIN_MS - elapsed)
      );
    }
  }

  return (
    <button
      type="button"
      onClick={sync}
      aria-label={label}
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors active:bg-gray-100",
        className
      )}
    >
      <RefreshCw className={cn("size-4", spinning && "animate-spin")} />
    </button>
  );
}
