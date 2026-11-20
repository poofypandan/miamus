import { ImageResponse } from "next/og";
import { BrandMark, LAUNCH_BACKGROUND } from "@/components/brand/brand-mark";
import { LAUNCH_MARK_SIZE } from "@/components/brand/launch-mark-size";
import { IPHONE_SCREENS, markCentreY } from "@/lib/ios-launch-screens";

// Rendered once at build time; they only change when the logo or the list does.
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return IPHONE_SCREENS.map((s) => ({ id: s.id }));
}

/**
 * One iPhone launch screen (lib/ios-launch-screens): warm paper, the settled mark
 * at the launch stage's size and centre, in the phone's own pixels.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const screen = IPHONE_SCREENS.find((s) => s.id === id);
  if (!screen) return new Response("Not found", { status: 404 });

  const width = screen.width * screen.dpr;
  const height = screen.height * screen.dpr;
  const mark = LAUNCH_MARK_SIZE * screen.dpr;
  const top = Math.round(markCentreY(screen) * screen.dpr - mark / 2);
  return new ImageResponse(
    (
      <div style={{ width, height, display: "flex", position: "relative", background: LAUNCH_BACKGROUND }}>
        <div style={{ position: "absolute", left: (width - mark) / 2, top, display: "flex" }}>
          <BrandMark size={mark} rounded />
        </div>
      </div>
    ),
    { width, height }
  );
}
