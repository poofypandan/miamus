"use client";

import { useEffect, useState } from "react";
import { formatDateLocal } from "@/lib/scheduleEngine";

/**
 * Today's date, kept honest while the app sits open (Phase 98).
 *
 * Relative labels like "Today" and "Tomorrow" are only true relative to the
 * moment they were rendered, and this is a PWA people leave open — a phone on
 * a kitchen counter holds the same React tree for days. Without this, a card
 * that said "Tomorrow" last night still says "Tomorrow" this morning, which is
 * the one word it must never say about a visit happening in four hours.
 *
 * Two triggers, because either one alone leaves a gap:
 *
 *   visibilitychange — the phone was locked or the app was backgrounded across
 *                      midnight, which is the common case. Timers are throttled
 *                      or frozen while backgrounded, so the wake-up is what can
 *                      be relied on.
 *   a midnight timer — the screen stayed on and visible through midnight, which
 *                      fires no visibility event at all.
 *
 * Returns a Date whose *identity* only changes when the local calendar day
 * does, so it is safe as a useMemo dependency: a re-render that lands on the
 * same day hands back the very same object rather than invalidating everything
 * downstream 30 times a minute.
 */
export function useToday(): Date {
  const [today, setToday] = useState<Date>(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function sync() {
      // Same day: return `prev` unchanged, which React treats as no update at
      // all — no re-render, no new object for memo dependencies to notice.
      setToday((prev) => {
        const next = new Date();
        return formatDateLocal(next) === formatDateLocal(prev) ? prev : next;
      });
      schedule();
    }

    function schedule() {
      if (timer) clearTimeout(timer);
      const now = new Date();
      // setHours(24, …) is the documented way to name the start of tomorrow:
      // Date normalises the overflow, so this survives month ends, leap years
      // and DST shifts without any arithmetic of our own.
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      // A second past midnight rather than exactly on it: an early timer would
      // read the old day, find nothing changed, and reschedule for a moment
      // that has already passed.
      timer = setTimeout(sync, midnight.getTime() - now.getTime() + 1_000);
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") sync();
    }

    schedule();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return today;
}
