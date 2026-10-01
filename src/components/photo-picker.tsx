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
  /**
   * Only meaningful with `square`: receives the uncropped original (Phase 104).
   *
   * Cropping used to be destructive — the square replaced the photo, so
   * tapping an avatar opened the crop rather than the picture it came from.
   * Both are now stored: this is the master, `onChange` is the thumbnail.
   *
   * Called with null when the picture is cleared, and also when the master
   * upload fails while the thumbnail succeeded. That is a deliberate degrade
   * rather than an error: an avatar with no master still works everywhere,
   * because petMasterUrl falls back to the square.
   */
  onMaster?: (url: string | null) => void;
  /**
   * Fires whenever an upload starts or finishes, so a form can stop someone
   * saving halfway through one (Phase 104).
   *
   * This was always racy and the dual upload made it easy to hit: tapping
   * Save while a photo was still going up saved the pet with no photo at all,
   * silently, because the picker's state had not come back yet.
   */
  onBusyChange?: (busy: boolean) => void;
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
  onMaster,
  onBusyChange,
}: PhotoPickerProps) {
  const { uploadPhoto } = useHousehold();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusyState] = useState(false);

  // One setter so no upload path can forget to report itself.
  function setBusy(next: boolean) {
    setBusyState(next);
    onBusyChange?.(next);
  }
  // The chosen file, held while the crop dialog is open. Null the rest of the
  // time, which is also what closes that dialog.
  const [pendingCrop, setPendingCrop] = useState<File | null>(null);

  async function upload(file: File) {
    setBusy(true);
    try {
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

  /**
   * The square and the photo it came from, both stored (Phase 104).
   *
   * `cropped` is derived from the *uncompressed* original so a tight crop has
   * full resolution to draw from — compressPhoto caps the long edge at 1080,
   * and compressing first would throw away the very pixels the crop zooms
   * into. The master is that same original, compressed, so what is kept is a
   * reasonable photo rather than a 4MB camera file.
   *
   * The two run in parallel, but only the thumbnail is allowed to fail the
   * operation: it is the one every list needs. A master that does not make it
   * leaves the avatar working and the lightbox falling back to the square.
   */
  async function uploadPair(original: File, cropped: File) {
    setBusy(true);
    try {
      const [thumbUrl, masterUrl] = await Promise.all([
        compressPhoto(cropped).then((f) => uploadPhoto(f, pathPrefix)),
        compressPhoto(original)
          .then((f) => uploadPhoto(f, pathPrefix))
          .catch((err) => {
            console.error("Master photo upload failed; keeping the crop only", err);
            return null;
          }),
      ]);
      onChange(thumbUrl);
      onMaster?.(masterUrl);
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
      // Busy from here, not from the upload: the owner is mid-crop, and a pet
      // saved now would be saved without the photo they just chose.
      setBusy(true);
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
        onCancel={() => {
          setPendingCrop(null);
          setBusy(false);
        }}
        onCropped={(cropped) => {
          // The pending file is the untouched original; `cropped` is the
          // square cut from it. Both are wanted.
          void uploadPair(pendingCrop, cropped);
          setPendingCrop(null);
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
          onClick={() => {
            onChange(null);
            // Clearing the picture clears both halves of it.
            onMaster?.(null);
          }}
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
