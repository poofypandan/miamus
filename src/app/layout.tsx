import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { AppToaster } from "@/components/shared/app-toaster";
import { Providers } from "@/components/providers";
import "./globals.css";

// Named "--font-sans" (not the font's own "--font-plus-jakarta-sans") to
// match the `--font-sans: var(--font-sans)` theme token in globals.css —
// that token had nothing actually providing `--font-sans` before, so
// `font-sans` was silently falling back to the browser default.
const fontSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Miamus - Household Management",
  description: "Household management for owners and their staff",
  // No `manifest` or `icons` here: app/manifest.ts and app/icon.tsx /
  // apple-icon.tsx are file conventions, and Next links them itself (Phase 107).
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    // The label under the home-screen icon, so the short name.
    title: "Miamus",
  },
  // Next 15 renders `appleWebApp.capable` as the standardised
  // `mobile-web-app-capable` only. Older iOS Safari still keys standalone
  // launch off the Apple-prefixed name, so it's emitted explicitly too.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // Matches the html/body background exactly (globals.css paints
  // var(--background), which is pure white) and the manifest's theme_color, so
  // the phone's status bar is the same colour as the page beneath it rather
  // than a grey band above it.
  themeColor: "#ffffff",
  // Lets the page reach the physical edges of the screen instead of being
  // letterboxed inside the safe areas — which is what makes the system bars
  // blend in the installed app. The cost is that env(safe-area-inset-*) stops
  // being zero, so anything anchored to the bottom needs that padding (see the
  // wrappers in dashboard/layout.tsx, staff/page.tsx and page.tsx). iOS keeps
  // reserving the status bar because appleWebApp.statusBarStyle is "default",
  // not "black-translucent", so nothing slides under the clock.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fontSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        {/* The mobile frame (Phase 113). Every screen in this app is a phone
            screen, so on a desktop it is drawn as one: a single centred column
            the width of a large phone, lifted off a grey backdrop. Anything
            that has to sit at the bottom of the app — the tab bar — is pinned
            to this frame rather than to the browser window, which is how it
            ended up stranded off to the right on a wide screen.

            overflow-x: clip, not hidden: `hidden` makes this a scroll
            container, and position: sticky inside one sticks to it instead of
            the viewport — which would silently unstick the header and the tab
            bar. clip trims sideways overflow without that side effect. */}
        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col overflow-x-clip bg-background md:shadow-xl">
          <Providers>{children}</Providers>
        </div>
        <AppToaster />
      </body>
    </html>
  );
}
