import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
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
  title: "Banyuwangi 11",
  description: "Household management app",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Banyuwangi 11",
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
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}
