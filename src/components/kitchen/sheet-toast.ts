/**
 * A toast with Undo from a sheet that stays open (Phase 176: moving an
 * ingredient or a food). The toasts' usual place is the bottom of the
 * screen, where the bottom sheet covers them, so these go to the top. An
 * open sheet makes everything outside it untappable (Radix sets
 * pointer-events: none on the page), so these toasts take taps back; and a
 * tap on a toast (Undo) is not a tap outside the sheet, so it doesn't close
 * it. Spread `sheetToast` into the toast's options and pass
 * `keepOpenForToasts` as the SheetContent's onInteractOutside.
 */
export const sheetToast = { position: "top-center", className: "pointer-events-auto" } as const;

export function keepOpenForToasts(event: { target: EventTarget | null; preventDefault: () => void }) {
  const target = event.target;
  if (target instanceof Element && target.closest("[data-sonner-toaster]")) event.preventDefault();
}
