"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

/**
 * "Open it" (Phase 176; plan section 5d): the add-food sheet, under Ready
 * to eat, opens an ingredient's sheet in the Ingredients list beside it.
 * Kitchen → Food (owners) and Dapur → Makanan (staff) wrap both sections in
 * this provider while the Ingredients list shows; the list registers how to
 * open one of its items. Elsewhere (Lapor's Makanan masuk, the leftovers
 * step) there is no provider and no list, so no button.
 */
type Opener = (id: string) => void;

const IngredientOpenerContext = createContext<{
  open: Opener;
  register: (opener: Opener | null) => void;
} | null>(null);

export function IngredientOpenerProvider({ children }: { children: ReactNode }) {
  const opener = useRef<Opener | null>(null);
  const register = useCallback((next: Opener | null) => {
    opener.current = next;
  }, []);
  const open = useCallback((id: string) => opener.current?.(id), []);
  const value = useMemo(() => ({ open, register }), [open, register]);
  return <IngredientOpenerContext.Provider value={value}>{children}</IngredientOpenerContext.Provider>;
}

/** Opens an ingredient's sheet by id, or null where no Ingredients list is on the page. */
export function useOpenIngredient(): Opener | null {
  return useContext(IngredientOpenerContext)?.open ?? null;
}

/** The Ingredients list says how to open one of its items (no-op without a provider). */
export function useRegisterIngredientOpener(opener: Opener | null) {
  const register = useContext(IngredientOpenerContext)?.register;
  useEffect(() => {
    if (!register || !opener) return;
    register(opener);
    return () => register(null);
  }, [register, opener]);
}
