/**
 * Where an installed Android app's launch mark stands (21 Nov, the owner's
 * Pixel). Android draws its splash on the whole screen, so the splash's mark
 * is on the screen's centre. Our page starts under the status bar and ends
 * above the navigation bar (Chrome doesn't draw an installed app edge to
 * edge), so the page's centre is lower by half the difference between the
 * two bars: about 21dp on that phone (a 66dp status bar, a 24dp gesture bar).
 *
 * A page can't see the two bars apart, only their sum: the screen's height
 * less the page's. The navigation bar is taken as the 24dp gesture bar,
 * Android's default since 10 and what the owner's phone has; with three-button
 * navigation (48dp) the mark sits 12dp lower than the splash's, and the lift
 * is never negative, so it is never worse than before this rule.
 *
 * Self-contained, no imports: it is written into the page as an inline script
 * (app/layout.tsx) that runs before the first paint, so even the first
 * server-rendered frame stands where the splash did.
 */
export function launchLift(screenHeight: number, innerHeight: number): number {
  const GESTURE_BAR = 24;
  const MAX_LIFT = 48;
  const bars = screenHeight - innerHeight;
  if (!(bars > 0) || bars > 200) return 0;
  return Math.round(Math.max(0, Math.min(MAX_LIFT, (bars - 2 * GESTURE_BAR) / 2)));
}

/**
 * The inline script: only on an installed app (standalone) that is not an
 * iPhone, the same test as globals.css's .mark-opening, it sets --launch-lift
 * on <html> for the launch stage.
 */
export const LAUNCH_LIFT_SCRIPT = `(function(){try{if(!matchMedia("(display-mode: standalone)").matches||CSS.supports("-webkit-touch-callout","none"))return;var lift=(${launchLift.toString()})(screen.height,innerHeight);if(lift>0)document.documentElement.style.setProperty("--launch-lift",lift+"px")}catch(e){}})();`;
