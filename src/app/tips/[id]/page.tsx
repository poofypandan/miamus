import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand/brand-mark";
import { VIDEO_TIPS, videoTip, videoTipFiles } from "@/lib/video-tips";

/**
 * One video tip on its own page (Phase 172, D12), for a link in a WhatsApp
 * message: /tips/staff-house-code. Public on purpose (the middleware guards
 * only /dashboard and /onboarding): the clips hold mock data only. It plays
 * the Indonesian version, which every tip has. A tip whose clip isn't recorded yet is "not found".
 */
export function generateStaticParams() {
  return VIDEO_TIPS.filter((tip) => tip.ready).map((tip) => ({ id: tip.id }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const tip = videoTip((await params).id);
  return { title: tip ? `${tip.title.id} - Miamus` : "Miamus" };
}

export default async function TipPage({ params }: { params: Promise<{ id: string }> }) {
  const tip = videoTip((await params).id);
  if (!tip?.ready) notFound();
  const files = videoTipFiles(tip, "id");
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center gap-4 bg-white px-4 py-6">
      <BrandMark size={40} rounded />
      <h1 className="text-center text-lg font-semibold text-gray-900">{tip.title.id}</h1>
      <video
        className="max-h-[80dvh] w-auto rounded-xl bg-slate-100"
        src={files.video}
        poster={files.poster}
        playsInline
        muted
        autoPlay
        controls
        preload="metadata"
        lang="id"
      >
        <track kind="captions" src={files.captions} srcLang="id" label={tip.title.id} default />
      </video>
    </main>
  );
}
