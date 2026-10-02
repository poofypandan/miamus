import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * What a tab shows when there is nothing in it yet (Phase 111): an icon, one
 * line saying what is missing, one saying what to do, and — where the viewer
 * can do it — the button that does it.
 *
 * A brand-new household meets one of these on every tab, so each one is the
 * first instruction that tab gives. A bare grey sentence read as "something
 * failed to load"; this reads as "start here".
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** The action(s), when the viewer can take one. */
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-4 py-8 text-center">
      <span
        className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        <Icon className="size-5" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex w-full flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}
