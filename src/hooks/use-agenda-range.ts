"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type AgendaRange = "day" | "week";

/**
 * The Agenda's Day | Week toggle (Phase 112), kept in the URL as ?range=week
 * — the same rule as every other toggle here (CLAUDE.md, State Persistence):
 * the pill and the list read one value, it survives the reload a phone can do
 * on the way back from the camera, and Back flips it back.
 *
 * Day is the absence of the param, so every existing link still opens on Day.
 */
export function useAgendaRange(): [AgendaRange, (next: AgendaRange) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const range: AgendaRange = searchParams.get("range") === "week" ? "week" : "day";

  function setRange(next: AgendaRange) {
    if (next === range) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "week") params.set("range", "week");
    else params.delete("range");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return [range, setRange];
}
