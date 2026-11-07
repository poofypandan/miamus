/**
 * Opens one overlay right after another closed (Codex review, PR #9).
 *
 * Closing a sheet pops its history entry asynchronously (useBackToClose).
 * Opening the next sheet in the same moment pushed its entry first, and the
 * late pop then closed it as if Back had been pressed. So the next one opens
 * once the pop has landed — or after a moment, if there was none to pop.
 */
export function openAfterOverlayCloses(open: () => void): void {
  let opened = false;
  const run = () => {
    if (opened) return;
    opened = true;
    window.removeEventListener("popstate", run);
    open();
  };
  window.addEventListener("popstate", run, { once: true });
  window.setTimeout(run, 400);
}
