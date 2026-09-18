"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Which segment of a SegmentedControl is showing, remembered for this browser
 * tab.
 *
 * sessionStorage rather than plain state because the camera is the one thing
 * both segmented screens send people to, and a low-memory phone can reload the
 * page on the way back — landing a staff member mid-stock-check on the task
 * list instead. Read in an effect, not during render, so the first client
 * render matches the server's (the same reason as the owner-role hydration in
 * HouseholdContext).
 */
export function useSessionSegment<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored && (allowed as readonly string[]).includes(stored)) setValue(stored as T);
    } catch {
      // Blocked storage: the fallback segment is a fine answer.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `allowed` is a literal at every call site; restoring once on mount is the point
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.sessionStorage.setItem(key, next);
      } catch {
        // Remembering is a convenience; the switch itself already happened.
      }
    },
    [key]
  );

  return [value, update];
}
