"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_OWNER_LOCALE,
  parseOwnerLocale,
  readCachedOwnerLocale,
  writeCachedOwnerLocale,
  type OwnerLocale,
} from "@/lib/owner-locale";
import { supabase } from "@/lib/supabase/client";

interface OwnerLocaleValue {
  locale: OwnerLocale;
  /**
   * Whether this account has chosen: true, false (ask them), or null while
   * that is not known yet — offline, or still loading. Only `false` prompts.
   */
  chosen: boolean | null;
  /** True once the account's answer is in, or could not be had. */
  ready: boolean;
  /** Saves the choice to the account. Resolves false if that failed. */
  setLocale: (locale: OwnerLocale) => Promise<boolean>;
}

const OwnerLocaleContext = createContext<OwnerLocaleValue | null>(null);

// useLayoutEffect warns during the server render; it only matters in the browser.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * The owner's language for everything inside it (Phase 149). Mounted by the
 * dashboard layout and /onboarding — owner screens only. Staff screens pass
 * locale="id" to shared components and never mount this.
 */
export function OwnerLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<OwnerLocale>(DEFAULT_OWNER_LOCALE);
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [ready, setReady] = useState(false);

  // The cached choice, before the first paint, so an Indonesian owner never
  // sees the English screens flash on launch. Read here rather than in
  // useState: the server render has no localStorage, and the two would differ.
  useIsomorphicLayoutEffect(() => {
    const cached = readCachedOwnerLocale();
    if (cached) setLocaleState(cached);
    if (!supabase) {
      setChosen(cached !== null);
      setReady(true);
    }
  }, []);

  // Then the account's own answer, which wins.
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data: session } = await client.auth.getSession();
        const user = session.session?.user;
        // Staff phones (anonymous) never have an owner language.
        if (!user || user.is_anonymous) return;
        const { data, error } = await client.rpc("my_locale");
        if (cancelled || error) return;
        const saved = parseOwnerLocale(data);
        if (saved) {
          setLocaleState(saved);
          writeCachedOwnerLocale(saved);
        }
        setChosen(saved !== null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Screen readers and the browser's own translate prompt go by <html lang>.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = locale;
    return () => {
      root.lang = previous;
    };
  }, [locale]);

  const setLocale = useCallback(
    async (next: OwnerLocale) => {
      const before = locale;
      const wasChosen = chosen;
      setLocaleState(next);
      setChosen(true);
      writeCachedOwnerLocale(next);
      if (!supabase) return true;
      const { error } = await supabase.rpc("set_my_locale", { p_locale: next });
      if (!error) return true;
      console.error(error);
      setLocaleState(before);
      setChosen(wasChosen);
      writeCachedOwnerLocale(before);
      return false;
    },
    [locale, chosen]
  );

  const value = useMemo(
    () => ({ locale, chosen, ready, setLocale }),
    [locale, chosen, ready, setLocale]
  );
  return <OwnerLocaleContext.Provider value={value}>{children}</OwnerLocaleContext.Provider>;
}

/**
 * The owner's language and the means to change it. Outside the provider it
 * reads English and cannot be changed — a shared component that forgot its
 * locale prop shows what owner screens always showed.
 */
export function useOwnerLocaleContext(): OwnerLocaleValue {
  return (
    useContext(OwnerLocaleContext) ?? {
      locale: DEFAULT_OWNER_LOCALE,
      chosen: true,
      ready: true,
      setLocale: async () => false,
    }
  );
}

/** Just the language — what nearly every owner screen needs. */
export function useOwnerLocale(): OwnerLocale {
  return useOwnerLocaleContext().locale;
}

/** A translator: `t("Save", "Simpan")` → the string in the owner's language. */
export type Translate = (en: string, id: string) => string;

export function translator(locale: OwnerLocale): Translate {
  return (en, id) => (locale === "id" ? id : en);
}

/**
 * The owner's language as a translator, the English and Indonesian side by
 * side where they are used so a reviewer reads both at once (Phase 149).
 */
export function useT(): Translate {
  return translator(useOwnerLocale());
}
