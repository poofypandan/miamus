"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, X } from "lucide-react";
import { useVersionCheck } from "@/hooks/use-version-check";

const TOAST_ID = "miamus-update-available";

/**
 * The over-the-air update prompt (Phase 137). When useVersionCheck sees a
 * newer deployment, a toast slides in at the top of the screen — out of the
 * way of the bottom sheets where photos are taken and chores are submitted —
 * and stays until it is tapped or dismissed.
 *
 * It never reloads on its own: a staff member halfway through a chore photo
 * would lose it. Tapping is the reload. Dismissing only hides it until the
 * app next comes back to the foreground, since the tab is still stale.
 *
 * Indonesian everywhere but the owner dashboard, which is English.
 */
export function UpdatePrompt() {
  const updateAvailable = useVersionCheck();
  const owner = usePathname().startsWith("/dashboard");

  useEffect(() => {
    if (!updateAvailable) return;

    const label = owner ? "Update available. Tap to reload." : "Pembaruan tersedia. Ketuk untuk memuat ulang.";
    const dismissLabel = owner ? "Dismiss" : "Tutup";

    function show() {
      toast.custom(
        (id) => (
          <div className="flex w-full items-center gap-1 rounded-xl border border-border bg-popover text-popover-foreground shadow-lg md:w-[356px]">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-3 pl-4 text-left text-sm font-medium active:opacity-70"
            >
              <RefreshCw className="size-4 shrink-0 text-muted-foreground" />
              <span>{label}</span>
            </button>
            <button
              type="button"
              aria-label={dismissLabel}
              onClick={() => toast.dismiss(id)}
              className="shrink-0 rounded-lg p-3 text-muted-foreground active:opacity-70"
            >
              <X className="size-4" />
            </button>
          </div>
        ),
        { id: TOAST_ID, duration: Infinity, position: "top-center", dismissible: false }
      );
    }

    show();
    function onVisible() {
      if (document.visibilityState === "visible") show();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [updateAvailable, owner]);

  return null;
}
