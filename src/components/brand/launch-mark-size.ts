/**
 * The launch mark's size (20 Nov): large, to meet the phone's own splash.
 *
 * Android draws an installed web app's splash itself, at a size no web page
 * can change: the home-screen icon, cut to a 160dp circle. A web page's CSS
 * pixel is that same dp, so a 160px mark is the splash's size exactly, and the
 * hand-over from the phone's picture to ours is invisible. iPhones show our
 * own launch screen (lib/ios-launch-screens), drawn at this size too. It was
 * 88px, and the jump from the big circle to the small square was the first
 * thing owners saw.
 *
 * Its own file, with no "use client", so the server-rendered launch screens
 * (app/apple-splash) share the number with the client mark.
 */
export const LAUNCH_MARK_SIZE = 160;
