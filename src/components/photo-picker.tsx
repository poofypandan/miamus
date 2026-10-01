"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { useHousehold } from "@/context/household-context";
import { compressPhoto } from "@/lib/image";
import { cn } from "@/lib/utils";
import { photoSrc } from "@/lib/photos";

/**
 * Loaded only when someone actually crops something.
 *
 * react-easy-crop is ~8kB on the wire, and a static import put it in the
 * shared chunk — which meant every staff phone downloaded a cropper it can
 * never reach, since nothing in the staff view passes `square`. Fetched on the
 * first photo pick instead, by which point the owner has just come back from a
 * file dialog. ssr:false because it measures a DOM node to lay out the crop
 * surface and has nothing to render on the server.
 */
const ImageCropper = dynamic(
  () => import("@/components/shared/image-cropper").then((m) => m.ImageCropper),
  { ssr: false }
);

interface PhotoPickerProps {
  pathPrefix: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  // Shared between the English owner dashboard and the Indonesian staff view,
  // so every piece of visible copy has to be overridable — the busy state
  // included, or the staff flow flashes "Uploading..." mid-upload.
  busyLabel?: string;
  errorMessage?: string;
  className?: string;
  /**
   * Opt in to a square crop step between choosing a photo and uploading it
   * (Phase 103).
   *
   * Off everywhere else on purpose. A proof shot of a mopped terrace or a
   * half-empty sack of food is evidence, and making someone frame it is a tap
   * they have no reason to care about. An avatar is the one photo here that
   * has to live inside a fixed square forever, which is the only case where
   * the crop is worth asking for.
   */
  square?: boolean;
}

export function PhotoPicker({
  pathPrefix,
  value,
  onChange,
  label = "Add photo",
  busyLabel = "Uploading...",
  errorMessage = "Failed to upload photo",
  className,
  square = false,
}: PhotoPickerProps) {
  const { uploadPhoto } = useHousehold();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // The chosen file, held while the crop dialog is open. Null the rest of the
  // time, which is also what closes that dialog.
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
      // Crop first, then compress: compressPhoto caps the long edge at 1080,
      // so compressing first would throw away the very pixels a tight crop is
      // about to zoom into.
      const compressed = await compressPhoto(file);
      const url = await uploadPhoto(compressed, pathPrefix);
      onChange(url);
    } catch (err) {
      console.error(err);
      toast.error(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared immediately so picking the same file twice still fires a change
    // event — otherwise a cancelled crop could not be retried with that photo.
    e.target.value = "";
    if (!file) return;
    if (square) {
      setPendingCrop(file);
      return;
    }
    void upload(file);
  }

  // Takes over the picker entirely while a crop is pending — which is also
  // what triggers the lazy chunk to load.
  if (square && pendingCrop) {
    return (
      <ImageCropper
        file={pendingCrop}
        onCancel={() => setPendingCrop(null)}
        onCropped={(cropped) => {
          setPendingCrop(null);
          void upload(cropped);
        }}
      />
    );
  }

  if (value) {
    return (
      <div className={cn("relative w-fit", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoSrc(value, 320)} alt="" className="h-24 w-24 rounded-lg object-cover ring-1 ring-border" />
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="outline"
        className={className}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="animate-spin" /> : <Camera />}
        {busy ? busyLabel : label}
      </Button>
    </>
  );
}
