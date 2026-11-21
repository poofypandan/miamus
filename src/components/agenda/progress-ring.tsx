import type { ReactNode } from "react";

/**
 * A ring that fills with the share of a day done (Today v3, 21 Nov): the
 * status card's count and each person's circle. Drawn as two SVG circles,
 * the track and the arc, so it is crisp at any size and needs no layout.
 * `children` sits in the middle (a number, or an initial).
 */
export function ProgressRing({
  done,
  total,
  size,
  stroke = 4,
  trackClass = "stroke-black/10",
  arcClass = "stroke-done",
  children,
}: {
  done: number;
  total: number;
  /** Outer edge, in px. */
  size: number;
  stroke?: number;
  trackClass?: string;
  arcClass?: string;
  children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, Math.max(0, done / total)) : 0;
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className={trackClass} />
        {share > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c * share} ${c}`}
            className={arcClass}
          />
        )}
      </svg>
      {children}
    </span>
  );
}
