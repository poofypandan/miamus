"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The chosen pill's lift, shared by the sliding pill and the first paint. */
const LIFT = "bg-card shadow-[0_1px_2px_rgb(60_40_20/0.1),0_3px_8px_-3px_rgb(60_40_20/0.14)]";

/** Where the chosen pill sits on the track, in px from the track's padding box. */
interface PillBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Optional trailing count, e.g. how many stock checks are due. */
  badge?: ReactNode;
}

/**
 * An iOS-style two-or-more-way switch: a warm track with the active option
 * lifted out as a paper pill (21 Nov, the visual direction's PR 2: black is
 * for the action, never for "you are here"). Used where one screen holds two
 * unrelated jobs (chores vs. inventory) that should never be on screen at once.
 */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  ariaLabel,
  className,
  scrollable = false,
  size = "md",
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  className?: string;
  /**
   * Lets the track scroll sideways instead of dividing the width evenly.
   *
   * The default suits a fixed two or three options. A list driven by data —
   * the staff roster, say — has no upper bound, and at five or six names
   * equal thirds become unreadable stubs on a phone. Scrolling keeps every
   * pill legible and the aesthetic identical.
   */
  scrollable?: boolean;
  /**
   * "sm" sizes the track to its labels instead of the full width: the
   * header's Overview | Staff switch (Phase 153), which shares its row with
   * the household name.
   */
  size?: "md" | "sm";
}) {
  const track = useRef<HTMLDivElement>(null);
  /**
   * The pill slides to its new place (04, PR 7): one lifted shape under the
   * labels, moved on ease-travel, in place of a background that jumps. Until
   * it is measured (the server's paint) the chosen button carries the lift
   * itself, so nothing flashes; the first placement doesn't animate.
   */
  const [pill, setPill] = useState<PillBox | null>(null);
  const [slides, setSlides] = useState(false);
  const index = segments.findIndex((segment) => segment.value === value);
  useLayoutEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = () => {
      const chosen = el.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      if (!chosen) return setPill(null);
      const next = { left: chosen.offsetLeft, top: chosen.offsetTop, width: chosen.offsetWidth, height: chosen.offsetHeight };
      setPill((prev) =>
        prev && prev.left === next.left && prev.top === next.top && prev.width === next.width && prev.height === next.height
          ? prev
          : next
      );
    };
    measure();
    // Labels change width with the language and the font's arrival.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [index, segments.length, size]);
  // Animate from the second placement on: a frame after the first one lands.
  useLayoutEffect(() => {
    if (!pill || slides) return;
    const frame = requestAnimationFrame(() => setSlides(true));
    return () => cancelAnimationFrame(frame);
  }, [pill, slides]);
  return (
    <div
      ref={track}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "relative isolate flex gap-1 rounded-full bg-muted p-1",
        size === "sm" ? "w-auto shrink-0 gap-0.5 p-0.5" : "w-full",
        scrollable && "overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      {pill && (
        <span
          aria-hidden
          data-testid="segment-pill"
          className={cn(
            "pointer-events-none absolute left-0 top-0 -z-10 rounded-full",
            LIFT,
            slides && "transition-[translate,width] duration-[320ms] ease-travel motion-reduce:transition-none"
          )}
          style={{ translate: `${pill.left}px ${pill.top}px`, width: pill.width, height: pill.height }}
        />
      )}
      {segments.map((segment) => {
        const active = segment.value === value;
        return (
          <button
            key={segment.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(segment.value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-full font-semibold",
              size === "sm" ? "min-h-10 px-3 text-xs" : "min-h-[44px] px-3 text-sm",
              scrollable || size === "sm"
                ? "shrink-0"
                : // Three or more: each pill as wide as its label, the spare
                  // width shared out, and never two lines. Equal thirds put
                  // "Tugas Hari Ini" and "Makan malam" on two lines at 375 px
                  // (demo check P-5, P-14). Two stay equal halves.
                  segments.length >= 3
                  ? "flex-auto whitespace-nowrap"
                  : "flex-1",
              "transition-colors duration-[320ms] ease-travel motion-reduce:transition-none",
              active
                ? cn("text-foreground", !pill && LIFT)
                : "text-muted-foreground active:bg-card/50"
            )}
          >
            {segment.label}
            {segment.badge != null && (
              <span
                className={cn(
                  "flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
                  active ? "bg-muted text-foreground" : "bg-card text-foreground"
                )}
              >
                {segment.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
