"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { toast } from "sonner";
import { Check, Loader2, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cropToSquareFile, type CropArea } from "@/lib/image-crop";

/**
 * Pick the square (Phase 103).
 *
 * Sits between choosing a photo and uploading it, so what ends up in storage
 * is the square the owner framed rather than whatever `object-cover` happened
 * to centre on. A portrait photo of a standing dog, cropped by CSS, is a
 * square of its chest every time.
 *
 * A PANEL, NOT A DIALOG. The obvious shape for this was a modal, and that is
 * what it was first — but every caller is already inside a Dialog or a Sheet,
 * and a second Radix overlay nested in the first simply never rendered here.
 * Even working it would have been wrong on a phone: two overlays, two close
 * buttons and two focus traps stacked on a 390px screen. Rendered in place of
 * the picker's own button, it needs none of that and works the same wherever
 * the picker is used.
 *
 * Copy is deliberately neutral rather than localised: only the owner's avatar
 * flow opts in today, and the obvious next use is a staff proof photo, which
 * would want a dictionary rather than a rewrite.
 */
export function ImageCropper({
  file,
  onCancel,
  onCropped,
}: {
  /** The file the user just chose. */
  file: File;
  onCancel: () => void;
  onCropped: (cropped: File) => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropArea | null>(null);
  const [busy, setBusy] = useState(false);

  // Revoked when the file changes or this unmounts: these are multi-megabyte
  // camera photos, and leaking one per attempt is how a long session on a
  // cheap phone runs out of memory.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    // A new photo starts centred and unzoomed rather than inheriting the last
    // one's framing.
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setArea(null);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleCropComplete = useCallback((_: unknown, areaPixels: CropArea) => {
    setArea(areaPixels);
  }, []);

  async function confirm() {
    if (!src || !area) return;
    setBusy(true);
    try {
      onCropped(await cropToSquareFile(src, area, file.name));
    } catch (err) {
      console.error(err);
      toast.error("Could not crop that photo");
      setBusy(false);
    }
    // Deliberately no setBusy(false) on success: the parent unmounts this and
    // starts uploading, and dropping the spinner first would flash an enabled
    // button on a panel that is already going away.
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border bg-card p-2">
      {/* react-easy-crop fills its container absolutely, so it needs a
          positioned box with real height. aspect-square so what is on screen
          is exactly the shape that will be stored. */}
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black">
        {src && (
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
            showGrid={false}
            objectFit="contain"
          />
        )}
      </div>

      <p className="px-1 text-[11px] text-muted-foreground">
        Drag to move, pinch or use the slider to zoom. The square is what gets saved.
      </p>

      <label className="flex items-center gap-3 px-1">
        <ZoomIn className="size-4 shrink-0 text-muted-foreground" />
        <span className="sr-only">Zoom</span>
        {/* A native range input rather than another UI dependency: one
            control, already accessible and already touch-friendly. */}
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-6 w-full accent-zinc-900"
        />
      </label>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-[48px] flex-1"
          onClick={onCancel}
          disabled={busy}
        >
          <X /> Cancel
        </Button>
        <Button
          type="button"
          className="min-h-[48px] flex-1"
          onClick={confirm}
          disabled={busy || !area}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Check />} Use photo
        </Button>
      </div>
    </div>
  );
}
