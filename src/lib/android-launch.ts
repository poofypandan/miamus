/**
 * Where an installed app's launch mark stands (21 Nov): on the screen's true
 * centre, where the phone's own splash (Android) or our launch screen
 * (iPhone, app/apple-splash) drew it. The page starts under the status bar,
 * so its centre is lower; the launch stage is lifted by the difference.
 *
 * A page can't see the system bars apart, only their sum: the screen's height
 * less the page's.
 * - iPhone (status bar "default", viewport-fit=cover): the page runs to the
 *   bottom edge, so the sum is the status bar, and the lift half of it.
 * - Android: Chrome doesn't draw an installed app edge to edge, so the page
 *   also stops above the navigation bar, taken as the 24dp gesture bar
 *   (Android's default since 10, and the owner's Pixel). The lift is half the
 *   status bar's lead over it: 21dp on that phone (66dp over 24dp). With
 *   three-button navigation (48dp) the mark sits 12dp lower than the splash.
 * Never negative, so never lower than the page's own centre.
 *
 * Self-contained, no imports: it is written into the page as an inline script
 * (app/layout.tsx) that runs before the first paint, so even the first
 * server-rendered frame stands where the launch picture did.
 */
export function launchLift(screenHeight: number, innerHeight: number, iphone: boolean): number {
  const GESTURE_BAR = 24;
  const MAX_LIFT = 48;
  const bars = screenHeight - innerHeight;
  if (!(bars > 0) || bars > 200) return 0;
  const lift = iphone ? bars / 2 : (bars - 2 * GESTURE_BAR) / 2;
  return Math.round(Math.max(0, Math.min(MAX_LIFT, lift)));
}

/**
 * The inline script: only on an installed app (standalone), it sets
 * --launch-lift on <html> for the launch stage. An iPhone is told apart the
 * way globals.css does (-webkit-touch-callout is iOS Safari's alone).
 */
export const LAUNCH_LIFT_SCRIPT = `(function(){try{if(!matchMedia("(display-mode: standalone)").matches)return;var lift=(${launchLift.toString()})(screen.height,innerHeight,CSS.supports("-webkit-touch-callout","none"));if(lift>0)document.documentElement.style.setProperty("--launch-lift",lift+"px")}catch(e){}})();`;
