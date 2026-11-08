import { cn } from "@/lib/utils";

/**
 * Kakak's small round avatar. A placeholder drawing until Poofy Labs'
 * character art exists (parent plan 0b): calm neutral colours, no extra brand
 * colour on screen.
 */
export function KakakAvatar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100",
        className
      )}
    >
      <svg viewBox="0 0 32 32" className="size-[78%]" fill="none">
        {/* Hair */}
        <path d="M7 15c0-6 4-10 9-10s9 4 9 10c0 1-1 1-1 0-1-3-4-5-8-5s-7 2-8 5c0 1-1 1-1 0Z" fill="#475569" />
        {/* Face */}
        <circle cx="16" cy="17" r="8" fill="#f1d4bd" />
        <path d="M8 15c1-4 4-6 8-6s7 2 8 6c-3-1-5-3-6-4-1 2-5 4-10 4Z" fill="#475569" />
        {/* Eyes and smile */}
        <circle cx="13" cy="18" r="1" fill="#334155" />
        <circle cx="19" cy="18" r="1" fill="#334155" />
        <path d="M13.5 21c1.5 1.2 3.5 1.2 5 0" stroke="#334155" strokeWidth="1.1" strokeLinecap="round" />
      </svg>
    </span>
  );
}
