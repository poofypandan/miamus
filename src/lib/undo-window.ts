// How long after creating something a staff member may still take it back.
// Shared by photo deletion, stock reports, routine proposals and extra logs so
// the grace period is one number rather than four that drift apart.
export const UNDO_WINDOW_MS = 5 * 60 * 1000;

/**
 * True while `createdAt` is still inside the undo window.
 *
 * NaN-safe: an unparseable timestamp returns false, closing the window rather
 * than leaving it permanently open.
 */
export function isWithinUndoWindow(createdAt: string, now: number = Date.now()): boolean {
  return now < new Date(createdAt).getTime() + UNDO_WINDOW_MS;
}
