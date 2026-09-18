"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const PROPERTY_NAME = "Banyuwangi 11";

/**
 * The one header both views wear, so moving between the owner dashboard and
 * the staff view changes what is in it, never where anything sits (Phase 84C).
 *
 *   ┌───────────────────────────────────────┐
 *   │ Banyuwangi 11              [action]   │  fixed-height row
 *   │ [ segmented control               ]   │  optional
 *   └───────────────────────────────────────┘
 *
 * The row has a fixed height rather than hugging its contents: the action
 * slot holds a ghost button on one side and the on-duty badge on the other,
 * and those are different heights — left to size itself, the row (and
 * everything under it) would shift by a few pixels between the two views.
 *
 * Sticky, so the segmented control stays in reach while a long feed scrolls.
 * Callers render it outside PullToRefresh, so the pull moves the content
 * beneath it rather than the header itself.
 */
export function AppHeader({ action, children }: { action?: ReactNode; children?: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="flex h-17 items-center justify-between gap-2 px-4">
        <h1 className="truncate text-lg font-semibold">{PROPERTY_NAME}</h1>
        {action}
      </div>
      {children && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

/**
 * The cross-view link in the header's right slot — "Open Staff View →" on the
 * owner side, "← Owner Dashboard" on the staff side. One component so the two
 * can't drift apart: ghost, so it reads as a way out rather than an action on
 * the page. The 44px minimum is the touch target; ghost has no fill, so it
 * adds reach without adding visual weight.
 */
export function HeaderNavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" asChild className="min-h-11 shrink-0 text-muted-foreground">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
