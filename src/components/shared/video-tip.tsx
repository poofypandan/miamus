"use client";

import { useState } from "react";
import { PlayCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useBackToClose } from "@/hooks/use-back-to-close";
import {
  tipLocale,
  videoTip,
  videoTipFiles,
  watchLabel,
  type VideoTipId,
  type VideoTipLocale,
} from "@/lib/video-tips";

/**
 * An optional 15-second video beside a one-line instruction (Phase 172, D12):
 * a small outline button, "Watch · 15 s" / "Tonton · 15 detik", that opens
 * the clip in a bottom sheet. Never required, never opens by itself.
 *
 * Owners pass their language; staff screens pass "id" (staff tips are
 * Indonesian whatever is passed). Renders nothing until the tip's clip is
 * recorded (lib/video-tips `ready`), so a slot never points at a missing file.
 * The video loads only when the sheet opens (preload none until then).
 */
export function VideoTip({ id, locale }: { id: VideoTipId; locale: VideoTipLocale }) {
  const tip = videoTip(id);
  const [open, setOpen] = useState(false);
  useBackToClose(open, () => setOpen(false));

  if (!tip?.ready) return null;
  const lang = tipLocale(tip, locale);
  const files = videoTipFiles(tip, locale);
  const title = tip.title[lang] ?? tip.title.id;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[40px] w-fit items-center gap-1.5 rounded-lg border bg-white px-3 text-xs font-medium text-gray-900 active:bg-muted"
      >
        <PlayCircle className="size-4" aria-hidden />
        {watchLabel(tip, locale)}
      </button>
      <Sheet open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <SheetContent side="bottom" className="mx-auto max-h-[92dvh] max-w-md gap-0 rounded-t-2xl">
          <SheetHeader className="border-b">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="flex justify-center px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {open && (
              <video
                className="max-h-[70dvh] w-auto rounded-xl bg-slate-100"
                src={files.video}
                poster={files.poster}
                playsInline
                muted
                autoPlay
                controls
                preload="none"
                lang={lang}
              >
                <track kind="captions" src={files.captions} srcLang={lang} label={title} default />
              </video>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
