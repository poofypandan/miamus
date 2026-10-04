/** Quiet frames in a row that count as "the page has settled". */
const STABLE_FRAMES = 4;

/**
 * Resolves once the page has stopped changing shape — the document's height
 * unchanged for STABLE_FRAMES frames with no skeleton on screen — or at
 * `maxMs`, so a page that never settles cannot hold a cover up forever.
 * Resolves at once when `isCurrent` turns false.
 *
 * Shared by the launch cover (Phase 123) and the navigation cover (Phase 134):
 * "the data is in" is not yet "the screen has stopped moving".
 */
export function waitForStableLayout(maxMs: number, isCurrent: () => boolean): Promise<void> {
  const startedAt = performance.now();
  return new Promise((resolve) => {
    let lastHeight = -1;
    let stableFrames = 0;
    const tick = () => {
      if (!isCurrent()) return resolve();
      const height = document.documentElement.scrollHeight;
      const settled = height === lastHeight && !document.querySelector('[data-slot="skeleton"]');
      stableFrames = settled ? stableFrames + 1 : 0;
      lastHeight = height;
      if (stableFrames >= STABLE_FRAMES || performance.now() - startedAt >= maxMs) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
