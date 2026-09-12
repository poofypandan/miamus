"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHousehold } from "@/context/household-context";
import { compressPhoto } from "@/lib/image";
import { cn } from "@/lib/utils";

interface PhotoPickerProps {
  pathPrefix: string;
  value?: string | null;
  onChange: (url: string | null) => void;
  label?: string;
  errorMessage?: string;
  className?: string;
}

export function PhotoPicker({
  pathPrefix,
  value,
  onChange,
  label = "Add photo",
  errorMessage = "Failed to upload photo",
  className,
}: PhotoPickerProps) {
  const { uploadPhoto } = useHousehold();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
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

  if (value) {
    return (
      <div className={cn("relative w-fit", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="" className="h-24 w-24 rounded-lg object-cover ring-1 ring-border" />
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
        {busy ? "Uploading..." : label}
      </Button>
    </>
  );
}
