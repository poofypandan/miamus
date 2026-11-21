/**
 * The launch mark's size (21 Nov, measured on the owner's Pixel): the size
 * the phone's own splash draws it at, so the hand-over from the splash to our
 * first frame is invisible.
 *
 * An installed Android app's splash is drawn by Android, not by us: the
 * maskable icon (manifest.ts; Chrome picks a maskable icon first for the
 * splash), cut to a 240dp circle, which is Android 12's splash icon size.
 * The tile inside it is drawn at about 275dp, so the glyph (80% of the tile,
 * BrandMark's maskable scale) is a 220dp box. Measured on the owner's Pixel to
 * the pixel: a 540px circle and a 316px roof at 2.25px per dp, against our old
 * 160px mark (360px). A page's CSS pixel is that same dp.
 *
 * So the launch mark's glyph is a 220px box everywhere, and on an installed
 * Android app its tile is the splash's 240px circle around it (globals.css,
 * .mark-opening). iPhones and browser tabs keep the rounded square, its glyph
 * the same 220px, and the iPhone launch screens (app/apple-splash) draw it at
 * this size too. It was 160px and before that 88px; each time the splash's
 * big circle seemed to shrink into ours.
 *
 * Its own file, with no "use client", so the server-rendered launch screens
 * share the numbers with the client mark.
 */
export const LAUNCH_MARK_SIZE = 220;

/** Android's splash circle around that glyph (Android 12+, 240dp). */
export const ANDROID_SPLASH_CIRCLE = 240;
