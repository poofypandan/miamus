"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, X } from "lucide-react";
import { compressPhoto } from "@/lib/image";
import { photoSrc } from "@/lib/photos";
import type { FoodLocale } from "@/lib/food";

/**
 * The food's optional photo (Phase 156). Unlike PhotoPicker it uploads
 * nothing: the chosen file is compressed and held here until Save, so a
 * sheet closed without saving leaves nothing behind in storage.
 *
 * Camera or library, the phone offers both: a photo of a gift's label taken
 * yesterday is as good as one taken now.
 *
 * `value`: a File chosen now, the stored URL of the current photo, or null.
 */
export function FoodPhotoField({
  value,
  onChange,
  onBusyChange,
  locale,
}: {
  value: File | string | null;
  onChange: (next: File | null) => void;
  onBusyChange?: (busy: boolean) => void;
  locale: FoodLocale;
}) {
  const id = locale === "id";
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!(value instanceof File)) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    onBusyChange?.(true);
    try {
      onChange(await compressPhoto(file));
    } catch (err) {
      console.error(err);
      toast.error(id ? "Foto tidak bisa dipakai. Coba foto lain." : "Couldn't use that photo. Try another.");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  const src = preview ?? (typeof value === "string" ? photoSrc(value, 640) : undefined);

  if (src) {
    return (
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-36 w-full rounded-xl bg-muted object-cover" />
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={id ? "Hapus foto" : "Remove photo"}
          className="absolute top-2 right-2 flex size-9 items-center justify-center rounded-full bg-black/60 text-white"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={pick} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="flex min-h-20 w-full items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-gray-300 px-3 text-sm font-medium text-muted-foreground active:bg-muted"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
        {id ? "Tambah foto" : "Add a photo"}
        <span className="font-normal">{id ? "(boleh dikosongkan)" : "(optional)"}</span>
      </button>
    </>
  );
}
