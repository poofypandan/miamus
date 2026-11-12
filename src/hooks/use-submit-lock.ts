"use client";

import { useMemo, useRef } from "react";

/**
 * A synchronous guard for a Save/Add button. React state (`saving`) only
 * disables the button on the next render, so two taps in the same tick both
 * pass a `if (saving) return` check and both insert (demo check F-1: two
 * "Matcha" pets 0.12 s apart). A ref is set at once, so the second tap sees it.
 *
 * Forms that close on success keep the lock held through the close animation
 * and call `release()` when they open again; forms that stay open release it
 * when the save settles.
 */
export function useSubmitLock() {
  const held = useRef(false);
  return useMemo(
    () => ({
      /** True if this call took the lock; false if a save is already running. */
      acquire() {
        if (held.current) return false;
        held.current = true;
        return true;
      },
      release() {
        held.current = false;
      },
    }),
    []
  );
}
