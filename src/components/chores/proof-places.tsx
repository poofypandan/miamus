"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Camera, CheckCircle2, CloudOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFormatTime } from "@/components/ui/ui-labels";
import { useHousehold } from "@/context/household-context";
import { useChoreProof } from "@/hooks/use-chore-proof";
import { useFinishChore } from "@/hooks/use-finish-chore";
import { useQueuedPhoto } from "@/hooks/use-queued-photo";
import { choreDraftKey } from "@/lib/chore-draft";
import type { ChoreOccurrence } from "@/lib/chore-recurrence";
import { compressPhoto } from "@/lib/image";
import { discardPhoto, enqueuePhoto } from "@/lib/photo-queue";
import { photoSrc, photoTakenAt } from "@/lib/photos";
import { cn } from "@/lib/utils";

/**
 * A chore's proof on the staff card itself (19 Nov, product change #2): two
 * labelled places, Sebelum and Sesudah, that are the buttons. Tap one and the
 * camera opens; the photo lands in its place with the time. The moment the
 * Sesudah photo is in beside a Sebelum one, the chore is finished, through
 * the same save as the chore's sheet (useFinishChore): photos kept on the
 * phone and sent from there on a weak signal (Phase 161), both always
 * (migrations/104). If that save didn't go through, Selesai stays on the
 * card to try again, with both photos still in place.
 *
 * Sesudah waits for Sebelum: the before photo is taken as the work starts.
 * Staff-facing, so Bahasa Indonesia only.
 */
export function ChoreProofPlaces({ occurrence }: { occurrence: ChoreOccurrence }) {
  const { activeHouseholdId } = useHousehold();
  const draftKey = choreDraftKey(activeHouseholdId, occurrence.template.id, occurrence.date);
  const { before, after, setBefore, setAfter } = useChoreProof(draftKey);
  const { busy, finish } = useFinishChore(occurrence, draftKey);
  const [takingBefore, setTakingBefore] = useState(false);
  const [takingAfter, setTakingAfter] = useState(false);
  const beforeState = useQueuedPhoto(before).state;
  const afterState = useQueuedPhoto(after).state;
  const failed = beforeState === "failed" || afterState === "failed";
  // The same folder as the sheet's photos: one per chore, household-prefixed (Phase 90).
  const pathPrefix = `household/${occurrence.template.id}`;
  const taking = takingBefore || takingAfter;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-2">
        <ProofPlace
          label="Sebelum"
          url={before}
          pathPrefix={pathPrefix}
          disabled={busy}
          onBusyChange={setTakingBefore}
          onChange={(url) => {
            setBefore(url);
            // A retaken Sebelum beside a Sesudah already there finishes too.
            if (url && after && afterState !== "failed") void finish(url, after);
          }}
        />
        <ProofPlace
          label="Sesudah"
          url={after}
          pathPrefix={pathPrefix}
          disabled={busy || (!before && !after)}
          waiting={!before && !after ? "Foto sebelum dulu" : undefined}
          onBusyChange={setTakingAfter}
          onChange={(url) => {
            setAfter(url);
            if (url && before && beforeState !== "failed") void finish(before, url);
          }}
        />
      </div>
      {busy ? (
        <p className="flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Menyimpan…
        </p>
      ) : before && after && !taking ? (
        // Both photos in and still open: the save didn't go through, or the
        // phone came back to them. One tap tries again.
        <Button className="min-h-12 w-full rounded-xl text-base" disabled={failed} onClick={() => void finish(before, after)}>
          {failed ? <AlertTriangle aria-hidden /> : <CheckCircle2 aria-hidden />}
          {failed ? "Ambil ulang foto yang rusak" : "Selesai"}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One proof photo's place. Empty, it is the camera button; filled, the photo
 * with its name and time, and a small button to take it again.
 *
 * The photo goes the way PhotoPicker's offline photos go (Phase 138):
 * resized on the phone (compressPhoto), kept there (enqueuePhoto), and sent
 * in the background; the camera only, never the gallery.
 */
function ProofPlace({
  label,
  url,
  pathPrefix,
  disabled,
  waiting,
  onChange,
  onBusyChange,
}: {
  label: string;
  url: string | null;
  pathPrefix: string;
  disabled: boolean;
  /** Why it can't be tapped yet, said in the place. */
  waiting?: string;
  onChange: (url: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const formatTime = useFormatTime();
  const input = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const { state, localSrc, ready } = useQueuedPhoto(url);
  const src = url ? (localSrc ?? (ready && state === null ? photoSrc(url, 320) : undefined)) : undefined;
  const takenAt = photoTakenAt(url);

  async function take(file: File) {
    setSaving(true);
    onBusyChange(true);
    try {
      const resized = await compressPhoto(file).catch((err) => {
        console.error("Compression failed; keeping the original", err);
        return file;
      });
      onChange(await enqueuePhoto(resized, pathPrefix));
    } catch (err) {
      console.error(err);
      toast.error("Gagal mengunggah foto");
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  }

  const camera = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      aria-label={`Foto ${label}`}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void take(file);
      }}
    />
  );

  if (url) {
    const failed = state === "failed";
    return (
      <div
        className={cn(
          "relative aspect-[4/3] overflow-hidden rounded-xl bg-muted ring-1",
          failed ? "ring-2 ring-destructive" : "ring-border"
        )}
      >
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`Foto ${label}`}
            className={cn("h-full w-full object-cover", (state === "pending" || state === "uploading") && "opacity-70")}
          />
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/55 px-2 py-1 text-[13px] font-semibold text-white">
          {failed ? (
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          ) : state === "uploading" ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
          ) : state === "pending" ? (
            <CloudOff className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
          )}
          {failed ? "Foto rusak" : takenAt ? `${label} · ${formatTime(takenAt)}` : label}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            void discardPhoto(url);
            onChange(null);
          }}
          aria-label={`Hapus foto ${label}`}
          className="absolute top-1.5 right-1.5 flex size-8 items-center justify-center rounded-full bg-black/55 text-white disabled:opacity-40"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      {camera}
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => input.current?.click()}
        className={cn(
          "flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed bg-muted/40 px-2 text-center",
          "active:bg-muted disabled:opacity-60",
          waiting ? "border-border text-muted-foreground" : "border-gray-300 text-gray-900"
        )}
      >
        {saving ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <Camera className="size-6" aria-hidden />}
        <span className="text-base font-semibold">{label}</span>
        <span className="text-xs text-muted-foreground">{saving ? "Menyimpan foto…" : (waiting ?? "Ketuk untuk foto")}</span>
      </button>
    </>
  );
}
