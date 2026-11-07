"use client";

import { useCallback, useEffect, useState } from "react";
import type { OwnerLocale } from "@/lib/owner-locale";

/**
 * The language of the public screens — sign-in, the co-owner invite — before
 * anyone has signed in (Phase 150). One language at a time instead of both:
 *
 *   1. what this phone chose with the EN | ID switch, if it ever did;
 *   2. otherwise the phone's own language: Indonesian if it lists "id" (or
 *      the old "in") anywhere in its preferences, English for everything else.
 *
 * Staff phones are nearly all set to Indonesian, so staff see Indonesian
 * without doing anything; an owner whose phone is in English sees English.
 * Not English only: Indonesia is in the "low" band of the EF English
 * Proficiency Index, and signed-out staff land here too
 * (docs/phase-150-plan.md).
 */
const STORAGE_KEY = "miamus.public-locale";

export function phoneLocale(): OwnerLocale {
  if (typeof navigator === "undefined") return "en";
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return tags.some((tag) => /^(id|in)\b/i.test(tag ?? "")) ? "id" : "en";
}

/** The switch's choice on this phone, or null if it was never used. */
export function readPublicLocale(): OwnerLocale | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "en" || value === "id" ? value : null;
  } catch {
    return null;
  }
}

/** The language a public screen opens in on this phone. */
export function initialPublicLocale(): OwnerLocale {
  return readPublicLocale() ?? phoneLocale();
}

/**
 * [locale, setLocale]. `locale` is null until mounted: the server render has
 * no phone language, so callers show their splash until it is known rather
 * than flash the wrong language.
 */
export function usePublicLocale(): [OwnerLocale | null, (next: OwnerLocale) => void] {
  const [locale, setLocaleState] = useState<OwnerLocale | null>(null);

  useEffect(() => {
    setLocaleState(initialPublicLocale());
  }, []);

  const setLocale = useCallback((next: OwnerLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode: the switch still works for this visit.
    }
  }, []);

  return [locale, setLocale];
}
