"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { replaceInPlace } from "@/lib/in-place-navigation";
import type { UnifiedAgendaEntry } from "@/lib/unified-agenda";

export type AgendaFilter = "all" | "pets" | "chores";

/**
 * The owner Agenda's All | Pets | Chores filter (Phase 132), kept in the URL
 * as ?show=pets / ?show=chores like Day | Week is (CLAUDE.md, State
 * Persistence) — "all" is the absence of the param.
 *
 * Replaced in place rather than pushed: it narrows the view you are on, it is
 * not somewhere you went, so Back leaves the Agenda instead of stepping
 * through every filter tried on the way. No fetch either way — the entries
 * are already in memory; this only chooses which of them to draw.
 */
export function useAgendaFilter(): [AgendaFilter, (next: AgendaFilter) => void] {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get("show");
  const filter: AgendaFilter = raw === "pets" || raw === "chores" ? raw : "all";

  function setFilter(next: AgendaFilter) {
    if (next === filter) return;
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("show");
    else params.set("show", next);
    const query = params.toString();
    replaceInPlace(query ? `${pathname}?${query}` : pathname);
  }

  return [filter, setFilter];
}

/** The entries a filter keeps: pet routines, chores, or both. */
export function applyAgendaFilter<T extends UnifiedAgendaEntry>(entries: T[], filter: AgendaFilter): T[] {
  if (filter === "all") return entries;
  return entries.filter((entry) => (filter === "pets" ? entry.kind === "routine" : entry.kind === "chore"));
}
