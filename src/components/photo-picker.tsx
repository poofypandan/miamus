"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, CloudOff, Crop, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import dynamic from "next/dynamic";
import { useHousehold } from "@/context/household-context";
import { compressPhoto } from "@/lib/image";
import { cn } from "@/lib/utils";
import { photoSrc } from "@/lib/photos";
import { discardPhoto, enqueuePhoto } from "@/lib/photo-queue";
import { useQueuedPhoto } from "@/hooks/use-queued-photo";

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
  /**
   * The uncropped original behind `value`, enabling Re-crop (Phase 105).
   *
   * Pass the already-renderable src (what photoSrc returns), not the stored
   * reference — this goes straight into an <img>.
   */
  masterSrc?: string | null;
  /**
   * Let the OS offer the photo library as well as the camera (Phase 105).
   *
   * Off by default, and that default is load-bearing. Every other picker in
   * this app collects proof: a chore's before and after, a stock count, a sick
   * dog. `capture="environment"` is what makes the OS open the live camera for
   * those, and dropping it would let an old photo be filed as today's work.
   * Only the owner's pet avatar opts in, where picking the nicest existing
   * photo of the dog is the whole point.
   */
  allowGallery?: boolean;
  /**
   * Offline-first capture (Phase 138; see lib/photo-queue.ts). The photo is
   * kept on the device and `onChange` gets its final URL at once, with or
   * without signal; the upload follows in the background and the thumbnail
   * shows how it is going.
   *
   * Opt-in, and only for proof that is bound for one database write later —
   * a chore's before and after, which ensureUploaded settles before the
   * completion is saved. A caller that writes the URL straight to a row
   * would be pointing the owner at a photo still sitting on a phone.
   */
  offline?: boolean;
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
  masterSrc,
  allowGallery = false,
  offline = false,
}: PhotoPickerProps) {
  const { uploadPhoto } = useHousehold();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusyState] = useState(false);

  // One setter so no upload path can forget to report itself.
  function setBusy(next: boolean) {
    setBusyState(next);
    onBusyChange?.(next);
  }
  // What the cropper is working on: a file just chosen, or an already-stored
  // master being re-framed. Null the rest of the time.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const cropping = !!pendingFile || !!pendingUrl;

  function cancelCrop() {
    setPendingFile(null);
    setPendingUrl(null);
    setBusy(false);
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      // Offline-first keeps the original if compression fails: a 4MB photo
      // on the device beats no photo at all.
      const compressed = offline
        ? await compressPhoto(file).catch((err) => {
            console.error("Compression failed; keeping the original", err);
            return file;
          })
        : await compressPhoto(file);
      const url = offline
        ? await enqueuePhoto(compressed, pathPrefix)
        : await uploadPhoto(compressed, pathPrefix);
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
   * `cropped` is cut from the *uncompressed* original so a tight crop has full
   * resolution to draw from — compressPhoto caps the long edge at 1080, and
   * compressing first would throw away the very pixels the crop zooms into.
   * The square is then stored exactly as cut. The master is that same
   * original, compressed, so what is kept is a reasonable photo rather than a
   * 4MB camera file.
   *
   * The two run in parallel, but only the thumbnail is allowed to fail the
   * operation: it is the one every list needs. A master that does not make it
   * leaves the avatar working and the lightbox falling back to the square.
   */
  async function uploadPair(original: File, cropped: File) {
    setBusy(true);
    try {
      const [thumbUrl, masterUrl] = await Promise.all([
        // Uploaded exactly as cropToSquareFile made it (Phase 106). Running it
        // through compressPhoto as well re-encoded it a second time and shrank
        // it by 5% — harmless to the framing, but a lossy pass and a resize
        // that bought nothing for a file already capped at 512px.
        uploadPhoto(cropped, pathPrefix),
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
      setPendingFile(file);
      return;
    }
    void upload(file);
  }

  /**
   * A new square for an original that is already stored (Phase 105).
   *
   * Only the thumbnail is written: the master is the thing being re-cropped,
   * so re-uploading it would churn storage for an identical file and leave the
   * old one orphaned.
   */
  async function uploadSquareOnly(cropped: File) {
    setBusy(true);
    try {
      // As-is, for the same reason as uploadPair: the crop is already final.
      onChange(await uploadPhoto(cropped, pathPrefix));
    } catch (err) {
      console.error(err);
      toast.error(errorMessage);
    } finally {
      setBusy(false);
    }
  }

  // Takes over the picker entirely while a crop is pending — which is also
  // what triggers the lazy chunk to load.
  if (square && cropping) {
    const file = pendingFile;
    return (
      <ImageCropper
        file={file}
        url={pendingUrl}
        onCancel={cancelCrop}
        onCropped={(cropped) => {
          setPendingFile(null);
          setPendingUrl(null);
          // A freshly chosen file brings its original with it, so both halves
          // are stored — when the caller keeps a master at all. A re-crop
          // already has its master, and a caller with no `onMaster` (an
          // inventory reference photo, Phase 110) never wanted one, so both of
          // those only need the square.
          if (file && onMaster) void uploadPair(file, cropped);
          else void uploadSquareOnly(cropped);
        }}
      />
    );
  }

  if (value) {
    return (
      <div className={cn("flex flex-col items-start gap-2", className)}>
        <div className="relative w-fit">
          {offline ? (
            <QueuedThumb url={value} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoSrc(value, 320)} alt="" className="h-24 w-24 rounded-lg object-cover ring-1 ring-border" />
          )}
          <button
            type="button"
            onClick={() => {
              // A retake: the old photo is never uploaded, if it hadn't been.
              if (offline) void discardPhoto(value);
              onChange(null);
              // Clearing the picture clears both halves of it.
              onMaster?.(null);
            }}
            className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
          >
            <X className="size-3" />
          </button>
        </div>

        {/* Re-frame what is already stored, without a trip back to the camera
            roll. Also the only way to fix an avatar uploaded before the
            cropper existed, which is a whole portrait in a square box. */}
        {square && masterSrc && (
          <Button
            type="button"
            variant="outline"
            className="min-h-[40px] px-3 text-xs"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setPendingUrl(masterSrc);
            }}
          >
            <Crop className="size-3.5" /> Re-crop
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        // Absent for the owner's avatar, which is chosen from the library;
        // present everywhere else, where the photo is evidence and has to be
        // taken now. See `allowGallery`.
        capture={allowGallery ? undefined : "environment"}
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

/**
 * A photo from the offline queue (Phase 138): the copy on this device until
 * it is in storage, dimmed while it waits, with what it is waiting on in the
 * corner. Icons only — this picker is shared by both languages, so the words
 * belong to the caller (see ProofStep in finish-chore-sheet.tsx).
 */
function QueuedThumb({ url }: { url: string }) {
  const { state, localSrc, ready } = useQueuedPhoto(url);
  const src = localSrc ?? (ready && state === null ? photoSrc(url, 320) : undefined);
  return (
    <div
      className={cn(
        "relative h-24 w-24 overflow-hidden rounded-lg bg-muted ring-1",
        state === "failed" ? "ring-2 ring-destructive" : "ring-border"
      )}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className={cn(
            "h-full w-full object-cover transition-opacity",
            (state === "pending" || state === "uploading") && "opacity-60"
          )}
        />
      )}
      {state && (
        <span
          className={cn(
            "absolute bottom-1 left-1 flex size-6 items-center justify-center rounded-full shadow-sm",
            state === "failed" ? "bg-destructive text-white" : "bg-background/90 text-muted-foreground"
          )}
        >
          {state === "uploading" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : state === "pending" ? (
            <CloudOff className="size-3.5" />
          ) : (
            <AlertTriangle className="size-3.5" />
          )}
        </span>
      )}
    </div>
  );
}
