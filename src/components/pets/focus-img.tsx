"use client";

import { useEffect, useRef, useState } from "react";
import { coverPosition } from "@/lib/pets";

/**
 * A photo that covers its box with a chosen point at the box's centre (the
 * framed square's centre on a pet), as far as the photo's edges allow
 * (Codex, PR #197). Its own size is watched, so a tile that changes shape
 * (a pet added, the phone turned) re-centres.
 */
export function FocusImg({
  src,
  focus,
  className,
  loading,
}: {
  src: string | undefined;
  focus: { x: number; y: number };
  className?: string;
  loading?: "lazy" | "eager";
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [image, setImage] = useState<{ width: number; height: number } | null>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Already in the cache, loaded before onLoad was attached.
    if (el.complete && el.naturalWidth) setImage({ width: el.naturalWidth, height: el.naturalHeight });
    const observer = new ResizeObserver(([entry]) =>
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height })
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [src]);

  const position = coverPosition(focus, image, box);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={ref}
      src={src}
      alt=""
      loading={loading}
      onLoad={(event) =>
        setImage({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
      }
      className={className}
      style={{ objectPosition: `${position.x}% ${position.y}%` }}
    />
  );
}
