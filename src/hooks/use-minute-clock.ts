"use client";

import { useEffect, useState } from "react";

/**
 * The time, refreshed each minute while `enabled` (Phase 165): for what
 * changes with the clock rather than the data, like the evening summary's
 * quiet line appearing at the admin's hour on a Today left open (Codex,
 * PR #71). Returns milliseconds since the epoch.
 */
export function useMinuteClock(enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled]);
  return now;
}
